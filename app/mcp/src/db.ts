/** Conexão do MCP: papel `checkroute_leitura` (só SELECT em views e colunas liberadas). */
import pg from 'pg';

pg.types.setTypeParser(pg.types.builtins.NUMERIC, (v) => Number(v));
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => Number(v));

export const DATABASE_URL_LEITURA =
  process.env.DATABASE_URL_LEITURA || 'postgres://checkroute_leitura:leitura@localhost:7432/saude_rotas';

export const pool = new pg.Pool({ connectionString: DATABASE_URL_LEITURA, max: 5 });

export async function sql<T = Record<string, unknown>>(texto: string, params: unknown[] = []): Promise<T[]> {
  return (await pool.query(texto, params)).rows as T[];
}
