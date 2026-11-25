/** Recursos de leitura do contrato (docs/DADOS.md). O front valida tudo com zod. */
import type { FastifyInstance } from 'fastify';
import { sql } from '../db.js';
import { fonteAtiva, store } from '../store.js';

export async function rotasFontes(app: FastifyInstance) {
  app.get('/rotas', () => store.rotas());
  app.get('/operacao_mes', () => store.operacaoMes());
  app.get<{ Querystring: { desde?: string } }>('/ocorrencias', (req) => store.ocorrencias(req.query.desde));
  app.get('/premissas', () => store.premissas());
  app.get('/praticas', () => store.praticas());
  app.get('/referencia', async () => [await store.referencia()]);
  app.get('/health', async () => {
    await sql('SELECT 1');
    return { ok: true, banco: 'postgres', fonte: await fonteAtiva() };
  });
}
