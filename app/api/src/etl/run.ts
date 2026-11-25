/**
 * npm run etl -w app/api            → bronze (planilha) → gold
 * npm run etl -w app/api -- --gold  → só refaz o gold, sem reler a planilha
 */
import { carregarBronze } from './load-bronze.js';
import { construirGold } from './build-gold.js';
import { pool } from '../db.js';

const t0 = performance.now();
if (!process.argv.includes('--gold')) await carregarBronze();
await construirGold();
console.log(`ETL concluído em ${((performance.now() - t0) / 1000).toFixed(1)} s`);
await pool.end();
