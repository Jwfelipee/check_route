/**
 * Estado das conversas no Postgres (mesmo banco da API, tabelas wa_*):
 *  - wa_conversa: histórico do agente, relato acumulado, ficha pendente e foto por telefone;
 *  - wa_mensagem: ids já processados (a Meta reenvia o webhook se não receber 200 a tempo);
 *  - wa_registro: trilha do que entrou na API por WhatsApp (quem confirmou, quando, ficha).
 * Uma conversa parada por mais de 6 h recomeça do zero.
 */
import pg from 'pg';
import type Anthropic from '@anthropic-ai/sdk';
import { config } from './config.js';

export const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 5 });

export interface Conversa {
  telefone: string;
  nome: string | null;
  historico: Anthropic.Beta.BetaMessageParam[];
  relato: string;
  ficha_pendente: Record<string, unknown> | null;
  faltando: string[];
  foto_media_id: string | null;
  aguardando_confirmacao: boolean;
}

const EXPIRA_HORAS = 6;

export async function iniciarEstado() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS wa_conversa (
      telefone TEXT PRIMARY KEY,
      nome TEXT,
      historico JSONB NOT NULL DEFAULT '[]',
      relato TEXT NOT NULL DEFAULT '',
      ficha_pendente JSONB,
      faltando JSONB NOT NULL DEFAULT '[]',
      foto_media_id TEXT,
      aguardando_confirmacao BOOLEAN NOT NULL DEFAULT false,
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS wa_mensagem (
      id TEXT PRIMARY KEY,
      recebida_em TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS wa_registro (
      id SERIAL PRIMARY KEY,
      telefone TEXT NOT NULL,
      ocorrencia_id TEXT NOT NULL,
      ficha JSONB NOT NULL,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

/** true na primeira vez que o id aparece; false se for reenvio da Meta. */
export async function primeiraVez(mensagemId: string): Promise<boolean> {
  const r = await pool.query('INSERT INTO wa_mensagem (id) VALUES ($1) ON CONFLICT DO NOTHING', [mensagemId]);
  return r.rowCount === 1;
}

const vazia = (telefone: string, nome: string | null): Conversa => ({
  telefone, nome, historico: [], relato: '', ficha_pendente: null, faltando: [], foto_media_id: null, aguardando_confirmacao: false,
});

export async function carregar(telefone: string, nome?: string): Promise<Conversa> {
  const { rows } = await pool.query(
    `SELECT *, atualizado_em < now() - make_interval(hours => $2) AS expirada FROM wa_conversa WHERE telefone = $1`,
    [telefone, EXPIRA_HORAS],
  );
  const r = rows[0];
  if (!r || r.expirada) return vazia(telefone, nome ?? r?.nome ?? null);
  return { ...r, nome: nome ?? r.nome } as Conversa;
}

export async function salvar(c: Conversa) {
  await pool.query(
    `INSERT INTO wa_conversa (telefone, nome, historico, relato, ficha_pendente, faltando, foto_media_id, aguardando_confirmacao, atualizado_em)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
     ON CONFLICT (telefone) DO UPDATE SET nome = $2, historico = $3, relato = $4, ficha_pendente = $5, faltando = $6,
       foto_media_id = $7, aguardando_confirmacao = $8, atualizado_em = now()`,
    [c.telefone, c.nome, JSON.stringify(c.historico), c.relato, c.ficha_pendente && JSON.stringify(c.ficha_pendente),
      JSON.stringify(c.faltando), c.foto_media_id, c.aguardando_confirmacao],
  );
}

export const recomecar = (c: Conversa): Conversa => vazia(c.telefone, c.nome);

export async function registrarTrilha(telefone: string, ocorrenciaId: string, ficha: Record<string, unknown>) {
  await pool.query('INSERT INTO wa_registro (telefone, ocorrencia_id, ficha) VALUES ($1, $2, $3)', [telefone, ocorrenciaId, JSON.stringify(ficha)]);
}
