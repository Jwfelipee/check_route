/**
 * Camada bronze: copia cada aba da planilha para uma tabela bronze_<aba> no SQLite,
 * tudo como texto, sem limpar nada (a limpeza fica em build-gold.ts).
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import ExcelJS from 'exceljs';
import { API_DIR, db } from '../db.js';

export function acharPlanilha(): string {
  const candidatos = [
    process.env.BRONZE_PATH,
    resolve(API_DIR, 'data/bronze/bronze_planilha.xlsx'),
    resolve(API_DIR, '../../docs/bronze_planilha.xlsx'),
  ].filter(Boolean) as string[];
  const achado = candidatos.find((c) => existsSync(c));
  if (!achado) {
    throw new Error(`Planilha bronze não encontrada. Coloque o .xlsx em um destes caminhos:\n${candidatos.join('\n')}`);
  }
  return achado;
}

/** Converte o valor da célula para o texto que estava na planilha. */
function texto(v: ExcelJS.CellValue): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) return v.toISOString().replace('.000Z', 'Z');
  if (typeof v === 'object') {
    if ('result' in v) return texto(v.result as ExcelJS.CellValue);
    if ('richText' in v) return v.richText.map((r) => r.text).join('');
    if ('text' in v) return String(v.text);
    return JSON.stringify(v);
  }
  return String(v);
}

const ident = (s: string) => s.trim().replace(/[^a-zA-Z0-9_]/g, '_');

export async function carregarBronze(arquivo = acharPlanilha()) {
  console.log(`Lendo ${arquivo}`);
  const leitor = new ExcelJS.stream.xlsx.WorkbookReader(arquivo, { worksheets: 'emit', sharedStrings: 'cache' });
  const resumo: Record<string, number> = {};

  for await (const aba of leitor) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nome: string = (aba as any).name;
    if (!nome) continue;
    if (nome === 'Índice') {
      // Linha 2: "Posição: 2026-11-24 · extração: ..." → data de referência do painel.
      for await (const linha of aba) {
        const t = (linha.values as ExcelJS.CellValue[]).map(texto).join(' ');
        const m = t.match(/Posi[çc][ãa]o:\s*(\d{4}-\d{2}-\d{2})/);
        if (m) {
          db.exec('CREATE TABLE IF NOT EXISTS bronze_meta (chave TEXT PRIMARY KEY, valor TEXT)');
          db.prepare('INSERT OR REPLACE INTO bronze_meta VALUES (?, ?)').run('posicao', m[1]);
        }
      }
      continue;
    }
    const tabela = `bronze_${ident(nome)}`;
    let colunas: string[] | null = null;
    let insert: ReturnType<typeof db.prepare> | null = null;
    let n = 0;

    db.exec('BEGIN');
    for await (const linha of aba) {
      const valores = (linha.values as ExcelJS.CellValue[]).slice(1).map(texto);
      if (!colunas) {
        colunas = valores.map((v, i) => ident(v ?? `col_${i + 1}`));
        db.exec(`DROP TABLE IF EXISTS ${tabela}`);
        db.exec(`CREATE TABLE ${tabela} (${colunas.map((c) => `"${c}" TEXT`).join(', ')})`);
        insert = db.prepare(`INSERT INTO ${tabela} VALUES (${colunas.map(() => '?').join(', ')})`);
        continue;
      }
      if (valores.every((v) => v === null)) continue;
      const linhaCheia = colunas.map((_, i) => valores[i] ?? null);
      insert!.run(...linhaCheia);
      n++;
    }
    db.exec('COMMIT');
    resumo[tabela] = n;
    console.log(`  ${tabela}: ${n.toLocaleString('pt-BR')} linhas`);
  }
  return resumo;
}
