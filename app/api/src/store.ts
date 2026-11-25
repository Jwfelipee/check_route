/**
 * ÚNICO ponto de troca da base de dados.
 *
 * Fontes de leitura (escolhida por DATA_SOURCE no .env):
 *  - "gold": tabelas gold_* do Postgres, geradas pelo `npm run etl` a partir da planilha bronze.
 *  - "json": os JSON fictícios de app/web/public/data (o que o front usa sem API).
 *  - vazio : usa "gold" se o ETL já rodou, senão "json".
 *
 * Para plugar outra base, escreva uma função que devolva `Fontes` com os campos
 * de ./types.ts e registre em `FONTES` abaixo. Ações e ocorrências novas são
 * sempre gravadas no Postgres.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { sql, tabelaExiste, WEB_DATA_DIR } from './db.js';
import type { Acao, AcaoStatus, Fontes, Ocorrencia, Pratica } from './types.js';

type CarregaFontes = () => Promise<Fontes>;

const lerJson = <T>(nome: string): T =>
  JSON.parse(readFileSync(resolve(WEB_DATA_DIR, `${nome}.json`), 'utf8')) as T;

const fonteJson: CarregaFontes = async () => ({
  rotas: lerJson('rotas'),
  operacao_mes: lerJson('operacao_mes'),
  ocorrencias: lerJson('ocorrencias'),
  premissas: lerJson('premissas'),
  praticas: lerJson('praticas'),
  referencia: lerJson<Fontes['referencia'][]>('referencia')[0],
});

/** Campos opcionais: o zod do front aceita ausente, não null. */
const semNulos = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null));

const fonteGold: CarregaFontes = async () => {
  const [rotas, operacao_mes, ocorrencias, premissas, referencia, temPraticas] = await Promise.all([
    sql('SELECT * FROM gold_rotas ORDER BY rota_id'),
    sql('SELECT * FROM gold_operacao_mes ORDER BY rota_id, mes'),
    sql('SELECT * FROM gold_ocorrencias ORDER BY id'),
    sql('SELECT * FROM gold_premissas'),
    sql('SELECT * FROM gold_referencia'),
    tabelaExiste('gold_praticas'),
  ]);
  return {
    rotas: rotas as unknown as Fontes['rotas'],
    operacao_mes: operacao_mes as unknown as Fontes['operacao_mes'],
    ocorrencias: ocorrencias as unknown as Fontes['ocorrencias'],
    premissas: premissas.map(semNulos) as unknown as Fontes['premissas'],
    // O guia de boas práticas não vem da bronze: continua no JSON do front.
    praticas: temPraticas ? ((await sql('SELECT * FROM gold_praticas')) as unknown as Pratica[]) : lerJson('praticas'),
    referencia: referencia[0] as unknown as Fontes['referencia'],
  };
};

const FONTES: Record<string, CarregaFontes> = { json: fonteJson, gold: fonteGold };

export async function fonteAtiva(): Promise<string> {
  const pedida = process.env.DATA_SOURCE?.trim();
  if (pedida) {
    if (!FONTES[pedida]) throw new Error(`DATA_SOURCE desconhecida: ${pedida}`);
    return pedida;
  }
  return (await tabelaExiste('gold_rotas')) ? 'gold' : 'json';
}

let cache: Promise<Fontes> | null = null;

function base(): Promise<Fontes> {
  cache ??= fonteAtiva()
    .then((f) => FONTES[f]())
    .catch((e) => {
      cache = null;
      throw e;
    });
  return cache;
}

/** Descarta o cache (ex.: depois de rodar o ETL com a API no ar). */
export function recarregar() {
  cache = null;
}

export const store = {
  rotas: async () => (await base()).rotas,
  operacaoMes: async () => (await base()).operacao_mes,
  premissas: async () => (await base()).premissas,
  praticas: async () => (await base()).praticas,
  referencia: async () => (await base()).referencia,

  /** Ocorrências da base + as criadas pela demo (relato → ficha → confirmação). */
  async ocorrencias(desde?: string): Promise<Ocorrencia[]> {
    const novas = (await sql<{ dados: Ocorrencia }>('SELECT dados FROM ocorrencias_novas ORDER BY criada_em')).map(
      (r) => r.dados,
    );
    const todas = [...(await base()).ocorrencias, ...novas];
    return desde ? todas.filter((o) => o.mes >= desde) : todas;
  },

  async criarOcorrencia(o: Ocorrencia): Promise<Ocorrencia> {
    await sql('INSERT INTO ocorrencias_novas (id, dados) VALUES ($1, $2)', [o.id, o]);
    return o;
  },

  // ---------- ações ----------

  async acoes(): Promise<Acao[]> {
    return (await sql<{ dados: Acao }>(`SELECT dados FROM acoes ORDER BY dados->>'validada_em', id`)).map((r) => r.dados);
  },

  async criarAcao(a: Omit<Acao, 'id'>): Promise<Acao> {
    const nova: Acao = { ...a, id: `${a.rota_id}-${Date.now()}` };
    await sql('INSERT INTO acoes (id, dados) VALUES ($1, $2)', [nova.id, nova]);
    return nova;
  },

  async mudarStatusAcao(id: string, status: Exclude<AcaoStatus, 'Em acompanhamento'>): Promise<Acao | null> {
    const hoje = new Date().toISOString().slice(0, 10);
    const extra = status === 'Concluída' ? { concluida_em: hoje } : { cancelada_em: hoje };
    const [r] = await sql<{ dados: Acao }>('UPDATE acoes SET dados = dados || $2::jsonb WHERE id = $1 RETURNING dados', [
      id,
      { status, ...extra },
    ]);
    return r?.dados ?? null;
  },
};
