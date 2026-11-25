import Fastify from 'fastify';
import cors from '@fastify/cors';
import { iniciarBanco } from './db.js';
import { fonteAtiva } from './store.js';
import { rotasFontes } from './routes/fontes.js';
import { rotasAcoes } from './routes/acoes.js';
import { rotasIa } from './routes/ia.js';
import { rotasContatos } from './routes/contatos.js';
import { modoIa } from './ia/index.js';

await iniciarBanco();

// bodyLimit maior por causa da foto em base64 no relato.
const app = Fastify({ logger: { level: 'info' }, bodyLimit: 15 * 1024 * 1024 });
await app.register(cors, { origin: true, methods: ['GET', 'POST', 'PATCH'] });
await app.register(rotasFontes);
await app.register(rotasAcoes);
await app.register(rotasIa);
await app.register(rotasContatos);

const port = Number(process.env.PORT || 7333);
await app.listen({ port, host: process.env.HOST || '0.0.0.0' });
app.log.info(`banco: postgres · fonte de dados: ${await fonteAtiva()} · IA: ${modoIa()}`);
