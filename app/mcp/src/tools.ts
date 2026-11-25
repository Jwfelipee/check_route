/**
 * Ferramentas de leitura do MCP. Todas recebem o escopo da conexão e passam pelo mesmo guardião
 * (`rotaPermitida`): rota fora do escopo devolve o mesmo erro neutro que rota inexistente.
 * Nenhuma ferramenta devolve relato cru, placa, telefone, nome de pessoa ou contato.
 */
import { sql } from './db.js';
import { noEscopo, veTudo, type Escopo } from './escopo.js';

export const TIPOS_ACIDENTE = ['Colisão', 'Tombamento', 'Saída de pista', 'Avaria por frenagem'];
const NEUTRO = { erro: 'rota não disponível para este contato' } as const;
export type Resposta = Record<string, unknown>;

const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;
const porMil = (n: number, unidades: number) => (unidades > 0 ? r1((n / unidades) * 1000) : null);
const mediana = (v: number[]) => {
  if (!v.length) return null;
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const referencia = async () => (await sql<{ mes: string }>('SELECT mes FROM gold_referencia LIMIT 1'))[0]?.mes;

async function rotaDe(escopo: Escopo, rotaId: string) {
  if (!noEscopo(escopo, rotaId)) return null;
  return (await sql<{ rota_id: string; perna: string; rota: string; uf: string | null; regiao: string | null; destino: string; transportadora: string; km: number | null }>(
    'SELECT rota_id, perna, rota, uf, regiao, destino, transportadora, km FROM gold_rotas WHERE rota_id = $1', [rotaId]))[0] ?? null;
}

async function unidades(rotaId: string, mes: string) {
  return (await sql<{ unidades: number; no_prazo: number | null }>(
    'SELECT unidades, no_prazo FROM gold_operacao_mes WHERE rota_id = $1 AND mes = $2', [rotaId, mes]))[0] ?? { unidades: 0, no_prazo: null };
}

type Ferramenta = (escopo: Escopo, rotaId: string) => Promise<Resposta>;

export const resumo_rota: Ferramenta = async (escopo, rotaId) => {
  const rota = await rotaDe(escopo, rotaId);
  if (!rota) return NEUTRO;
  const mes = await referencia();
  const meses = await sql<{ mes: string; unidades: number; no_prazo: number | null; ocorrencias: number; custo: number }>(
    `SELECT o.mes, o.unidades, o.no_prazo,
            COALESCE(c.n, 0) AS ocorrencias, COALESCE(c.custo, 0) AS custo
       FROM gold_operacao_mes o
       LEFT JOIN (SELECT mes, count(*) AS n, sum(custo) AS custo FROM v_ocorrencias WHERE rota_id = $1 GROUP BY mes) c ON c.mes = o.mes
      WHERE o.rota_id = $1 ORDER BY o.mes DESC LIMIT 6`, [rotaId]);
  return {
    rota,
    mes_referencia: mes,
    ultimos_meses: meses.reverse().map((m) => ({
      mes: m.mes, operacoes: m.unidades, pct_no_prazo: m.unidades ? r1((100 * (m.no_prazo ?? 0)) / m.unidades) : null,
      ocorrencias: m.ocorrencias, custo: r2(m.custo), ocorrencias_por_mil: porMil(m.ocorrencias, m.unidades),
    })),
  };
};

export const ocorrencias_por_tipo: Ferramenta = async (escopo, rotaId) => {
  if (!(await rotaDe(escopo, rotaId))) return NEUTRO;
  const mes = (await referencia()) ?? '';
  const { unidades: ops } = await unidades(rotaId, mes);
  const tipos = await sql<{ tipo: string; n: number; custo: number; abertas: number }>(
    `SELECT tipo, count(*) AS n, sum(custo) AS custo, count(*) FILTER (WHERE status = 'Aberta') AS abertas
       FROM v_ocorrencias WHERE rota_id = $1 AND mes = $2 GROUP BY tipo ORDER BY sum(custo) DESC`, [rotaId, mes]);
  const total = tipos.reduce((s, t) => s + t.n, 0);
  const acidentes = tipos.filter((t) => TIPOS_ACIDENTE.includes(t.tipo)).reduce((s, t) => s + t.n, 0);
  return {
    mes, operacoes_no_mes: ops, ocorrencias: total, custo_total: r2(tipos.reduce((s, t) => s + t.custo, 0)),
    ocorrencias_por_mil: porMil(total, ops), acidentes, acidentes_por_mil: porMil(acidentes, ops),
    por_tipo: tipos.map((t) => ({ tipo: t.tipo, ocorrencias: t.n, custo: r2(t.custo), abertas: t.abertas, por_mil: porMil(t.n, ops) })),
  };
};

const FAIXAS = `CASE WHEN h >= 22 OR h < 5 THEN 'madrugada (22h–5h)' WHEN h < 12 THEN 'manhã (5h–12h)' WHEN h < 18 THEN 'tarde (12h–18h)' ELSE 'noite (18h–22h)' END`;

export const padrao_horario: Ferramenta = async (escopo, rotaId) => {
  if (!(await rotaDe(escopo, rotaId))) return NEUTRO;
  const mes = (await referencia()) ?? '';
  const desde = new Date(`${mes}-01T00:00:00Z`);
  desde.setUTCMonth(desde.getUTCMonth() - 5);
  const linhas = await sql<{ faixa: string; viagens: number; com_ocorrencia: number; acidentes: number }>(
    `WITH v AS (
       SELECT viagem_id, extract(hour FROM saida_cd::timestamptz AT TIME ZONE 'America/Sao_Paulo')::int AS h
         FROM bronze_tms_viagens WHERE rota_id = $1 AND saida_cd::timestamptz >= $2),
     oc AS (
       SELECT s.ref_id, bool_or(o.tipo = ANY($3)) AS acidente
         FROM v_sac_trecho s JOIN v_ocorrencias o ON o.protocolo = s.protocolo
        WHERE s.ref_tipo = 'VIAGEM' GROUP BY s.ref_id)
     SELECT ${FAIXAS} AS faixa, count(*) AS viagens, count(oc.ref_id) AS com_ocorrencia,
            count(*) FILTER (WHERE oc.acidente) AS acidentes
       FROM v LEFT JOIN oc ON oc.ref_id = v.viagem_id GROUP BY 1 ORDER BY 1`, [rotaId, desde.toISOString(), TIPOS_ACIDENTE]);
  const quando = await sql<{ faixa: string; ocorrencias: number; acidentes: number }>(
    `SELECT ${FAIXAS} AS faixa, count(*) AS ocorrencias, count(*) FILTER (WHERE tipo = ANY($3)) AS acidentes
       FROM (SELECT s.hora_relato AS h, o.tipo FROM v_sac_trecho s JOIN v_ocorrencias o ON o.protocolo = s.protocolo
              WHERE o.rota_id = $1 AND o.mes >= $2 AND s.hora_relato BETWEEN 0 AND 23) x
      GROUP BY 1 ORDER BY 2 DESC`, [rotaId, desde.toISOString().slice(0, 7), TIPOS_ACIDENTE]);
  return {
    janela: `6 meses até ${mes}`,
    por_faixa_do_horario_da_ocorrencia: { base: 'horário citado nos relatos (só ocorrências com horário no relato)', faixas: quando },
    por_faixa_de_saida_do_cd: {
      base: 'hora de saída do CD da viagem',
      faixas: linhas.map((l) => ({ faixa: l.faixa, viagens: l.viagens, viagens_com_ocorrencia: l.com_ocorrencia, viagens_com_acidente: l.acidentes,
        pct_com_ocorrencia: l.viagens ? r1((100 * l.com_ocorrencia) / l.viagens) : null })),
    },
  };
};

export const padrao_trecho: Ferramenta = async (escopo, rotaId) => {
  if (!(await rotaDe(escopo, rotaId))) return NEUTRO;
  const linhas = await sql<{ km: number | null; clima: string | null; n: number; acidentes: number }>(
    `SELECT s.km, s.clima, count(*) AS n, count(*) FILTER (WHERE o.tipo = ANY($2)) AS acidentes
       FROM v_sac_trecho s JOIN v_ocorrencias o ON o.protocolo = s.protocolo
      WHERE o.rota_id = $1 AND (s.km IS NOT NULL OR s.clima IS NOT NULL)
      GROUP BY s.km, s.clima ORDER BY count(*) DESC LIMIT 40`, [rotaId, TIPOS_ACIDENTE]);
  const porFaixaKm = new Map<string, { faixa_km: string; ocorrencias: number; acidentes: number }>();
  const porClima = new Map<string, { clima: string; ocorrencias: number; acidentes: number }>();
  for (const l of linhas) {
    if (l.km != null) {
      const ini = Math.floor(l.km / 20) * 20;
      const k = `km ${ini}–${ini + 20}`;
      const x = porFaixaKm.get(k) ?? { faixa_km: k, ocorrencias: 0, acidentes: 0 };
      x.ocorrencias += l.n; x.acidentes += l.acidentes; porFaixaKm.set(k, x);
    }
    const c = l.clima ?? 'não informado';
    const y = porClima.get(c) ?? { clima: c, ocorrencias: 0, acidentes: 0 };
    y.ocorrencias += l.n; y.acidentes += l.acidentes; porClima.set(c, y);
  }
  const ord = <T extends { ocorrencias: number }>(m: Map<string, T>) => [...m.values()].sort((a, b) => b.ocorrencias - a.ocorrencias);
  return { base: 'km e clima citados nos relatos do SAC (extraídos no banco, sem o texto)', por_faixa_km: ord(porFaixaKm).slice(0, 6), por_clima: ord(porClima) };
};

export const veiculos_e_cargas: Ferramenta = async (escopo, rotaId) => {
  if (!(await rotaDe(escopo, rotaId))) return NEUTRO;
  const mes = (await referencia()) ?? '';
  const frota = await sql<{ tipo_veiculo: string; viagens: number }>(
    `SELECT tipo_veiculo, count(*) AS viagens FROM bronze_tms_viagens WHERE rota_id = $1 GROUP BY 1 ORDER BY 2 DESC`, [rotaId]);
  const cargas = await sql<{ produto: string; n: number; custo: number }>(
    `SELECT produto, count(*) AS n, sum(custo) AS custo FROM v_ocorrencias WHERE rota_id = $1 AND mes = $2 GROUP BY 1 ORDER BY sum(custo) DESC`, [rotaId, mes]);
  const veic = await sql<{ tipo_veiculo: string; n: number }>(
    `SELECT v.tipo_veiculo, count(*) AS n
       FROM v_sac_trecho s JOIN v_ocorrencias o ON o.protocolo = s.protocolo
       JOIN bronze_tms_viagens v ON v.viagem_id = s.ref_id
      WHERE o.rota_id = $1 AND o.mes = $2 GROUP BY 1 ORDER BY 2 DESC`, [rotaId, mes]);
  return {
    mes, frota_da_rota: frota.map((f) => ({ tipo_veiculo: f.tipo_veiculo, viagens: f.viagens })),
    ocorrencias_por_tipo_de_veiculo: veic.map((v) => ({ tipo_veiculo: v.tipo_veiculo, ocorrencias: v.n })),
    cargas_mais_afetadas: cargas.map((c) => ({ produto: c.produto, ocorrencias: c.n, custo: r2(c.custo) })),
  };
};

export const atrasos: Ferramenta = async (escopo, rotaId) => {
  if (!(await rotaDe(escopo, rotaId))) return NEUTRO;
  const linhas = await sql<{ mes: string; viagens: number; atrasadas: number; atraso_medio_min: number | null }>(
    `SELECT to_char(chegada_hub::timestamptz AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM') AS mes, count(*) AS viagens,
            count(*) FILTER (WHERE chegada_hub::timestamptz > previsao_chegada_hub::timestamptz) AS atrasadas,
            avg(extract(epoch FROM (chegada_hub::timestamptz - previsao_chegada_hub::timestamptz)) / 60)
              FILTER (WHERE chegada_hub::timestamptz > previsao_chegada_hub::timestamptz) AS atraso_medio_min
       FROM bronze_tms_viagens WHERE rota_id = $1 AND chegada_hub <> '' GROUP BY 1 ORDER BY 1 DESC LIMIT 6`, [rotaId]);
  return {
    base: 'chegada no hub × previsão',
    por_mes: linhas.reverse().map((l) => ({ mes: l.mes, viagens: l.viagens, atrasadas: l.atrasadas,
      pct_atrasadas: l.viagens ? r1((100 * l.atrasadas) / l.viagens) : null,
      atraso_medio_min: l.atraso_medio_min == null ? null : Math.round(l.atraso_medio_min) })),
  };
};

export const comparar_rotas: Ferramenta = async (escopo, rotaId) => {
  const rota = await rotaDe(escopo, rotaId);
  if (!rota) return NEUTRO;
  const mes = (await referencia()) ?? '';
  const todas = await sql<{ rota_id: string; rota: string; regiao: string | null; n: number; custo: number; unidades: number }>(
    `SELECT r.rota_id, r.rota, r.regiao, COALESCE(c.n, 0) AS n, COALESCE(c.custo, 0) AS custo, o.unidades
       FROM gold_rotas r JOIN gold_operacao_mes o ON o.rota_id = r.rota_id AND o.mes = $2
       LEFT JOIN (SELECT rota_id, count(*) AS n, sum(custo) AS custo FROM v_ocorrencias WHERE mes = $2 GROUP BY 1) c ON c.rota_id = r.rota_id
      WHERE r.perna = $1`, [rota.perna, mes]);
  const mine = todas.find((t) => t.rota_id === rotaId);
  const outras = todas.filter((t) => t.rota_id !== rotaId);
  const taxa = (t: typeof todas[number]) => (t.unidades ? (t.n / t.unidades) * 1000 : 0);
  const med = mediana(outras.map(taxa));
  const minha = mine ? taxa(mine) : null;
  const base = {
    mes, etapa: rota.perna, rotas_na_etapa: todas.length,
    sua_taxa_por_mil: minha == null ? null : r1(minha),
    mediana_da_etapa_por_mil: med == null ? null : r1(med),
    situacao: med == null || minha == null ? null : minha > med * 1.25 ? 'acima da mediana da etapa' : minha < med * 0.8 ? 'abaixo da mediana da etapa' : 'perto da mediana da etapa',
  };
  if (!veTudo(escopo)) return base; // escopo restrito: sem id, nome ou número de outra rota
  const posicao = [...todas].sort((a, b) => taxa(b) - taxa(a)).findIndex((t) => t.rota_id === rotaId) + 1;
  return { ...base, posicao_na_etapa_por_taxa: posicao,
    piores_da_etapa: [...outras].sort((a, b) => taxa(b) - taxa(a)).slice(0, 3).map((t) => ({ rota_id: t.rota_id, rota: t.rota, por_mil: r1(taxa(t)), custo: r2(t.custo) })) };
};

export const historico_acoes: Ferramenta = async (escopo, rotaId) => {
  if (!(await rotaDe(escopo, rotaId))) return NEUTRO;
  const linhas = await sql<{ dados: Record<string, unknown> }>(`SELECT dados FROM acoes WHERE dados->>'rota_id' = $1 ORDER BY dados->>'validada_em' DESC LIMIT 8`, [rotaId]);
  return {
    acoes: linhas.map(({ dados: d }) => ({
      acao: d.acao, status: d.status, pratica_id: d.pratica_id ?? null, validada_em: d.validada_em,
      concluida_em: d.concluida_em ?? null, descartada_em: d.descartada_em ?? null, score_na_validacao: d.score_inicial ?? null,
    })),
  };
};

/** Ferramentas por papel (o que o papel não vê nem aparece na lista do MCP). */
export const POR_PAPEL: Record<Escopo['papel'], string[]> = {
  motorista: ['resumo_rota', 'ocorrencias_por_tipo', 'padrao_horario', 'padrao_trecho', 'veiculos_e_cargas', 'comparar_rotas'],
  transportadora: ['resumo_rota', 'ocorrencias_por_tipo', 'padrao_horario', 'padrao_trecho', 'veiculos_e_cargas', 'comparar_rotas', 'atrasos', 'historico_acoes'],
  gestor: ['resumo_rota', 'ocorrencias_por_tipo', 'padrao_horario', 'padrao_trecho', 'veiculos_e_cargas', 'comparar_rotas', 'atrasos', 'historico_acoes'],
  painel: ['resumo_rota', 'ocorrencias_por_tipo', 'padrao_horario', 'padrao_trecho', 'veiculos_e_cargas', 'comparar_rotas', 'atrasos', 'historico_acoes'],
};

export const FERRAMENTAS: Record<string, { descricao: string; run: Ferramenta }> = {
  resumo_rota: { run: resumo_rota, descricao: 'Cadastro da rota (destino, transportadora, km) e os últimos 6 meses: operações, % no prazo, ocorrências, custo e ocorrências por mil operações.' },
  ocorrencias_por_tipo: { run: ocorrencias_por_tipo, descricao: 'Ocorrências do mês de referência por tipo: quantidade, custo, abertas, por mil operações e acidentes por mil viagens.' },
  padrao_horario: { run: padrao_horario, descricao: 'Em que faixa de horário de saída do CD as viagens têm ocorrência ou acidente (6 meses).' },
  padrao_trecho: { run: padrao_trecho, descricao: 'Onde (faixa de km da rodovia) e com qual clima as ocorrências acontecem, a partir dos relatos do SAC.' },
  veiculos_e_cargas: { run: veiculos_e_cargas, descricao: 'Tipos de veículo da rota, ocorrências por tipo de veículo e as cargas (produtos) mais afetadas com custo.' },
  atrasos: { run: atrasos, descricao: 'Chegada no hub contra a previsão: % de viagens atrasadas e atraso médio, mês a mês.' },
  comparar_rotas: { run: comparar_rotas, descricao: 'Compara a taxa de ocorrências por mil operações da rota com a mediana das outras rotas da mesma etapa.' },
  historico_acoes: { run: historico_acoes, descricao: 'Ações já tomadas nesta rota (validadas, concluídas, descartadas) e o score na validação.' },
};
