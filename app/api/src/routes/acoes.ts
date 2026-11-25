/** Ações validadas: o que o `httpRepo` de app/web/src/data/acoes.ts já chama. */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod/v4';
import { store } from '../store.js';

const PERNAS = ['coleta', 'transferencia', 'entrega'] as const;

const NovaAcao = z.object({
  rota_id: z.string().min(1),
  perna: z.enum(PERNAS),
  rota: z.string(),
  acao: z.string().min(1),
  acao_sugerida: z.string(),
  foco: z.string().nullable(),
  responsavel: z.string().min(1),
  prazo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.literal('Em acompanhamento').default('Em acompanhamento'),
  score_inicial: z.number().nullable(),
  validada_em: z.string(),
  validada_por: z.string().nullable(),
  pratica_id: z.string().nullable(),
});

const MudaStatus = z.object({ status: z.enum(['Concluída', 'Cancelada']) });

export async function rotasAcoes(app: FastifyInstance) {
  app.get('/acoes', async () => store.acoes());

  app.post('/acoes', async (req, reply) => {
    const r = NovaAcao.safeParse(req.body);
    if (!r.success) return reply.code(400).send({ erro: 'Ação inválida', detalhes: z.flattenError(r.error) });
    return reply.code(201).send(store.criarAcao(r.data));
  });

  app.patch<{ Params: { id: string } }>('/acoes/:id', async (req, reply) => {
    const r = MudaStatus.safeParse(req.body);
    if (!r.success) return reply.code(400).send({ erro: 'Status inválido' });
    const a = store.mudarStatusAcao(req.params.id, r.data.status);
    if (!a) return reply.code(404).send({ erro: 'Ação não encontrada' });
    return a;
  });
}
