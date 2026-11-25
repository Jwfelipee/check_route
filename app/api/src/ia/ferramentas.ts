/**
 * Apoio da ação sugerida. Os dados específicos da rota vêm do servidor MCP (app/mcp), só leitura
 * e com escopo; aqui ficam o guia de boas práticas (que não está no banco de dados da operação),
 * a conferência da proposta e a assinatura que decide quando uma sugestão guardada ainda vale.
 */
import { createHash } from 'node:crypto';
import { sql } from '../db.js';
import { store } from '../store.js';
import type { Pratica, Rota } from '../types.js';
import type { SugestaoIa } from './schemas.js';

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

export async function listarPraticas(perna: string): Promise<Pratica[]> {
  return (await store.praticas()).filter((p) => p.perna === perna);
}

/** Forma enxuta do guia que a IA recebe (o `como_fazer` e a origem ficam de fora). */
export const praticaParaIa = (p: Pratica) => ({ id: p.id, gatilho: p.gatilho, titulo: p.titulo, quando_usar: p.quando_usar, acao_padrao: p.acao });

/** Valida a proposta: práticas do guia da perna, uma principal, no máximo três, todas citadas no texto. */
export async function conferirProposta(ctx: ContextoSugestao, p: SugestaoIa): Promise<string | null> {
  const guia = await listarPraticas(ctx.rota.perna);
  const ids = p.praticas.map((x) => x.id);
  const fora = ids.filter((id) => !guia.some((g) => g.id === id));
  if (fora.length) return `A prática ${fora.join(', ')} não existe no guia da perna ${ctx.rota.perna}. Use listar_praticas e escolha ids da lista.`;
  if (p.praticas.length < 1 || p.praticas.length > 3) return 'Informe de 1 a 3 práticas do guia.';
  if (new Set(ids).size !== ids.length) return 'Há prática repetida. Cite cada uma só uma vez.';
  if (p.praticas.filter((x) => x.papel === 'principal').length !== 1) return 'Marque exatamente uma prática como principal.';
  const naoCitadas = ids.filter((id) => !p.acao.includes(id));
  if (naoCitadas.length) return `O texto da ação precisa citar o id de cada prática usada, entre parênteses. Faltou: ${naoCitadas.join(', ')}.`;
  return null;
}

/**
 * Assinatura dos dados que sustentam a sugestão: números da rota no mês, ocorrências da rota
 * (inclui as registradas na demo) e ações da rota. Mudou algum, a sugestão guardada deixa de valer.
 */
export async function assinaturaDaRota(rotaId: string, numeros: Record<string, unknown>): Promise<string> {
  const [oc] = await sql<{ n: number; ultima: string | null }>(
    `SELECT count(*)::int AS n, max(criada_em)::text AS ultima FROM ocorrencias_novas WHERE dados->>'rota_id' = $1`, [rotaId]);
  const [ac] = await sql<{ n: number; estados: string | null }>(
    `SELECT count(*)::int AS n, string_agg(dados->>'status', ',' ORDER BY id) AS estados FROM acoes WHERE dados->>'rota_id' = $1`, [rotaId]);
  const ref = await store.referencia();
  const base = JSON.stringify({ rotaId, mes: ref.mes, numeros, ocorrencias_novas: oc, acoes: ac, praticas: (await store.praticas()).length });
  return createHash('sha256').update(base).digest('hex').slice(0, 16);
}
