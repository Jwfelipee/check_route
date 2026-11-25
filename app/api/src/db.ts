/**
 * Banco Postgres da API (DATABASE_URL).
 * Guarda: ações validadas, ocorrências criadas na demo, uso da IA e,
 * depois do `npm run etl`, as tabelas bronze_* e gold_* da base real.
 */
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const aqui = dirname(fileURLToPath(import.meta.url));
export const API_DIR = resolve(aqui, '..');
export const WEB_DATA_DIR = process.env.WEB_DATA_DIR || resolve(API_DIR, '../web/public/data');

// O .env é lido aqui porque este módulo é o primeiro a precisar das variáveis.
const envFile = resolve(API_DIR, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

export const DATABASE_URL = process.env.DATABASE_URL || 'postgres://saude:saude@localhost:7432/saude_rotas';

// Números do Postgres (NUMERIC/BIGINT) chegariam como texto; o contrato usa number.
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (v) => Number(v));
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => Number(v));

export const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 10 });

export async function sql<T = Record<string, unknown>>(texto: string, params: unknown[] = []): Promise<T[]> {
  const r = await pool.query(texto, params);
  return r.rows as T[];
}

export async function transacao<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const r = await fn(c);
    await c.query('COMMIT');
    return r;
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}

export async function tabelaExiste(nome: string): Promise<boolean> {
  const [r] = await sql<{ ok: boolean }>('SELECT to_regclass($1) IS NOT NULL AS ok', [nome]);
  return r.ok;
}

/** INSERT em lotes (o Postgres aceita até 65.535 parâmetros por comando). */
export async function inserirEmLote(c: pg.PoolClient, tabela: string, colunas: string[], linhas: unknown[][]) {
  const porLote = Math.max(1, Math.floor(60_000 / colunas.length));
  const cols = colunas.map((x) => `"${x}"`).join(', ');
  for (let i = 0; i < linhas.length; i += porLote) {
    const lote = linhas.slice(i, i + porLote);
    const valores = lote
      .map((_, j) => `(${colunas.map((__, k) => `$${j * colunas.length + k + 1}`).join(', ')})`)
      .join(', ');
    await c.query(`INSERT INTO ${tabela} (${cols}) VALUES ${valores}`, lote.flat());
  }
}

export async function iniciarBanco() {
  await sql(`
    CREATE TABLE IF NOT EXISTS acoes (
      id TEXT PRIMARY KEY,
      dados JSONB NOT NULL
    );
    CREATE TABLE IF NOT EXISTS ocorrencias_novas (
      id TEXT PRIMARY KEY,
      criada_em TIMESTAMPTZ NOT NULL DEFAULT now(),
      dados JSONB NOT NULL
    );
    CREATE TABLE IF NOT EXISTS ia_uso (
      id SERIAL PRIMARY KEY,
      quando TIMESTAMPTZ NOT NULL DEFAULT now(),
      operacao TEXT NOT NULL,
      modelo TEXT NOT NULL,
      input_tokens INTEGER NOT NULL,
      output_tokens INTEGER NOT NULL,
      custo_usd DOUBLE PRECISION NOT NULL,
      ms INTEGER NOT NULL,
      simulado BOOLEAN NOT NULL
    );
  `);
}
