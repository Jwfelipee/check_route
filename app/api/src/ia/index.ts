/**
 * Porta de entrada da IA: escolhe Claude ou simulado, mede tempo e custo
 * e grava cada chamada em ia_uso (critério "custo e latência" / observabilidade).
 * Se o Claude falhar (rede, chave), cai no simulado e avisa na resposta.
 */
import { db } from '../db.js';
import * as claude from './claude.js';
import * as fake from './fake.js';

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

function registrar(operacao: string, meta: Meta) {
  db.prepare(
    `INSERT INTO ia_uso (quando, operacao, modelo, input_tokens, output_tokens, custo_usd, ms, simulado)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    new Date().toISOString(),
    operacao,
    meta.modelo,
    meta.input_tokens,
    meta.output_tokens,
    meta.custo_usd,
    meta.ms,
    meta.modo === 'simulado' ? 1 : 0,
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
  simulado: () => T,
): Promise<{ dados: T; meta: Meta }> {
  const t0 = performance.now();
  let aviso: string | undefined;
  if (modoIa() === 'claude') {
    try {
      const { dados, uso } = await real();
      const meta: Meta = { modo: 'claude', ms: Math.round(performance.now() - t0), ...uso, custo_usd: custo(uso) };
      registrar(operacao, meta);
      return { dados, meta };
    } catch (e) {
      aviso = `Claude indisponível (${(e as Error).message}); resposta do modo simulado.`;
    }
  }
  const dados = simulado();
  const meta: Meta = {
    modo: 'simulado',
    modelo: 'regras-simuladas',
    ms: Math.round(performance.now() - t0),
    input_tokens: 0,
    output_tokens: 0,
    custo_usd: 0,
    aviso,
  };
  registrar(operacao, meta);
  return { dados, meta };
}

export const ia = {
  extrairFicha: (a: Parameters<typeof claude.extrairFicha>[0]) =>
    executar('extrair_ficha', () => claude.extrairFicha(a), () => fake.extrairFichaFake(a)),
  sugerirAcao: (a: Parameters<typeof claude.sugerirAcao>[0]) =>
    executar('sugerir_acao', () => claude.sugerirAcao(a), () => fake.sugerirAcaoFake(a)),
  classificarRelato: (a: Parameters<typeof claude.classificarRelato>[0]) =>
    executar('classificar_relato', () => claude.classificarRelato(a), () => fake.classificarRelatoFake(a)),
};
