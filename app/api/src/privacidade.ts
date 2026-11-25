/**
 * Mascaramento de dados pessoais (critério "Dados pessoais estão protegidos?").
 *
 * Roda ANTES de o relato ir para o Claude e ANTES de gravar no banco: o modelo e o
 * painel nunca veem telefone, CPF, e-mail, nome do motorista nem a placa crua.
 * Placa e motorista viram pseudônimos estáveis (hash curto), então ainda dá para
 * cruzar ocorrências do mesmo veículo sem expor quem é.
 */
import { createHash } from 'node:crypto';

export type TipoDado = 'telefone' | 'cpf' | 'email' | 'motorista' | 'placa';

const SAL = process.env.PII_SAL || 'checkroute-hackathon';
const hash = (s: string) => createHash('sha256').update(SAL + s.toUpperCase().replace(/\W/g, '')).digest('hex').slice(0, 4);

export const pseudonimoPlaca = (placa: string) => `VEIC-${hash(placa)}`;
export const pseudonimoMotorista = (nome: string) => `Motorista #${hash(nome)}`;

// Nome próprio: uma a três palavras com inicial maiúscula (aceita acento e "de/da/dos").
const NOME = String.raw`[A-ZÀ-Ý][a-zà-ÿ]+(?:\s+(?:d[aeo]s?\s+)?[A-ZÀ-Ý][a-zà-ÿ]+){0,2}`;

interface Regra {
  tipo: TipoDado;
  re: RegExp;
  troca: (m: string, ...g: string[]) => string;
}

const REGRAS: Regra[] = [
  // Cabeçalho que o app de WhatsApp anexa ao relato: [via WhatsApp 5531999990000, João Silva]
  {
    tipo: 'motorista',
    re: new RegExp(String.raw`\[via WhatsApp\s+[^\],]*(?:,\s*(${NOME}))?\]`, 'g'),
    troca: (_m, nome) => `[via WhatsApp · ${nome ? pseudonimoMotorista(nome) : 'contato anonimizado'}]`,
  },
  { tipo: 'email', re: /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, troca: () => '[email]' },
  // CPF formatado (123.456.789-09) ou precedido da palavra CPF; 11 dígitos soltos ficam para a regra de telefone.
  { tipo: 'cpf', re: /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b|\bCPF:?\s*\d{11}\b/gi, troca: () => '[cpf]' },
  // +55 31 99999-0000 · (31) 99999-0000 · 31999990000 · 5531999990000
  {
    tipo: 'telefone',
    re: /(?:\+?55\s?)?(?:\(?\d{2}\)?\s?)9?\d{4}[-\s]?\d{4}\b/g,
    troca: () => '[telefone]',
  },
  // Placa Mercosul (ABC1D23) e antiga (ABC-1234 / ABC1234)
  { tipo: 'placa', re: /\b[A-Z]{3}-?\d[A-Z0-9]\d{2}\b/g, troca: (m) => pseudonimoPlaca(m) },
  // "motorista João Silva" / "o motorista, Maria" → pseudônimo
  {
    tipo: 'motorista',
    re: new RegExp(String.raw`\b([Mm]otorista,?\s+)(${NOME})`, 'g'),
    troca: (_m, prefixo, nome) => `${prefixo}${pseudonimoMotorista(nome).replace('Motorista ', '')}`,
  },
];

export interface Mascarado {
  texto: string;
  mascarados: TipoDado[];
}

export function mascarar(texto: string): Mascarado {
  const achados = new Set<TipoDado>();
  let t = texto;
  for (const r of REGRAS) {
    t = t.replace(r.re, (...args) => {
      achados.add(r.tipo);
      return r.troca(...(args as [string, ...string[]]));
    });
  }
  return { texto: t, mascarados: [...achados] };
}

/** Placa da ficha: guarda só o pseudônimo. Já pseudonimizada (VEIC-xxxx) passa direto. */
export function mascararPlaca(placa: string | null | undefined): string | null {
  if (!placa) return null;
  if (/^VEIC-[0-9a-f]{4}$/.test(placa)) return placa;
  return pseudonimoPlaca(placa);
}

/** Aplica o mascaramento a todos os campos de texto livre de um objeto (raso). */
export function mascararCampos<T extends Record<string, unknown>>(obj: T, campos: (keyof T)[]): { obj: T; mascarados: TipoDado[] } {
  const achados = new Set<TipoDado>();
  const saida = { ...obj };
  for (const c of campos) {
    const v = saida[c];
    if (typeof v === 'string' && v) {
      const m = mascarar(v);
      m.mascarados.forEach((x) => achados.add(x));
      (saida as Record<string, unknown>)[c as string] = m.texto;
    }
  }
  return { obj: saida, mascarados: [...achados] };
}
