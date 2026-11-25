/**
 * Contatos e escopo. O painel cadastra e ativa/desativa; o app de WhatsApp consulta por telefone
 * e pede o token de escopo do MCP (ambos com x-internal-token).
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod/v4';
import {
  contatoPorId, contatoPorTelefone, digitos, exigirInterno, mascararTelefone, PAPEIS, proximoId, publico,
  veTodasAsRotas, type Contato,
} from '../contatos.js';
import { sql } from '../db.js';
import { emitirToken } from '../escopo.js';
import { SEGREDO_ESCOPO } from '../ia/mcp.js';
import { store } from '../store.js';

const Novo = z.object({
  telefone: z.string().refine((t) => digitos(t).length >= 10 && digitos(t).length <= 15, 'Telefone com DDD, ex.: 5531999990000'),
  nome: z.string().trim().min(2).max(80),
  papel: z.enum(PAPEIS),
  transportadora: z.string().trim().max(80).nullable().optional(),
  rotas: z.array(z.string()).default([]),
});
// Sem Novo.partial(): o default de `rotas` apagaria as rotas quando a edição não as traz.
const Edicao = z.object({
  nome: Novo.shape.nome.optional(),
  papel: z.enum(PAPEIS).optional(),
  transportadora: z.string().trim().max(80).nullable().optional(),
  rotas: z.array(z.string()).optional(),
  ativo: z.boolean().optional(),
});

async function rotasValidas(ids: string[]) {
  const existentes = new Set((await store.rotas()).filter((r) => r.perna === 'transferencia').map((r) => r.rota_id));
  return ids.filter((id) => !existentes.has(id));
}

const visao = (c: Contato) => ({ ...publico(c), telefone: mascararTelefone(c.telefone), criado_em: c.criado_em });

export async function rotasContatos(app: FastifyInstance) {
  app.get('/contatos', async () => (await sql<Contato>('SELECT * FROM contatos ORDER BY ativo DESC, nome')).map(visao));

  app.post('/contatos', async (req, reply) => {
    const p = Novo.safeParse(req.body);
    if (!p.success) return reply.code(400).send({ erro: 'Contato inválido', detalhes: z.flattenError(p.error) });
    const d = p.data;
    const rotas = d.papel === 'gestor' ? [] : d.rotas;
    const invalidas = await rotasValidas(rotas);
    if (invalidas.length) return reply.code(400).send({ erro: `Rota de transferência desconhecida: ${invalidas.join(', ')}` });
    if (d.papel !== 'gestor' && !rotas.length) return reply.code(400).send({ erro: 'Escolha pelo menos uma rota para este contato' });
    if (await contatoPorTelefone(d.telefone)) return reply.code(409).send({ erro: 'Já existe um contato com este telefone' });
    const id = await proximoId();
    await sql('INSERT INTO contatos (id, telefone, nome, papel, transportadora, rotas) VALUES ($1, $2, $3, $4, $5, $6)',
      [id, digitos(d.telefone), d.nome, d.papel, d.transportadora ?? null, rotas]);
    return reply.code(201).send(visao((await contatoPorId(id))!));
  });

  app.patch<{ Params: { id: string } }>('/contatos/:id', async (req, reply) => {
    const p = Edicao.safeParse(req.body);
    if (!p.success) return reply.code(400).send({ erro: 'Edição inválida', detalhes: z.flattenError(p.error) });
    const atual = await contatoPorId(req.params.id);
    if (!atual) return reply.code(404).send({ erro: 'Contato não encontrado' });
    const d = { ...atual, ...p.data };
    const rotas = d.papel === 'gestor' ? [] : d.rotas;
    const invalidas = await rotasValidas(rotas);
    if (invalidas.length) return reply.code(400).send({ erro: `Rota de transferência desconhecida: ${invalidas.join(', ')}` });
    if (d.papel !== 'gestor' && !rotas.length) return reply.code(400).send({ erro: 'Escolha pelo menos uma rota para este contato' });
    await sql('UPDATE contatos SET nome = $2, papel = $3, transportadora = $4, rotas = $5, ativo = $6 WHERE id = $1',
      [atual.id, d.nome, d.papel, d.transportadora ?? null, rotas, d.ativo]);
    return visao((await contatoPorId(atual.id))!);
  });

  /** Quem pode ser o responsável de uma rota (sem telefone): sugestão no "Validar e acompanhar". */
  app.get<{ Params: { id: string } }>('/rotas/:id/responsaveis', async (req) => {
    const cs = await sql<Contato>(
      `SELECT * FROM contatos WHERE ativo AND papel <> 'motorista' AND (papel = 'gestor' OR $1 = ANY(rotas)) ORDER BY nome`, [req.params.id]);
    return cs.map(publico);
  });

  // ---------- uso interno (app de WhatsApp) ----------

  app.get<{ Params: { tel: string } }>('/contatos/por-telefone/:tel', async (req, reply) => {
    if (!exigirInterno(req, reply)) return;
    const c = await contatoPorTelefone(req.params.tel);
    if (!c) return reply.code(404).send({ erro: 'Número não cadastrado' });
    const nomes = new Map((await store.rotas()).map((r) => [r.rota_id, r.rota]));
    const rotas = veTodasAsRotas(c) ? [...nomes.keys()] : c.rotas;
    return { ...publico(c), rotas: rotas.map((id) => ({ rota_id: id, rota: nomes.get(id) ?? id })), todas_as_rotas: veTodasAsRotas(c) };
  });

  /** Token curto do MCP com as rotas deste contato (o MCP só confia nele, nunca no que o modelo pedir). */
  app.post<{ Params: { id: string } }>('/contatos/:id/escopo', async (req, reply) => {
    if (!exigirInterno(req, reply)) return;
    const c = await contatoPorId(req.params.id);
    if (!c || !c.ativo) return reply.code(404).send({ erro: 'Contato não encontrado ou inativo' });
    const token = emitirToken({ sub: c.id, papel: c.papel, rotas: veTodasAsRotas(c) ? '*' : c.rotas }, SEGREDO_ESCOPO(), 900);
    return { token, expira_em_s: 900 };
  });
}
