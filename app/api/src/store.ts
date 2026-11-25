/**
 * ÚNICO ponto de troca da base de dados.
 *
 * Fontes de leitura (escolhida por DATA_SOURCE no .env):
 *  - "gold": tabelas gold_* do SQLite, geradas pelo `npm run etl` a partir da planilha bronze.
 *  - "json": os JSON fictícios de app/web/public/data (o que o front usa sem API).
 *  - vazio : usa "gold" se o ETL já rodou, senão "json".
 *
 * Para plugar outra base (Postgres, BigQuery, outra planilha), escreva uma função
 * que devolva `Fontes` com os campos de ./types.ts e registre em `FONTES` abaixo.
 * Ações e ocorrências novas são sempre gravadas no SQLite local.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { db, tabelaExiste, WEB_DATA_DIR } from './db.js';
import type { Acao, AcaoStatus, Fontes, Ocorrencia, Pratica } from './types.js';

type CarregaFontes = () => Omit<Fontes, 'ocorrencias'> & { ocorrencias: Ocorrencia[] };

const lerJson = <T>(nome: string): T =>
  JSON.parse(readFileSync(resolve(WEB_DATA_DIR, `${nome}.json`), 'utf8')) as T;

const fonteJson: CarregaFontes = () => ({
  rotas: lerJson('rotas'),
  operacao_mes: lerJson('operacao_mes'),
  ocorrencias: lerJson('ocorrencias'),
  premissas: lerJson('premissas'),
  praticas: lerJson('praticas'),
  referencia: lerJson<Fontes['referencia'][]>('referencia')[0],
});

const tudo = <T>(tabela: string): T[] => db.prepare(`SELECT * FROM ${tabela}`).all() as T[];

const fonteGold: CarregaFontes = () => ({
  rotas: tudo('gold_rotas'),
  operacao_mes: tudo('gold_operacao_mes'),
  ocorrencias: tudo('gold_ocorrencias'),
  premissas: tudo<Record<string, unknown>>('gold_premissas').map(semNulos) as unknown as Fontes['premissas'],
  // O guia de boas práticas não vem da bronze: continua no JSON do front.
  praticas: tabelaExiste('gold_praticas') ? tudo('gold_praticas') : lerJson<Pratica[]>('praticas'),
  referencia: tudo<Fontes['referencia']>('gold_referencia')[0],
});

/** Premissas têm campos opcionais: o zod do front aceita ausente, não null. */
function semNulos(o: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null));
}

const FONTES: Record<string, CarregaFontes> = { json: fonteJson, gold: fonteGold };

export function fonteAtiva(): string {
  const pedida = process.env.DATA_SOURCE?.trim();
  if (pedida) {
    if (!FONTES[pedida]) throw new Error(`DATA_SOURCE desconhecida: ${pedida}`);
    return pedida;
  }
  return tabelaExiste('gold_rotas') ? 'gold' : 'json';
}

let cache: ReturnType<CarregaFontes> | null = null;

function base() {
  if (!cache) cache = FONTES[fonteAtiva()]();
  return cache;
}

export function recarregar() {
  cache = null;
}

// ---------- leitura ----------

export const store = {
  rotas: () => base().rotas,
  operacaoMes: () => base().operacao_mes,
  premissas: () => base().premissas,
  praticas: () => base().praticas,
  referencia: () => base().referencia,

  /** Ocorrências da base + as criadas pela demo (relato → ficha → confirmação). */
  ocorrencias(desde?: string): Ocorrencia[] {
    const novas = (db.prepare('SELECT dados FROM ocorrencias_novas ORDER BY criada_em').all() as { dados: string }[])
      .map((r) => JSON.parse(r.dados) as Ocorrencia);
    const todas = [...base().ocorrencias, ...novas];
    return desde ? todas.filter((o) => o.mes >= desde) : todas;
  },

  criarOcorrencia(o: Ocorrencia): Ocorrencia {
    db.prepare('INSERT INTO ocorrencias_novas (id, criada_em, dados) VALUES (?, ?, ?)').run(
      o.id,
      new Date().toISOString(),
      JSON.stringify(o),
    );
    return o;
  },

  // ---------- ações ----------

  acoes(): Acao[] {
    return (db.prepare('SELECT dados FROM acoes').all() as { dados: string }[]).map((r) => JSON.parse(r.dados));
  },

  criarAcao(a: Omit<Acao, 'id'>): Acao {
    const nova: Acao = { ...a, id: `${a.rota_id}-${Date.now()}` };
    db.prepare('INSERT INTO acoes (id, dados) VALUES (?, ?)').run(nova.id, JSON.stringify(nova));
    return nova;
  },

  mudarStatusAcao(id: string, status: Exclude<AcaoStatus, 'Em acompanhamento'>): Acao | null {
    const atual = this.acoes().find((a) => a.id === id);
    if (!atual) return null;
    const hoje = new Date().toISOString().slice(0, 10);
    const nova: Acao = {
      ...atual,
      status,
      ...(status === 'Concluída' ? { concluida_em: hoje } : { cancelada_em: hoje }),
    };
    db.prepare('UPDATE acoes SET dados = ? WHERE id = ?').run(JSON.stringify(nova), id);
    return nova;
  },
};
