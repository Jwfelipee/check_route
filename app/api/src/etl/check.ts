/**
 * npm run etl:check -w app/api
 * Compara o gold (gerado da planilha bronze) com os JSON que o front usa hoje,
 * campo a campo. Serve de evidência de que a transformação está correta.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pool, sql, tabelaExiste, WEB_DATA_DIR } from '../db.js';

type Obj = Record<string, unknown>;
const json = (n: string) => JSON.parse(readFileSync(resolve(WEB_DATA_DIR, `${n}.json`), 'utf8')) as Obj[];
const gold = (t: string) => sql<Obj>(`SELECT * FROM ${t}`);

const RECURSOS: { nome: string; tabela: string; chave: (o: Obj) => string }[] = [
  { nome: 'rotas', tabela: 'gold_rotas', chave: (o) => String(o.rota_id) },
  { nome: 'operacao_mes', tabela: 'gold_operacao_mes', chave: (o) => `${o.rota_id}|${o.mes}` },
  { nome: 'ocorrencias', tabela: 'gold_ocorrencias', chave: (o) => String(o.id) },
  { nome: 'premissas', tabela: 'gold_premissas', chave: (o) => `${o.perna}|${o.chave}` },
  { nome: 'referencia', tabela: 'gold_referencia', chave: () => 'ref' },
];

const igual = (a: unknown, b: unknown) =>
  typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) < 0.0051 : (a ?? null) === (b ?? null);

if (!(await tabelaExiste('gold_rotas'))) {
  console.error('Gold não encontrado. Rode antes: npm run etl -w app/api');
  process.exit(1);
}

let falhas = 0;
for (const r of RECURSOS) {
  const esperado = new Map(json(r.nome).map((o) => [r.chave(o), o]));
  const obtido = new Map((await gold(r.tabela)).map((o) => [r.chave(o), o]));
  const porCampo: Record<string, number> = {};
  const exemplos: string[] = [];
  let faltando = 0;
  for (const [k, e] of esperado) {
    const g = obtido.get(k);
    if (!g) {
      faltando++;
      continue;
    }
    for (const campo of Object.keys(e)) {
      if (!igual(e[campo], g[campo])) {
        porCampo[campo] = (porCampo[campo] ?? 0) + 1;
        if (exemplos.length < 3) exemplos.push(`${k}.${campo}: esperado ${JSON.stringify(e[campo])}, gold ${JSON.stringify(g[campo])}`);
      }
    }
  }
  const sobrando = [...obtido.keys()].filter((k) => !esperado.has(k)).length;
  const erros = Object.values(porCampo).reduce((a, b) => a + b, 0) + faltando + sobrando;
  falhas += erros;
  console.log(
    `${erros === 0 ? '✔' : '✘'} ${r.nome}: ${obtido.size} no gold, ${esperado.size} no JSON` +
      (erros ? ` · faltando ${faltando}, sobrando ${sobrando}, campos ${JSON.stringify(porCampo)}` : ''),
  );
  for (const ex of exemplos) console.log(`    ${ex}`);
}
console.log(falhas === 0 ? '\nGold idêntico aos dados do front.' : `\n${falhas} diferenças.`);
await pool.end();
process.exit(falhas === 0 ? 0 : 1);
