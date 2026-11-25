/** Configuração do app de WhatsApp, lida do ambiente (e de app/whatsapp/.env fora do Docker). */
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envFile = resolve(raiz, '.env');
if (existsSync(envFile) && !process.env.VITEST) process.loadEnvFile(envFile);

const env = (k: string, padrao = '') => process.env[k]?.trim() || padrao;

export const config = {
  porta: Number(env('PORT', '7334')),
  meta: {
    token: env('META_ACCESS_TOKEN'),
    phoneNumberId: env('META_PHONE_NUMBER_ID'),
    appSecret: env('META_APP_SECRET'),
    verifyToken: env('META_VERIFY_TOKEN'),
    versao: env('META_GRAPH_VERSION', 'v23.0'),
    dryRun: env('META_DRY_RUN') === '1' || !env('META_ACCESS_TOKEN'),
  },
  apiUrl: env('API_URL', 'http://localhost:7333').replace(/\/$/, ''),
  databaseUrl: env('DATABASE_URL', 'postgres://saude:saude@localhost:7432/saude_rotas'),
  modelo: env('WA_MODELO', 'claude-opus-5-5'),
  iaReal: env('AI_PROVIDER') !== 'fake' && !!(env('ANTHROPIC_API_KEY') || env('ANTHROPIC_AUTH_TOKEN')),
  numerosPermitidos: new Set(env('WA_NUMEROS_PERMITIDOS').split(',').map((n) => n.replace(/\D/g, '')).filter(Boolean)),
};

export const numeroPermitido = (wa: string) => config.numerosPermitidos.size === 0 || config.numerosPermitidos.has(wa.replace(/\D/g, ''));
