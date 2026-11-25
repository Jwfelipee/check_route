/**
 * Servidor do agente de WhatsApp.
 *   GET  /webhook  → verificação da Meta (hub.mode, hub.verify_token, hub.challenge)
 *   POST /webhook  → mensagens recebidas (assinatura conferida, responde 200 na hora e processa em seguida)
 *   GET  /health
 */
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config } from './config.js';
import { iniciarEstado, primeiraVez } from './estado.js';
import { processar } from './agente/index.js';
import { rotasAtendimento } from './atendimento.js';
import { assinaturaValida, lerMensagens } from './meta/webhook.js';

export async function criarServidor() {
  const app = Fastify({ logger: { level: 'info' } });

  // Guarda o corpo bruto: a assinatura da Meta é calculada sobre os bytes exatos.
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, corpo, feito) => {
    (req as unknown as { corpoBruto: Buffer }).corpoBruto = corpo as Buffer;
    try { feito(null, JSON.parse((corpo as Buffer).toString('utf8') || '{}')); } catch (e) { feito(e as Error, undefined); }
  });

  // CORS só interessa ao painel (/atendimento); a Meta chama o webhook de servidor para servidor.
  await app.register(cors, {
    origin: config.corsOrigens.length ? config.corsOrigens : true,
    methods: ['GET', 'POST'],
    allowedHeaders: ['authorization', 'content-type'],
  });
  await app.register(rotasAtendimento);

  app.get('/health', async () => ({ ok: true, meta: config.meta.dryRun ? 'dry-run' : 'cloud-api', ia: config.iaReal ? config.modelo : 'simulado', api: config.apiUrl, painel: !!config.adminToken, transcricao: config.transcricao.chave ? config.transcricao.modelo : 'desligada' }));

  app.get<{ Querystring: Record<string, string> }>('/webhook', async (req, reply) => {
    const q = req.query;
    if (q['hub.mode'] === 'subscribe' && config.meta.verifyToken && q['hub.verify_token'] === config.meta.verifyToken) {
      return reply.type('text/plain').send(q['hub.challenge']);
    }
    return reply.code(403).send('verify token inválido');
  });

  app.post('/webhook', async (req, reply) => {
    const bruto = (req as unknown as { corpoBruto?: Buffer }).corpoBruto ?? Buffer.alloc(0);
    // Sem app secret só se aceita em dry-run (teste local); com a Meta de verdade a assinatura é obrigatória.
    const exigeAssinatura = !config.meta.dryRun || !!config.meta.appSecret;
    if (exigeAssinatura && !assinaturaValida(bruto, req.headers['x-hub-signature-256'] as string | undefined, config.meta.appSecret)) {
      req.log.warn('webhook com assinatura inválida');
      return reply.code(401).send();
    }
    const msgs = lerMensagens(req.body);
    // A Meta espera 200 rápido; o agente roda depois. Reenvios (mesmo id) são ignorados.
    reply.code(200).send();
    for (const m of msgs) {
      if (await primeiraVez(m.id)) void processar(m);
    }
  });

  return app;
}

if (!process.env.VITEST) {
  await iniciarEstado();
  const app = await criarServidor();
  await app.listen({ port: config.porta, host: process.env.HOST || '0.0.0.0' });
  app.log.info(`WhatsApp: ${config.meta.dryRun ? 'DRY-RUN (nada é enviado à Meta)' : 'Cloud API'} · IA: ${config.iaReal ? config.modelo : 'simulado'} · API: ${config.apiUrl}`);
}
