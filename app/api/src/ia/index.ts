/**
 * Porta de entrada da IA: escolhe Claude ou simulado, mede tempo e custo
 * e grava cada chamada em ia_uso (critério "custo e latência" / observabilidade).
 * Extração e classificação: se o Claude falhar (rede, chave), cai no simulado e avisa na resposta.
 * Ação sugerida: NÃO existe sugestão sem IA. Sem chave, sem MCP ou com falha do modelo a API
 * devolve erro com motivo (a tela mostra "Tentar de novo"); o simulado só roda com AI_PROVIDER=fake.
 */
import { sql } from '../db.js';
import * as claude from './claude.js';
import * as fake from './fake.js';
import { abrirMcp, ErroIa } from './mcp.js';
import type { ContextoSugestao } from './ferramentas.js';
import type { OpcoesSugestao, ResultadoSugestao } from './claude.js';

export type ModoIa = 'claude' | 'simulado';

export function modoIa(): ModoIa {
  if (process.env.AI_PROVIDER === 'fake') return 'simulado';
  return process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN ? 'claude' : 'simulado';
}

export interface Meta {
  modo: ModoIa;
  modelo: string;
  ms: number;
  input_tokens: number;
  output_tokens: number;
  custo_usd: number;
  aviso?: string;
}

async function registrar(operacao: string, meta: Meta) {
  await sql(
    `INSERT INTO ia_uso (operacao, modelo, input_tokens, output_tokens, custo_usd, ms, simulado)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [operacao, meta.modelo, meta.input_tokens, meta.output_tokens, meta.custo_usd, meta.ms, meta.modo === 'simulado'],
  );
}

function custo(uso: claude.Uso): number {
  const p = claude.PRECO_USD_POR_MTOK[uso.modelo];
  if (!p) return 0;
  return (uso.input_tokens * p.entrada + uso.output_tokens * p.saida) / 1_000_000;
}

async function executar<T>(
  operacao: string,
  real: () => Promise<{ dados: T; uso: claude.Uso }>,
  simulado: () => T | Promise<T>,
): Promise<{ dados: T; meta: Meta }> {
  const t0 = performance.now();
  let aviso: string | undefined;
  if (modoIa() === 'claude') {
    try {
      const { dados, uso } = await real();
      const meta: Meta = { modo: 'claude', ms: Math.round(performance.now() - t0), ...uso, custo_usd: custo(uso) };
      await registrar(operacao, meta);
      return { dados, meta };
    } catch (e) {
      aviso = `Claude indisponível (${(e as Error).message}); resposta do modo simulado.`;
    }
  }
  const dados = await simulado();
  const meta: Meta = {
    modo: 'simulado',
    modelo: 'regras-simuladas',
    ms: Math.round(performance.now() - t0),
    input_tokens: 0,
    output_tokens: 0,
    custo_usd: 0,
    aviso,
  };
  await registrar(operacao, meta);
  return { dados, meta };
}

/** Ação sugerida: Claude com as ferramentas do MCP; simulado só por AI_PROVIDER=fake explícito. */
async function sugerirAcao(ctx: ContextoSugestao, opcoes: OpcoesSugestao = {}): Promise<{ dados: ResultadoSugestao['dados']; consultas: ResultadoSugestao['consultas']; meta: Meta }> {
  const t0 = performance.now();
  const simulado = process.env.AI_PROVIDER === 'fake';
  if (!simulado && modoIa() !== 'claude') {
    throw new ErroIa('sem_chave', 'A chave da IA (ANTHROPIC_API_KEY) não está configurada.');
  }
  try {
    let r: ResultadoSugestao;
    if (simulado) {
      const conexao = await abrirMcp();
      try {
        const dados = await fake.sugerirAcaoFake(ctx, { contexto: opcoes.contexto }, conexao);
        r = { dados, consultas: conexao.chamadas, uso: { modelo: 'regras-simuladas', input_tokens: 0, output_tokens: 0 } };
      } finally {
        await conexao.fechar();
      }
    } else {
      r = await claude.sugerirAcao(ctx, opcoes);
    }
    const meta: Meta = { modo: simulado ? 'simulado' : 'claude', ms: Math.round(performance.now() - t0), ...r.uso, custo_usd: simulado ? 0 : custo(r.uso) };
    await registrar('sugerir_acao', meta);
    return { dados: r.dados, consultas: r.consultas, meta };
  } catch (e) {
    if (e instanceof ErroIa) throw e;
    throw new ErroIa('falha_ia', `A IA não conseguiu sugerir a ação (${(e as Error).message}).`);
  }
}

export const ia = {
  extrairFicha: (a: Parameters<typeof claude.extrairFicha>[0]) =>
    executar('extrair_ficha', () => claude.extrairFicha(a), () => fake.extrairFichaFake(a)),
  sugerirAcao,
  classificarRelato: (a: Parameters<typeof claude.classificarRelato>[0]) =>
    executar('classificar_relato', () => claude.classificarRelato(a), () => fake.classificarRelatoFake(a)),
};
