/**
 * Banco Postgres da API (DATABASE_URL).
 * Guarda: ações validadas, ocorrências criadas na demo, uso da IA e,
 * depois do `npm run etl`, as tabelas bronze_* e gold_* da base real.
 */
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { semearContatos } from './contatos.js';

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
    CREATE TABLE IF NOT EXISTS sugestoes_acao (
      id SERIAL PRIMARY KEY,
      rota_id TEXT NOT NULL,
      versao INTEGER NOT NULL,
      assinatura TEXT NOT NULL,
      contexto TEXT,
      sugestao JSONB NOT NULL,
      ferramentas JSONB NOT NULL DEFAULT '[]',
      modelo TEXT NOT NULL,
      uso JSONB,
      simulado BOOLEAN NOT NULL DEFAULT false,
      criada_em TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (rota_id, versao)
    );
    CREATE TABLE IF NOT EXISTS contatos (
      id TEXT PRIMARY KEY,
      telefone TEXT NOT NULL UNIQUE,
      nome TEXT NOT NULL,
      papel TEXT NOT NULL,
      transportadora TEXT,
      rotas TEXT[] NOT NULL DEFAULT '{}',
      ativo BOOLEAN NOT NULL DEFAULT true,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await prepararLeitura().catch((e) => console.warn('[db] papel de leitura do MCP não preparado:', (e as Error).message));
  await semearContatos().catch((e) => console.warn('[db] contatos de exemplo não criados:', (e as Error).message));
}

/**
 * Acesso mínimo para o servidor MCP: papel `checkroute_leitura` (login, só SELECT) e as views que ele lê.
 * - v_ocorrencias: ocorrências da base + as registradas na demo, sem relato, sem detalhes e sem quem relatou;
 * - v_sac_trecho: do relato do SAC sai só km, hora e clima (o texto fica no banco).
 * O papel não tem acesso a contatos, wa_*, ia_uso nem às colunas de placa e relato. Idempotente.
 */
export async function removerViewsLeitura() {
  await sql('DROP VIEW IF EXISTS v_sac_trecho; DROP VIEW IF EXISTS v_ocorrencias;');
}

export async function prepararLeitura() {
  if (!(await tabelaExiste('gold_ocorrencias')) || !(await tabelaExiste('bronze_sac_ocorrencias'))) return false;
  const senha = (process.env.LEITURA_PASSWORD || 'leitura').replace(/'/g, "''");
  await sql(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'checkroute_leitura') THEN
        CREATE ROLE checkroute_leitura LOGIN PASSWORD '${senha}';
      END IF;
    END $$;
    CREATE OR REPLACE VIEW v_ocorrencias AS
      SELECT id, data, mes, perna, rota_id, tipo, produto, custo, status, protocolo, canal FROM gold_ocorrencias
      UNION ALL
      SELECT id, dados->>'data', dados->>'mes', dados->>'perna', dados->>'rota_id', dados->>'tipo', dados->>'produto',
             (dados->>'custo')::float8, dados->>'status', NULL, dados->>'canal' FROM ocorrencias_novas;
    CREATE OR REPLACE VIEW v_sac_trecho AS
      SELECT protocolo, ref_tipo, ref_id, codigo_tipo,
             NULLIF(substring(relato from '[Kk][Mm]\\s*(\\d{1,4})'), '')::int AS km,
             NULLIF(substring(relato from '(\\d{1,2}):\\d{2}'), '')::int AS hora_relato,
             CASE WHEN relato ~* 'neblina' THEN 'neblina' WHEN relato ~* 'chuva' THEN 'chuva'
                  WHEN relato ~* '(tempo seco|pista seca|tempo bom)' THEN 'seco' END AS clima
        FROM bronze_sac_ocorrencias;
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM checkroute_leitura;
    GRANT CONNECT ON DATABASE ${(await sql<{ d: string }>('SELECT current_database() AS d'))[0].d} TO checkroute_leitura;
    GRANT USAGE ON SCHEMA public TO checkroute_leitura;
    GRANT SELECT ON gold_rotas, gold_operacao_mes, gold_referencia, v_ocorrencias, v_sac_trecho, acoes TO checkroute_leitura;
    GRANT SELECT (viagem_id, rota_id, tipo_veiculo, saida_cd, previsao_chegada_hub, chegada_hub, status) ON bronze_tms_viagens TO checkroute_leitura;
  `);
  return true;
}
