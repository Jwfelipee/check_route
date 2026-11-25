import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { API_DIR } from './db.js';
import { fonteAtiva } from './store.js';
import { rotasFontes } from './routes/fontes.js';
import { rotasAcoes } from './routes/acoes.js';
import { rotasIa } from './routes/ia.js';
import { modoIa } from './ia/index.js';

const envFile = resolve(API_DIR, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

// bodyLimit maior por causa da foto em base64 no relato.
const app = Fastify({ logger: { level: 'info' }, bodyLimit: 15 * 1024 * 1024 });
await app.register(cors, { origin: true, methods: ['GET', 'POST', 'PATCH'] });
await app.register(rotasFontes);
await app.register(rotasAcoes);
await app.register(rotasIa);

const port = Number(process.env.PORT || 3333);
await app.listen({ port, host: '0.0.0.0' });
app.log.info(`fonte de dados: ${fonteAtiva()} · IA: ${modoIa()}`);
