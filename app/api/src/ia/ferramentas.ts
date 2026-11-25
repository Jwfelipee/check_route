/**
 * Ferramentas que a API expõe à IA na ação sugerida (técnica "Tool use / function calling").
 *
 * A IA não recebe os dados prontos no pedido: ela CONSULTA a rota, as ocorrências e o guia
 * chamando estas funções, e só consegue responder pela ferramenta `propor_acao`, cujo
 * `run` confere se a prática existe no guia. Todas as consultas são só leitura; o score
 * e as taxas continuam calculados em código (front e API), nunca pelo modelo.
 */
import { store } from '../store.js';
import type { Pratica, Rota } from '../types.js';
import { TIPOS_ACIDENTE, type SugestaoIa } from './schemas.js';

export interface ContextoSugestao {
  rota: Rota;
  /** Números da rota calculados pelo front (lib/score.ts), enviados no pedido. */
  numeros: Record<string, unknown>;
  foco?: string | null;
  tipoMaisCaro?: string | null;
}

export interface ChamadaFerramenta {
  nome: string;
  entrada: Record<string, unknown>;
}

// ---------- o que cada ferramenta devolve (usado também pelo modo simulado) ----------

export function consultarRota(ctx: ContextoSugestao) {
  const r = ctx.rota;
  return {
    rota_id: r.rota_id,
    rota: r.rota,
    perna: r.perna,
    transportadora: r.transportadora,
    destino: r.destino,
    km: r.km,
    foco: ctx.foco ?? null,
    tipo_mais_caro: ctx.tipoMaisCaro ?? null,
    numeros_calculados: ctx.numeros,
  };
}

/** Ocorrências do mês de referência da rota, por tipo, com taxa por mil operações (viagens, na transferência). */
export async function ocorrenciasDaRota(rotaId: string) {
  const [ref, operacao, ocorrencias] = await Promise.all([store.referencia(), store.operacaoMes(), store.ocorrencias(undefined)]);
  const doMes = ocorrencias.filter((o) => o.rota_id === rotaId && o.mes === ref.mes);
  const unidades = operacao.find((op) => op.rota_id === rotaId && op.mes === ref.mes)?.unidades ?? 0;
  const porMil = (n: number) => (unidades > 0 ? Math.round((n / unidades) * 10000) / 10 : null);
  const tipos = new Map<string, { tipo: string; ocorrencias: number; custo: number; abertas: number }>();
  for (const o of doMes) {
    const t = tipos.get(o.tipo) ?? { tipo: o.tipo, ocorrencias: 0, custo: 0, abertas: 0 };
    t.ocorrencias++;
    t.custo += o.custo;
    if (o.status === 'Aberta') t.abertas++;
    tipos.set(o.tipo, t);
  }
  const acidentes = doMes.filter((o) => TIPOS_ACIDENTE.includes(o.tipo)).length;
  return {
    mes: ref.mes,
    operacoes_no_mes: unidades,
    ocorrencias: doMes.length,
    custo_total: Math.round(doMes.reduce((s, o) => s + o.custo, 0) * 100) / 100,
    ocorrencias_por_mil: porMil(doMes.length),
    acidentes,
    acidentes_por_mil: porMil(acidentes),
    por_tipo: [...tipos.values()]
      .map((t) => ({ ...t, custo: Math.round(t.custo * 100) / 100, por_mil: porMil(t.ocorrencias) }))
      .sort((a, b) => b.custo - a.custo),
  };
}

export async function listarPraticas(perna: string): Promise<Pratica[]> {
  return (await store.praticas()).filter((p) => p.perna === perna);
}

/** Valida a proposta: a prática tem de existir no guia da perna da rota. */
export async function conferirProposta(ctx: ContextoSugestao, p: SugestaoIa): Promise<string | null> {
  const guia = await listarPraticas(ctx.rota.perna);
  if (!guia.some((x) => x.id === p.pratica_id)) {
    return `A prática ${p.pratica_id} não existe no guia da perna ${ctx.rota.perna}. Use listar_praticas e escolha um id da lista.`;
  }
  return null;
}
