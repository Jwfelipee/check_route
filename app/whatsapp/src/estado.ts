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
import type { Contato } from './api.js';

export const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 5 });

export interface Conversa {
  telefone: string;
  nome: string | null;
  /** Quem está falando, vindo do cadastro a cada mensagem (não é guardado aqui: desativar vale na hora). */
  contato: Contato | null;
  historico: Anthropic.Beta.BetaMessageParam[];
  relato: string;
  ficha_pendente: Record<string, unknown> | null;
  faltando: string[];
  foto_media_id: string | null;
  aguardando_confirmacao: boolean;
  /** 'bot' = o agente responde; 'humano' = um atendente assumiu e o agente fica calado. */
  modo: 'bot' | 'humano';
  atendente: string | null;
}

export type Autor = 'motorista' | 'bot' | 'atendente' | 'sistema';
export interface Evento { id: number; telefone: string; autor: Autor; tipo: string; texto: string; criado_em: string }

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
    ALTER TABLE wa_conversa ADD COLUMN IF NOT EXISTS modo TEXT NOT NULL DEFAULT 'bot';
    ALTER TABLE wa_conversa ADD COLUMN IF NOT EXISTS atendente TEXT;
    ALTER TABLE wa_conversa ADD COLUMN IF NOT EXISTS iniciada_em TIMESTAMPTZ NOT NULL DEFAULT now();
    -- Transcrição legível (o histórico do agente guarda blocos da API, difíceis de mostrar).
    CREATE TABLE IF NOT EXISTS wa_evento (
      id SERIAL PRIMARY KEY,
      telefone TEXT NOT NULL,
      autor TEXT NOT NULL,
      tipo TEXT NOT NULL,
      texto TEXT NOT NULL,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS wa_evento_tel ON wa_evento (telefone, id);
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
    ALTER TABLE wa_registro ADD COLUMN IF NOT EXISTS contato_id TEXT;
  `);
}

/** true na primeira vez que o id aparece; false se for reenvio da Meta. */
export async function primeiraVez(mensagemId: string): Promise<boolean> {
  const r = await pool.query('INSERT INTO wa_mensagem (id) VALUES ($1) ON CONFLICT DO NOTHING', [mensagemId]);
  return r.rowCount === 1;
}

const vazia = (telefone: string, nome: string | null): Conversa => ({
  telefone, nome, contato: null, historico: [], relato: '', ficha_pendente: null, faltando: [], foto_media_id: null, aguardando_confirmacao: false,
  modo: 'bot', atendente: null,
});

export async function carregar(telefone: string, nome?: string): Promise<Conversa> {
  const { rows } = await pool.query(
    `SELECT *, atualizado_em < now() - make_interval(hours => $2) AS expirada FROM wa_conversa WHERE telefone = $1`,
    [telefone, EXPIRA_HORAS],
  );
  const r = rows[0];
  // Expira só com o bot: conversa com atendente fica aberta até ele devolver ou reiniciar.
  if (!r || (r.expirada && r.modo !== 'humano')) return vazia(telefone, nome ?? r?.nome ?? null);
  return { ...r, nome: nome ?? r.nome, contato: null } as Conversa;
}

export async function salvar(c: Conversa) {
  await pool.query(
    `INSERT INTO wa_conversa (telefone, nome, historico, relato, ficha_pendente, faltando, foto_media_id, aguardando_confirmacao, modo, atendente, atualizado_em, iniciada_em)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now(), now())
     ON CONFLICT (telefone) DO UPDATE SET nome = $2, historico = $3, relato = $4, ficha_pendente = $5, faltando = $6,
       foto_media_id = $7, aguardando_confirmacao = $8, modo = $9, atendente = $10, atualizado_em = now(),
       iniciada_em = CASE WHEN $11 THEN now() ELSE wa_conversa.iniciada_em END`,
    [c.telefone, c.nome, JSON.stringify(c.historico), c.relato, c.ficha_pendente && JSON.stringify(c.ficha_pendente),
      JSON.stringify(c.faltando), c.foto_media_id, c.aguardando_confirmacao, c.modo, c.atendente, c.historico.length === 0 && !c.relato],
  );
}

export const recomecar = (c: Conversa): Conversa => vazia(c.telefone, c.nome);

/** Grava uma linha da transcrição legível. Falha aqui nunca derruba o atendimento. */
export async function registrarEvento(telefone: string, autor: Autor, tipo: string, texto: string) {
  await pool.query('INSERT INTO wa_evento (telefone, autor, tipo, texto) VALUES ($1, $2, $3, $4)', [telefone, autor, tipo, texto]).catch((e) => console.error('[wa] evento:', e));
}

export async function eventos(telefone: string, limite = 300): Promise<Evento[]> {
  const { rows } = await pool.query(
    'SELECT * FROM (SELECT * FROM wa_evento WHERE telefone = $1 ORDER BY id DESC LIMIT $2) e ORDER BY id', [telefone, limite]);
  return rows as Evento[];
}

/** Lista para o painel: conversas com atividade nos últimos `dias`, mais recentes primeiro. */
export async function listarConversas(dias = 7) {
  const { rows } = await pool.query(
    `SELECT c.telefone, c.nome, c.modo, c.atendente, c.aguardando_confirmacao, c.faltando,
            (c.ficha_pendente IS NOT NULL) AS tem_ficha, c.iniciada_em, c.atualizado_em,
            c.atualizado_em < now() - interval '6 hours' AND c.modo = 'bot' AS expirada,
            u.autor AS ultimo_autor, u.texto AS ultima_previa, u.criado_em AS ultima_em,
            (SELECT max(criado_em) FROM wa_evento m WHERE m.telefone = c.telefone AND m.autor = 'motorista') AS ultima_do_motorista
       FROM wa_conversa c
       LEFT JOIN LATERAL (SELECT autor, texto, criado_em FROM wa_evento e WHERE e.telefone = c.telefone ORDER BY id DESC LIMIT 1) u ON true
      WHERE c.atualizado_em > now() - make_interval(days => $1)
      ORDER BY COALESCE(u.criado_em, c.atualizado_em) DESC`,
    [dias],
  );
  return rows;
}

export async function registrarTrilha(telefone: string, ocorrenciaId: string, ficha: Record<string, unknown>, contatoId: string) {
  await pool.query('INSERT INTO wa_registro (telefone, ocorrencia_id, ficha, contato_id) VALUES ($1, $2, $3, $4)', [telefone, ocorrenciaId, JSON.stringify(ficha), contatoId]);
}
