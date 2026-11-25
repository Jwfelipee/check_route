/**
 * npm run etl -w app/api            → bronze (planilha) → gold
 * npm run etl -w app/api -- --gold  → só refaz o gold, sem reler a planilha
 * npm run etl -w app/api -- --sem-cenario → sem os acidentes plantados na T02 (gold igual aos JSON do front)
 */
import { carregarBronze } from './load-bronze.js';
import { construirGold } from './build-gold.js';
import { plantarCenarioAcidentes } from './cenario-acidentes.js';
import { pool, prepararLeitura, removerViewsLeitura } from '../db.js';

const t0 = performance.now();
await removerViewsLeitura(); // as views dependem das tabelas que o ETL recria
if (!process.argv.includes('--gold')) await carregarBronze();
// Cenário da demo (acidentes na T02). `--sem-cenario` gera o gold só com a planilha.
if (!process.argv.includes('--sem-cenario')) await plantarCenarioAcidentes();
await construirGold();
await prepararLeitura();
console.log(`ETL concluído em ${((performance.now() - t0) / 1000).toFixed(1)} s`);
await pool.end();
