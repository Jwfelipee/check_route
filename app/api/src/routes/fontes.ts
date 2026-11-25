/** Recursos de leitura do contrato (docs/DADOS.md). O front valida tudo com zod. */
import type { FastifyInstance } from 'fastify';
import { fonteAtiva, store } from '../store.js';

export async function rotasFontes(app: FastifyInstance) {
  app.get('/rotas', async () => store.rotas());
  app.get('/operacao_mes', async () => store.operacaoMes());
  app.get<{ Querystring: { desde?: string } }>('/ocorrencias', async (req) => store.ocorrencias(req.query.desde));
  app.get('/premissas', async () => store.premissas());
  app.get('/praticas', async () => store.praticas());
  app.get('/referencia', async () => [store.referencia()]);
  app.get('/health', async () => ({ ok: true, fonte: fonteAtiva() }));
}
