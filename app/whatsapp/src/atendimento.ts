/**
 * Endpoints do painel de atendimentos (aba "Atendimentos" do app/web).
 * Todos exigem Authorization: Bearer <WA_ADMIN_TOKEN>. Sem token configurado, respondem 503.
 *
 *   GET  /atendimento/conversas                    lista (últimos 7 dias, ?dias=N)
 *   GET  /atendimento/conversas/:tel               conversa + transcrição + ficha pendente
 *   POST /atendimento/conversas/:tel/reiniciar     { por, avisar? }
 *   POST /atendimento/conversas/:tel/assumir       { atendente, avisar? }
 *   POST /atendimento/conversas/:tel/devolver      { por, avisar? }
 *   POST /atendimento/conversas/:tel/mensagens     { texto }
 */
import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { config } from './config.js';
import { carregar, eventos, listarConversas } from './estado.js';
import { assumirConversa, devolverConversa, enviarComoAtendente, reiniciarConversa } from './agente/index.js';
import { faltandoNaFicha, resumoParaConfirmar } from './agente/ficha.js';

function autorizado(req: FastifyRequest): boolean {
  const h = req.headers.authorization ?? '';
  const recebido = Buffer.from(h.startsWith('Bearer ') ? h.slice(7) : '');
  const esperado = Buffer.from(config.adminToken);
  return esperado.length > 0 && recebido.length === esperado.length && timingSafeEqual(recebido, esperado);
}

const Tel = z.object({ tel: z.string().regex(/^\d{8,15}$/, 'telefone só com dígitos (DDI+DDD+número)') });
const Nome = z.string().trim().min(1).max(60);

export async function rotasAtendimento(app: FastifyInstance) {
  app.addHook('onRequest', async (req, reply) => {
    if (!req.url.startsWith('/atendimento')) return;
    if (req.method === 'OPTIONS') return;
    if (!config.adminToken) return reply.code(503).send({ erro: 'Painel de atendimentos desligado: defina WA_ADMIN_TOKEN.' });
    if (!autorizado(req)) return reply.code(401).send({ erro: 'Token inválido.' });
  });

  app.get<{ Querystring: { dias?: string } }>('/atendimento/conversas', async (req) => {
    const dias = Math.min(90, Math.max(1, Number(req.query.dias) || 7));
    return { conversas: await listarConversas(dias), modo_ia: config.iaReal ? config.modelo : 'simulado', meta: config.meta.dryRun ? 'dry-run' : 'cloud-api' };
  });

  app.get('/atendimento/conversas/:tel', async (req, reply) => {
    const p = Tel.safeParse(req.params);
    if (!p.success) return reply.code(400).send({ erro: p.error.issues[0].message });
    const c = await carregar(p.data.tel);
    const ev = await eventos(p.data.tel);
    return {
      telefone: c.telefone, nome: c.nome, modo: c.modo, atendente: c.atendente,
      aguardando_confirmacao: c.aguardando_confirmacao,
      ficha: c.ficha_pendente, faltando: c.ficha_pendente ? faltandoNaFicha(c.ficha_pendente) : [],
      resumo: c.ficha_pendente ? resumoParaConfirmar(c.ficha_pendente) : null,
      eventos: ev,
    };
  });

  const acao = (fn: (tel: string, corpo: Record<string, unknown>) => Promise<unknown>) =>
    async (req: FastifyRequest, reply: import('fastify').FastifyReply) => {
      const p = Tel.safeParse(req.params);
      if (!p.success) return reply.code(400).send({ erro: p.error.issues[0].message });
      try {
        await fn(p.data.tel, (req.body ?? {}) as Record<string, unknown>);
        return { ok: true };
      } catch (e) {
        return reply.code(e instanceof z.ZodError ? 400 : 502).send({ erro: e instanceof z.ZodError ? e.issues[0].message : (e as Error).message });
      }
    };

  app.post('/atendimento/conversas/:tel/reiniciar', acao((tel, b) =>
    reiniciarConversa(tel, Nome.parse(b.por ?? 'painel'), b.avisar === true)));

  app.post('/atendimento/conversas/:tel/assumir', acao((tel, b) =>
    assumirConversa(tel, Nome.parse(b.atendente), b.avisar !== false)));

  app.post('/atendimento/conversas/:tel/devolver', acao(async (tel, b) => {
    // O que o motorista e o atendente disseram desde que ele assumiu vira nota para o agente.
    const ev = await eventos(tel);
    const inicio = ev.map((e) => e.tipo).lastIndexOf('assumir');
    const trecho = ev.slice(inicio + 1).filter((e) => e.autor === 'motorista' || e.autor === 'atendente')
      .map((e) => `${e.autor === 'motorista' ? 'Motorista' : 'Atendente'}: ${e.texto}`).join('\n');
    await devolverConversa(tel, Nome.parse(b.por ?? 'painel'), b.avisar !== false, trecho);
  }));

  app.post('/atendimento/conversas/:tel/mensagens', acao((tel, b) =>
    enviarComoAtendente(tel, z.string().trim().min(1).max(4000).parse(b.texto))));
}
