/**
 * Contatos: quem pode falar com o sistema pelo WhatsApp e por quais rotas responde.
 * O cadastro é feito no painel (ninguém se cadastra sozinho): número desconhecido não registra nada.
 * O telefone só sai do banco para o app de WhatsApp (com INTERNAL_TOKEN); o painel vê ele mascarado.
 */
import { timingSafeEqual } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { sql, tabelaExiste } from './db.js';

export const PAPEIS = ['motorista', 'transportadora', 'gestor'] as const;
export type PapelContato = (typeof PAPEIS)[number];

export interface Contato {
  id: string;
  telefone: string;
  nome: string;
  papel: PapelContato;
  transportadora: string | null;
  rotas: string[];
  ativo: boolean;
  criado_em: Date;
}

export const digitos = (t: string) => t.replace(/\D/g, '');

/** Celular brasileiro chega com ou sem o 9 depois do DDD: aceita as duas formas. */
export function variantesDoTelefone(t: string): string[] {
  const d = digitos(t);
  const v = new Set([d]);
  if (d.startsWith('55') && d.length === 12) v.add(`${d.slice(0, 4)}9${d.slice(4)}`);
  if (d.startsWith('55') && d.length === 13 && d[4] === '9') v.add(`${d.slice(0, 4)}${d.slice(5)}`);
  return [...v];
}

export const mascararTelefone = (t: string) => {
  const d = digitos(t);
  return d.length < 8 ? '••••' : `+${d.slice(0, 2)} ${d.slice(2, 4)} •••••${d.slice(-4)}`;
};

/** Visão segura do contato (sem telefone), para o painel e para o relato. */
export const publico = (c: Contato) => ({
  id: c.id, nome: c.nome, papel: c.papel, transportadora: c.transportadora, rotas: c.rotas, ativo: c.ativo,
});

export const veTodasAsRotas = (c: Pick<Contato, 'papel'>) => c.papel === 'gestor';

export const podeNaRota = (c: Contato, rotaId: string) => c.ativo && (veTodasAsRotas(c) || c.rotas.includes(rotaId));

export async function contatoPorId(id: string): Promise<Contato | null> {
  return (await sql<Contato>('SELECT * FROM contatos WHERE id = $1', [id]))[0] ?? null;
}

export async function contatoPorTelefone(tel: string): Promise<Contato | null> {
  return (await sql<Contato>('SELECT * FROM contatos WHERE telefone = ANY($1) ORDER BY ativo DESC LIMIT 1', [variantesDoTelefone(tel)]))[0] ?? null;
}

export async function proximoId(): Promise<string> {
  const [r] = await sql<{ n: number }>(`SELECT COALESCE(max(substring(id from 4)::int), 0) + 1 AS n FROM contatos`);
  return `CT-${String(r.n).padStart(4, '0')}`;
}

// ---------- token interno (WhatsApp → API) ----------

const INTERNO = () => process.env.INTERNAL_TOKEN || 'checkroute-interno-dev';

/** Rotas de uso interno (app de WhatsApp): exigem o cabeçalho x-internal-token. */
export function internoValido(req: FastifyRequest): boolean {
  const recebido = Buffer.from(String(req.headers['x-internal-token'] ?? ''));
  const esperado = Buffer.from(INTERNO());
  return recebido.length === esperado.length && timingSafeEqual(recebido, esperado);
}

export function exigirInterno(req: FastifyRequest, reply: FastifyReply): boolean {
  if (internoValido(req)) return true;
  void reply.code(401).send({ erro: 'Uso interno: token ausente ou inválido' });
  return false;
}

// ---------- contatos de exemplo ----------

const NOMES_MOTORISTA = ['Carlos Mendes', 'Rafael Tavares', 'Joaquim Lopes', 'Marcos Vieira', 'Edson Barros', 'Paulo Nogueira', 'Anderson Reis'];
const NOMES_RESPONSAVEL = ['Fernanda Lima', 'Patrícia Gomes', 'Renata Souza', 'Luciana Prado', 'Camila Duarte', 'Beatriz Moura', 'Helena Freitas'];

/**
 * Cria, se ainda não existirem, um motorista e um responsável da transportadora por rota de transferência
 * (nomes e telefones fictícios) e os contatos de WA_CONTATOS_DEMO ("telefone:nome:papel:T02,T05;...").
 * Quem for testar pelo WhatsApp coloca o próprio número aí.
 */
export async function semearContatos() {
  if (!(await tabelaExiste('gold_rotas'))) return;
  const rotas = await sql<{ rota_id: string; transportadora: string }>(
    `SELECT rota_id, transportadora FROM gold_rotas WHERE perna = 'transferencia' ORDER BY rota_id`);
  const novos: Omit<Contato, 'criado_em' | 'id'>[] = rotas.flatMap((r, i) => [
    { telefone: `55119900010${String(i).padStart(2, '0')}`, nome: NOMES_MOTORISTA[i % NOMES_MOTORISTA.length], papel: 'motorista' as const, transportadora: r.transportadora, rotas: [r.rota_id], ativo: true },
    { telefone: `55119900020${String(i).padStart(2, '0')}`, nome: NOMES_RESPONSAVEL[i % NOMES_RESPONSAVEL.length], papel: 'transportadora' as const, transportadora: r.transportadora, rotas: [r.rota_id], ativo: true },
  ]);
  for (const item of (process.env.WA_CONTATOS_DEMO ?? '').split(';').map((x) => x.trim()).filter(Boolean)) {
    const [tel, nome, papel, rs] = item.split(':').map((x) => x.trim());
    if (!tel || !nome || !(PAPEIS as readonly string[]).includes(papel)) continue;
    const ids = (rs ?? '').split(',').map((x) => x.trim()).filter(Boolean);
    novos.push({ telefone: digitos(tel), nome, papel: papel as PapelContato, transportadora: rotas.find((r) => r.rota_id === ids[0])?.transportadora ?? null, rotas: ids, ativo: true });
  }
  for (const c of novos) {
    if ((await sql('SELECT 1 FROM contatos WHERE telefone = $1', [c.telefone])).length) continue;
    await sql('INSERT INTO contatos (id, telefone, nome, papel, transportadora, rotas, ativo) VALUES ($1, $2, $3, $4, $5, $6, true)',
      [await proximoId(), c.telefone, c.nome, c.papel, c.transportadora, c.rotas]);
  }
}
