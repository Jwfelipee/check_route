/**
 * Eval da classificação de relatos (critério "a qualidade foi medida?").
 *
 * Gabarito: os relatos reais da planilha bronze (sac_ocorrencias), cada um com o
 * código do tipo que o SAC registrou (legado traduzido). A IA recebe só o texto do
 * relato e a operação ligada (coleta, viagem ou entrega) e escolhe o código.
 *
 *   npm run eval -w app/api                 → todos os relatos distintos
 *   npm run eval -w app/api -- --n 30       → amostra de 30
 *   npm run eval -w app/api -- --perna TRF  → só transferência
 *
 * Precisa do ETL (npm run etl -w app/api). Sem ANTHROPIC_API_KEY roda no modo
 * simulado, que serve só para testar o script: o número que vale é o do Claude.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { API_DIR, db, tabelaExiste } from '../src/db.js';
import { ia, modoIa } from '../src/ia/index.js';

const envFile = resolve(API_DIR, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const arg = (nome: string) => {
  const i = process.argv.indexOf(`--${nome}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};

if (!tabelaExiste('bronze_sac_ocorrencias')) {
  console.error('Rode antes: npm run etl -w app/api');
  process.exit(1);
}

type Tipo = { codigo: string; codigo_legado: string; descricao: string; tipo_perna: string };
const tipos = db.prepare('SELECT codigo, codigo_legado, descricao, tipo_perna FROM bronze_sac_tipos_ocorrencia').all() as Tipo[];
const atual = new Map<string, string>();
for (const t of tipos) {
  atual.set(t.codigo, t.codigo);
  atual.set(t.codigo_legado, t.codigo);
}

const linhas = db
  .prepare('SELECT relato, codigo_tipo, ref_tipo, canal FROM bronze_sac_ocorrencias')
  .all() as { relato: string; codigo_tipo: string; ref_tipo: string; canal: string }[];

// Um caso por relato distinto (a base repete o mesmo texto em vários protocolos).
const casos = new Map<string, { relato: string; esperado: string; operacao: string; canal: string }>();
for (const l of linhas) {
  const esperado = atual.get(l.codigo_tipo.trim().toUpperCase())!;
  if (!casos.has(l.relato)) casos.set(l.relato, { relato: l.relato, esperado, operacao: l.ref_tipo, canal: l.canal });
}

let lista = [...casos.values()];
const perna = arg('perna')?.toUpperCase();
if (perna) lista = lista.filter((c) => c.esperado.startsWith(perna));
const n = Number(arg('n') ?? lista.length);
// Amostra estratificada: um relato de cada tipo por vez, para todos os tipos aparecerem.
const porCodigo = new Map<string, typeof lista>();
for (const c of lista.sort((a, b) => a.relato.localeCompare(b.relato))) {
  porCodigo.set(c.esperado, [...(porCodigo.get(c.esperado) ?? []), c]);
}
const intercalada: typeof lista = [];
for (let i = 0; intercalada.length < lista.length; i++) {
  for (const l of porCodigo.values()) if (l[i]) intercalada.push(l[i]);
}
lista = intercalada.slice(0, n);

console.log(`Eval de classificação · modo ${modoIa()} · ${lista.length} relatos\n`);

const listaTipos = tipos.map((t) => ({ codigo: t.codigo, descricao: t.descricao, perna: t.tipo_perna }));
const resultados: {
  relato: string;
  esperado: string;
  obtido: string;
  acertou: boolean;
  confianca: string;
  ms: number;
  custo_usd: number;
}[] = [];

// 5 em paralelo para não estourar limite de taxa.
for (let i = 0; i < lista.length; i += 5) {
  const lote = lista.slice(i, i + 5);
  const resp = await Promise.all(
    lote.map((c) =>
      ia.classificarRelato({ relato: `Operação ligada: ${c.operacao}\n${c.relato}`, tipos: listaTipos }),
    ),
  );
  resp.forEach(({ dados, meta }, j) => {
    const c = lote[j];
    resultados.push({
      relato: c.relato,
      esperado: c.esperado,
      obtido: dados.codigo,
      acertou: dados.codigo === c.esperado,
      confianca: dados.confianca,
      ms: meta.ms,
      custo_usd: meta.custo_usd,
    });
  });
  process.stdout.write(`  ${Math.min(i + 5, lista.length)}/${lista.length}\r`);
}

const acertos = resultados.filter((r) => r.acertou).length;
const porTipo = new Map<string, { total: number; acertos: number }>();
for (const r of resultados) {
  const t = porTipo.get(r.esperado) ?? { total: 0, acertos: 0 };
  t.total++;
  if (r.acertou) t.acertos++;
  porTipo.set(r.esperado, t);
}
const pct = (a: number, b: number) => `${((100 * a) / b).toFixed(1)}%`;
const custoTotal = resultados.reduce((s, r) => s + r.custo_usd, 0);
const msMedio = resultados.reduce((s, r) => s + r.ms, 0) / resultados.length;

console.log(`\nAcerto geral: ${acertos}/${resultados.length} (${pct(acertos, resultados.length)})`);
console.log('\nPor tipo:');
for (const [t, v] of [...porTipo].sort()) {
  const desc = tipos.find((x) => x.codigo === t)?.descricao;
  console.log(`  ${t.padEnd(11)} ${desc?.padEnd(26)} ${v.acertos}/${v.total} (${pct(v.acertos, v.total)})`);
}
const erros = resultados.filter((r) => !r.acertou);
if (erros.length) {
  console.log('\nErros:');
  for (const e of erros) console.log(`  esperado ${e.esperado}, IA ${e.obtido} · "${e.relato}"`);
}
console.log(
  `\nCusto total US$ ${custoTotal.toFixed(4)} · por relato US$ ${(custoTotal / resultados.length).toFixed(5)} · ${Math.round(msMedio)} ms em média`,
);

const pasta = resolve(API_DIR, 'evals/resultados');
mkdirSync(pasta, { recursive: true });
const arquivo = resolve(pasta, `classificacao-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
writeFileSync(
  arquivo,
  JSON.stringify(
    {
      quando: new Date().toISOString(),
      modo: modoIa(),
      casos: resultados.length,
      acerto: acertos / resultados.length,
      por_tipo: Object.fromEntries(porTipo),
      custo_total_usd: custoTotal,
      ms_medio: msMedio,
      resultados,
    },
    null,
    2,
  ),
);
console.log(`Resultado salvo em ${arquivo}`);
