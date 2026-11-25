/**
 * Modo simulado (sem ANTHROPIC_API_KEY ou AI_PROVIDER=fake): regras simples
 * por palavra-chave, para a demo não travar sem rede. Não é "a IA" do pitch.
 */
import type { Pratica, Rota } from '../types.js';
import type { ClassificacaoIa, FichaIa, SugestaoIa } from './schemas.js';

const sem = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const REGRAS_TIPO: [RegExp, FichaIa['tipo']][] = [
  [/tomb/, 'Tombamento'],
  [/saiu da pista|saida de pista|ribanceira|derrap/, 'Saída de pista'],
  [/colis|bateu|batida|engavet/, 'Colisão'],
  [/freada|frenagem|freiou|frear/, 'Avaria por frenagem'],
  [/roub|assalt/, 'Roubo de carga'],
  [/extravi|sumiu|sumiram|faltando volume/, 'Extravio'],
  [/triagem|hub errado|destino errado/, 'Erro de triagem'],
  [/avaria|quebr|amass|danific/, 'Avaria no manuseio'],
];

const REGRAS_PRODUTO: [RegExp, NonNullable<FichaIa['produto']>][] = [
  [/geladeira|fogao|micro-?ondas|lavadora|eletrodom/, 'Eletrodomésticos'],
  [/celular|smartphone|\btv\b|televis|notebook|eletronic/, 'Eletrônicos'],
  [/roupa|tenis|calcad|moda/, 'Moda'],
  [/perfume|cosmet|shampoo|beleza/, 'Saúde e beleza'],
  [/movel|moveis|colchao|cama|sofa|utilidade/, 'Casa'],
];

export function extrairFichaFake(args: { rotas: Rota[]; relato: string; dataReferencia: string }): FichaIa {
  const t = sem(args.relato);
  const tipo = REGRAS_TIPO.find(([re]) => re.test(t))?.[1] ?? null;
  const rota = args.rotas.filter((r) => r.perna === 'transferencia').find((r) => r.cidade && t.includes(sem(r.cidade)));

  const dm = t.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?/);
  const hm = t.match(/(\d{1,2})[h:](\d{2})?/);
  let data_hora: string | null = null;
  if (dm || /hoje|agora/.test(t)) {
    const [ano, mes, dia] = args.dataReferencia.split('-');
    const d = dm ? `${dm[3] ?? ano}-${dm[2].padStart(2, '0')}-${dm[1].padStart(2, '0')}` : `${ano}-${mes}-${dia}`;
    data_hora = `${d}T${hm ? `${hm[1].padStart(2, '0')}:${hm[2] ?? '00'}` : '00:00'}`;
  }

  const trecho = args.relato.match(/\b(?:BR|SP|RJ|MG|PR|SC|RS|GO|BA|PE)[- ]?\d{2,3}(?:[^.;,\n]*?km\s?\d+)?/i)?.[0] ?? null;
  const placa = args.relato.toUpperCase().match(/\b[A-Z]{3}-?\d[A-Z0-9]\d{2}\b/)?.[0] ?? null;
  const custo = args.relato.match(/R\$\s?([\d.]+(?:,\d{2})?)/);
  const volumes = t.match(/(\d+)\s*(?:volumes|caixas|unidades)/);
  const vitima = /sem ferid|ninguem se feriu|sem vitima/.test(t) ? false : /vitima|ferid/.test(t) ? true : null;

  const ficha: FichaIa = {
    tipo,
    rota_id: rota?.rota_id ?? null,
    data_hora,
    trecho,
    placa,
    tipo_veiculo: /carreta/.test(t) ? 'CARRETA' : /truck/.test(t) ? 'TRUCK' : null,
    produto: REGRAS_PRODUTO.find(([re]) => re.test(t))?.[1] ?? null,
    embalagem: /palet/.test(t) ? 'paletizada' : /caixa/.test(t) ? 'caixas' : null,
    condicao_via_clima: /chuv|neblina|pista molhada|buraco/.test(t) ? 'via molhada ou ruim' : null,
    gravidade: /tomb|vitima|ferid|perda total/.test(t) ? 'grave' : tipo ? 'moderada' : null,
    volumes_afetados: volumes ? Number(volumes[1]) : null,
    custo_estimado: custo ? Number(custo[1].replace(/\./g, '').replace(',', '.')) : null,
    houve_vitima: vitima,
    resumo: args.relato.slice(0, 160),
    pergunta_ao_motorista: null,
  };
  return ficha;
}

export function sugerirAcaoFake(args: {
  rota: Rota;
  praticas: Pratica[];
  numeros: Record<string, unknown>;
  foco?: string | null;
  tipoMaisCaro?: string | null;
}): SugestaoIa {
  const casa = (p: Pratica, chave?: string | null) => Boolean(chave && p.gatilho.split('|').includes(chave));
  const pratica =
    args.praticas.find((p) => casa(p, args.tipoMaisCaro)) ??
    args.praticas.find((p) => casa(p, args.foco)) ??
    args.praticas[0];
  const usados: string[] = [];
  const valores: Record<string, unknown> = { transportadora: args.rota.transportadora, ...args.numeros };
  const acao = pratica.acao.replace(/\{(\w+)\}/g, (m, k: string) => {
    if (valores[k] === undefined || valores[k] === null) return m;
    usados.push(k);
    return String(valores[k]);
  });
  return {
    pratica_id: pratica.id,
    acao,
    justificativa: `Prática do guia ligada a ${args.tipoMaisCaro ?? args.foco ?? 'o problema da rota'} (modo simulado).`,
    numeros_usados: usados,
  };
}

export function classificarRelatoFake(args: { relato: string; tipos: { codigo: string; descricao: string }[] }): ClassificacaoIa {
  const t = sem(args.relato);
  const achado = args.tipos.find((x) => sem(x.descricao).split(' ').some((p) => p.length > 4 && t.includes(p)));
  return { codigo: achado?.codigo ?? args.tipos[0].codigo, confianca: achado ? 'media' : 'baixa' };
}
