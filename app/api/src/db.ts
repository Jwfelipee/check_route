/**
 * Banco SQLite da API (node:sqlite, sem dependência nativa).
 * Guarda: ações validadas, ocorrências criadas na demo, uso da IA e,
 * depois do `npm run etl`, as tabelas bronze_* e gold_* da base real.
 */
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const aqui = dirname(fileURLToPath(import.meta.url));
export const API_DIR = resolve(aqui, '..');
export const DATA_DIR = resolve(API_DIR, 'data');
export const WEB_DATA_DIR = resolve(API_DIR, '../web/public/data');
export const DB_PATH = process.env.DB_PATH || resolve(DATA_DIR, 'app.db');

mkdirSync(dirname(DB_PATH), { recursive: true });
export const db = new DatabaseSync(DB_PATH);

db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS acoes (
    id TEXT PRIMARY KEY,
    dados TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS ocorrencias_novas (
    id TEXT PRIMARY KEY,
    criada_em TEXT NOT NULL,
    dados TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS ia_uso (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quando TEXT NOT NULL,
    operacao TEXT NOT NULL,
    modelo TEXT NOT NULL,
    input_tokens INTEGER NOT NULL,
    output_tokens INTEGER NOT NULL,
    custo_usd REAL NOT NULL,
    ms INTEGER NOT NULL,
    simulado INTEGER NOT NULL
  );
`);

export function tabelaExiste(nome: string): boolean {
  const r = db.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`).get(nome);
  return Boolean(r);
}
