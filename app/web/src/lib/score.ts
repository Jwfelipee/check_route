/**
 * Motor do score. Porta fiel dos dash.calc do artifact original
 * (reference/artifact/sr_calc.js): rota_mes, saude_rotas, rede_mes, kpis,
 * kpis_total, padroes, regioes e zonas. Funções puras: recebem as fontes
 * (e os filtros quando aplicável) e devolvem linhas prontas para a tela.
 */
import type { Filtros, Fontes, Ocorrencia, Perna, Pratica, Premissa, Referencia, Rota, Situacao } from './types';
import { PERNAS } from './types';

export const NOME_PERNA: Record<Perna, string> = { coleta: 'Coleta', transferencia: 'Transferência', entrega: 'Entrega' };
export const NOME_REGIAO: Record<string, string> = { N: 'Norte', NE: 'Nordeste', CO: 'Centro-Oeste', SE: 'Sudeste', S: 'Sul' };

export function faixas(premissas: Premissa[]) {
  const par = (k: string, d: number) => premissas.find((x) => x.chave === k)?.valor ?? d;
  return { ok: par('faixa_saudavel', 85), atencao: par('faixa_atencao', 65) };
}

export function situacaoDe(score: number | null, f: { ok: number; atencao: number }): Situacao | null {
  if (score == null) return null;
  return score >= f.ok ? 'Saudável' : score >= f.atencao ? 'Atenção' : 'Crítica';
}

/** Régua linear: nota 0 no valor ruim, 100 na meta, limitada a [0, 100]. */
export function nota(v: number | null, zero: number, cem: number): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  return Math.max(0, Math.min(1, (v - zero) / (cem - zero))) * 100;
}

export const pilares = (premissas: Premissa[], perna: string) => premissas.filter((p) => p.tipo === 'pilar' && p.perna === perna);

/** Regra de filtro de cada perna: coleta/entrega por UF e zona; transferência por região. */
export function passaFiltro(r: { perna: Perna; regiao: string | null; uf: string | null; zona: string | null }, f: Filtros): boolean {
  if (r.perna === 'transferencia') return !f.regiao || r.regiao === f.regiao;
  const uf = (r.perna === 'coleta' ? f.uf_coleta : f.uf_entrega) || 'SP';
  const zona = r.perna === 'coleta' ? f.zona_coleta : f.zona_entrega;
  return r.uf === uf && (!zona || r.zona === zona);
}

// ---------------------------------------------------------------- rota_mes
export interface RotaMes {
  mes: string; perna: Perna; regiao: string; uf: string | null; cidade: string | null; zona: string | null;
  rota_id: string; rota: string; origem: string; destino: string; transportadora: string; km: number | null;
  unidades: number; ocorrencias: number; abertas: number; frete_unidade: number | null; frete_orcado: number; prejuizo: number;
  pct_prazo: number | null; pct_primeira: number | null; ocorr_100: number | null; custo_vs_orcado: number | null;
  resolucao_dias: number | null; horas_ate_cd: number | null; ocupacao: number | null; horas_crossdock: number | null;
  score: number | null; situacao: Situacao | null; economia: number; economia_vazio: number;
  [nota: `nota_${string}`]: number | null;
}

export function calcRotaMes({ rotas, operacao_mes, ocorrencias, premissas }: Fontes): RotaMes[] {
  const f = faixas(premissas);
  const rotaPorId = new Map(rotas.map((r) => [r.rota_id, r]));
  const porRotaMes = new Map<string, Ocorrencia[]>();
  for (const o of ocorrencias) {
    const k = o.mes + '|' + o.rota_id;
    (porRotaMes.get(k) ?? porRotaMes.set(k, []).get(k)!).push(o);
  }
  return operacao_mes.map((e) => {
    const r = rotaPorId.get(e.rota_id) ?? ({} as Rota);
    const pil = pilares(premissas, r.perna);
    const meta = (k: string) => pil.find((x) => x.chave === k)?.nota_cem ?? null;
    const os = porRotaMes.get(e.mes + '|' + e.rota_id) ?? [];
    const resolvidas = os.filter((o) => o.dias_resolucao != null);
    const n = e.unidades || 0;
    const prejuizo = os.reduce((a, o) => a + o.custo, 0);
    const v: Record<string, number | null> = {
      pct_prazo: n ? e.no_prazo / n : null,
      pct_primeira: n && e.primeira_tentativa != null ? e.primeira_tentativa / n : null,
      ocorr_100: n ? (os.length / n) * 100 : null,
      custo_vs_orcado: n && r.frete_orcado ? e.frete_total / n / r.frete_orcado : null,
      resolucao_dias: resolvidas.length ? resolvidas.reduce((a, o) => a + (o.dias_resolucao ?? 0), 0) / resolvidas.length : os.length ? null : 0,
      horas_ate_cd: e.horas_ate_cd,
      ocupacao: e.ocupacao,
      horas_crossdock: e.horas_crossdock,
    };
    const out = {
      mes: e.mes, perna: r.perna, regiao: r.regiao, uf: r.uf, cidade: r.cidade, zona: r.zona, rota_id: e.rota_id, rota: r.rota,
      origem: r.origem, destino: r.destino, transportadora: r.transportadora, km: r.km,
      unidades: n, ocorrencias: os.length, abertas: os.filter((o) => o.status === 'Aberta').length,
      frete_unidade: n ? e.frete_total / n : null, frete_orcado: r.frete_orcado, prejuizo,
      ...v,
    } as RotaMes;
    let soma = 0, pesos = 0;
    for (const p of pil) {
      const nt = nota(v[p.chave] ?? null, p.nota_zero!, p.nota_cem!);
      out[`nota_${p.chave}`] = nt;
      if (nt != null) { soma += nt * p.peso!; pesos += p.peso!; }
    }
    out.score = pesos ? soma / pesos : null;
    out.situacao = situacaoDe(out.score, f);
    // Economia possível: ocorrências acima da meta x custo médio + frete acima do orçado + espaço vazio (transferência).
    const custoMedio = os.length ? prejuizo / os.length : 0;
    const metaOc = meta('ocorr_100');
    const ocorrAcima = metaOc == null ? 0 : Math.max(0, os.length - (metaOc / 100) * n);
    const freteAcima = Math.max(0, e.frete_total - (r.frete_orcado || 0) * n);
    const metaOcup = meta('ocupacao');
    const vazio = metaOcup && v.ocupacao != null ? Math.max(0, (metaOcup - v.ocupacao) / metaOcup) * Math.min(e.frete_total, (r.frete_orcado || 0) * n) : 0;
    out.economia_vazio = vazio;
    out.economia = ocorrAcima * custoMedio + freteAcima + vazio;
    return out;
  });
}

// ------------------------------------------------------------- saude_rotas
export interface SaudeRota extends RotaMes {
  score_ant: number | null; delta_score: number | null; foco: string | null; foco_chave: string | null;
  tipo_top: string | null; tipo_top_custo: number | null; produto_top: string | null;
  acao: string; pratica_id: string | null; pratica: string | null;
}

const pctTxt = (v: number) => Math.round(v * 100) + '%';
const n1Txt = (v: number) => String(Math.round(v * 10) / 10).replace('.', ',');

export function calcSaudeRotas(rotaMes: RotaMes[], ocorrencias: Ocorrencia[], ref: Referencia, premissas: Premissa[], praticas: Pratica[]): SaudeRota[] {
  const ordem: Record<string, number> = { coleta: 1, transferencia: 2, entrega: 3 };
  const acaoDe = (r: RotaMes, foco: string | null, top: { tipo: string; n: number } | null, prodTop: string | null, os: Ocorrencia[]) => {
    const conta = (tipos: string[]) => os.filter((o) => tipos.includes(o.tipo)).length;
    const gatilho = foco === 'ocorr_100' && top ? top.tipo : foco;
    const daPerna = praticas.filter((p) => p.perna === r.perna);
    const temGatilho = (x: Pratica, g: string | null) => g != null && x.gatilho.split('|').includes(g);
    const p = daPerna.find((x) => temGatilho(x, gatilho)) ?? (top ? daPerna.find((x) => temGatilho(x, top.tipo)) : undefined);
    if (!p) return { texto: 'Acompanhar a premissa que mais tira pontos da rota.', pratica: null };
    const semPrimeira = Math.round(r.unidades * (1 - (r.pct_primeira ?? 1)));
    const v: Record<string, string | number> = {
      transportadora: r.transportadora,
      pct_fora: pctTxt(1 - (r.pct_prazo || 0)),
      pct_acima: pctTxt((r.custo_vs_orcado || 1) - 1),
      horas: n1Txt(r.perna === 'transferencia' ? r.horas_crossdock || 0 : r.horas_ate_cd || 0),
      ocupacao: pctTxt(r.ocupacao || 0),
      vazio: 'R$ ' + Math.round(r.economia_vazio || 0).toLocaleString('pt-BR'),
      dias: n1Txt(r.resolucao_dias || 0),
      n_tipo: top ? top.n : 0,
      tipo: top ? top.tipo.toLowerCase() : '',
      produto: String(prodTop || '').toLowerCase(),
      n_frustradas: Math.max(conta(['Coleta frustrada']), semPrimeira),
      n_divergencia: conta(['Divergência de volumes', 'Nota fiscal com erro']),
      n_reentregas: Math.max(conta(['Destinatário ausente', 'Recusa', 'Compra cancelada em rota']), semPrimeira),
    };
    return { texto: p.acao.replace(/\{(\w+)\}/g, (m, k: string) => (v[k] == null ? m : String(v[k]))), pratica: p };
  };

  return rotaMes
    .filter((r) => r.mes === ref.mes)
    .map((r) => {
      const pil = pilares(premissas, r.perna);
      const ant = rotaMes.find((x) => x.mes === ref.mes_anterior && x.rota_id === r.rota_id);
      const os = ocorrencias.filter((o) => o.mes === ref.mes && o.rota_id === r.rota_id);
      const tipos: Record<string, { tipo: string; n: number; custo: number; prod: Record<string, number> }> = {};
      for (const o of os) {
        const t = (tipos[o.tipo] ??= { tipo: o.tipo, n: 0, custo: 0, prod: {} });
        t.n += 1; t.custo += o.custo; t.prod[o.produto] = (t.prod[o.produto] || 0) + o.custo;
      }
      const top = Object.values(tipos).sort((a, b) => b.custo - a.custo)[0] ?? null;
      const prodTop = top ? Object.keys(top.prod).sort((a, b) => top.prod[b] - top.prod[a])[0] : null;
      // Premissa que mais tira pontos: peso x (100 - nota).
      const fraca = pil
        .map((p) => ({ p, perda: r[`nota_${p.chave}`] == null ? null : p.peso! * (100 - (r[`nota_${p.chave}`] as number)) }))
        .filter((x): x is { p: Premissa; perda: number } => x.perda != null)
        .sort((a, b) => b.perda - a.perda)[0];
      const foco = fraca ? fraca.p.chave : null;
      const sug = r.situacao === 'Saudável'
        ? { texto: 'Nenhuma ação necessária: a rota está dentro das premissas.', pratica: null }
        : acaoDe(r, foco, top, prodTop, os);
      return {
        ...r,
        score_ant: ant ? ant.score : null,
        delta_score: ant?.score != null && r.score != null ? r.score - ant.score : null,
        foco: fraca ? fraca.p.premissa : null,
        foco_chave: foco,
        tipo_top: top ? top.tipo : null,
        tipo_top_custo: top ? top.custo : null,
        produto_top: prodTop,
        acao: sug.texto,
        pratica_id: sug.pratica ? sug.pratica.id : null,
        pratica: sug.pratica ? sug.pratica.titulo : null,
      };
    })
    .sort((a, b) => (ordem[a.perna] || 9) - (ordem[b.perna] || 9) || (a.score ?? 0) - (b.score ?? 0));
}

// ---------------------------------------------------------------- rede_mes
export interface RedeMes {
  perna: Perna; mes: string; parcial: boolean; unidades: number; score: number | null;
  ocorrencias: number; abertas: number; prejuizo: number; economia: number;
  criticas: number; atencao: number; saudaveis: number;
  [indicador: string]: number | string | boolean | null;
}

export function calcRedeMes(rotaMes: RotaMes[], ref: Referencia, premissas: Premissa[], filtros: Filtros): RedeMes[] {
  const chaves = Array.from(new Set(premissas.filter((p) => p.tipo === 'pilar').map((p) => p.chave)));
  const grupos = new Map<string, RotaMes[]>();
  for (const r of rotaMes) if (passaFiltro(r, filtros)) {
    const k = r.perna + '|' + r.mes;
    (grupos.get(k) ?? grupos.set(k, []).get(k)!).push(r);
  }
  return [...grupos.keys()].sort().map((k) => {
    const rs = grupos.get(k)!;
    const n = rs.reduce((a, r) => a + r.unidades, 0);
    const pond = (c: string) => {
      const v = rs.filter((r) => (r as any)[c] != null);
      const nn = v.reduce((a, r) => a + r.unidades, 0);
      return nn ? v.reduce((a, r) => a + (r as any)[c] * r.unidades, 0) / nn : null;
    };
    const out: RedeMes = {
      perna: rs[0].perna, mes: rs[0].mes, parcial: rs[0].mes === ref.mes, unidades: n, score: pond('score'),
      ocorrencias: rs.reduce((a, r) => a + r.ocorrencias, 0), abertas: rs.reduce((a, r) => a + r.abertas, 0),
      prejuizo: rs.reduce((a, r) => a + r.prejuizo, 0), economia: rs.reduce((a, r) => a + r.economia, 0),
      criticas: rs.filter((r) => r.situacao === 'Crítica').length,
      atencao: rs.filter((r) => r.situacao === 'Atenção').length,
      saudaveis: rs.filter((r) => r.situacao === 'Saudável').length,
    };
    for (const c of chaves) out[c] = pond(c);
    return out;
  });
}

// -------------------------------------------------------------------- kpis
export interface KpiPerna {
  perna: Perna; nome: string; mes: string; unidades: number | null; score: number | null; delta_score: number | null;
  ocorrencias: number | null; abertas: number | null; prejuizo: number | null; economia: number | null;
  n_rotas: number; n_criticas: number | null; n_atencao: number | null; n_saudaveis: number | null;
  share_prej_criticas: number | null;
  [indicador: string]: number | string | null;
}

export function calcKpis(redeMes: RedeMes[], rotaMes: RotaMes[], ref: Referencia, premissas: Premissa[], filtros: Filtros): KpiPerna[] {
  const chaves = Array.from(new Set(premissas.filter((p) => p.tipo === 'pilar').map((p) => p.chave)));
  return PERNAS.map((perna) => {
    const a = redeMes.find((x) => x.perna === perna && x.mes === ref.mes);
    const b = redeMes.find((x) => x.perna === perna && x.mes === ref.mes_anterior);
    const crit = rotaMes.filter((r) => r.perna === perna && r.mes === ref.mes && r.situacao === 'Crítica' && passaFiltro(r, filtros));
    const out: KpiPerna = {
      perna, nome: NOME_PERNA[perna], mes: ref.mes, unidades: a?.unidades ?? null, score: a?.score ?? null,
      delta_score: a?.score != null && b?.score != null ? a.score - b.score : null,
      ocorrencias: a?.ocorrencias ?? null, abertas: a?.abertas ?? null, prejuizo: a?.prejuizo ?? null, economia: a?.economia ?? null,
      n_rotas: (a?.criticas || 0) + (a?.atencao || 0) + (a?.saudaveis || 0),
      n_criticas: a?.criticas ?? null, n_atencao: a?.atencao ?? null, n_saudaveis: a?.saudaveis ?? null,
      share_prej_criticas: a?.prejuizo ? crit.reduce((s, r) => s + r.prejuizo, 0) / a.prejuizo : null,
    };
    for (const c of chaves) {
      const va = a?.[c] as number | null | undefined, vb = b?.[c] as number | null | undefined;
      out[c] = va ?? null;
      out['delta_' + c] = va != null && vb != null ? va - vb : null;
    }
    return out;
  });
}

// -------------------------------------------------------------- kpis_total
export interface KpiTotal {
  perna: Perna | 'geral'; nome: string; unidades?: number; score?: number | null;
  n_rotas: number; n_criticas: number; prejuizo: number; pior_nome?: string; pior_score?: number | null;
}

export function calcKpisTotal(rotaMes: RotaMes[], ref: Referencia): KpiTotal[] {
  const linhas: KpiTotal[] = PERNAS.map((perna) => {
    const rs = rotaMes.filter((r) => r.perna === perna && r.mes === ref.mes);
    const n = rs.reduce((a, r) => a + r.unidades, 0);
    return {
      perna, nome: NOME_PERNA[perna], unidades: n,
      score: n ? rs.reduce((a, r) => a + (r.score || 0) * r.unidades, 0) / n : null,
      n_rotas: rs.length, n_criticas: rs.filter((r) => r.situacao === 'Crítica').length, prejuizo: rs.reduce((a, r) => a + r.prejuizo, 0),
    };
  });
  const pior = linhas.filter((l) => l.score != null).sort((a, b) => a.score! - b.score!)[0];
  linhas.push({
    perna: 'geral', nome: 'Operação',
    n_rotas: linhas.reduce((s, l) => s + l.n_rotas, 0), n_criticas: linhas.reduce((s, l) => s + l.n_criticas, 0),
    prejuizo: linhas.reduce((s, l) => s + l.prejuizo, 0), pior_nome: pior?.nome, pior_score: pior?.score,
  });
  return linhas;
}

// ----------------------------------------------------------------- padroes
export type DimPadrao = 'tipo' | 'produto' | 'transportadora' | 'rota_tipo' | 'combo';
export interface Padrao {
  perna: Perna; dim: DimPadrao; valor: string; ocorrencias: number; custo: number; abertas: number;
  share_custo: number; dias_resolucao: number | null; rota_id?: string; tipo?: string;
}

export function calcPadroes(ocorrencias: Ocorrencia[], rotas: Rota[], ref: Referencia, filtros: Filtros): Padrao[] {
  const rotaPorId = new Map(rotas.map((r) => [r.rota_id, r]));
  const nome = (id: string) => rotaPorId.get(id)?.rota ?? id;
  const saida: Padrao[] = [];
  for (const perna of PERNAS) {
    const os = ocorrencias.filter((o) => {
      const r = rotaPorId.get(o.rota_id);
      return o.mes === ref.mes && o.perna === perna && !!r && passaFiltro(r, filtros);
    });
    const tot = os.reduce((a, o) => a + o.custo, 0);
    const agrupa = (dim: DimPadrao, chave: (o: Ocorrencia) => string, extra?: (o: Ocorrencia) => Partial<Padrao>) => {
      const m = new Map<string, Padrao & { ds: number; dn: number }>();
      for (const o of os) {
        const k = chave(o);
        let g = m.get(k);
        if (!g) { g = { perna, dim, valor: k, ocorrencias: 0, custo: 0, abertas: 0, share_custo: 0, dias_resolucao: null, ds: 0, dn: 0, ...(extra?.(o) ?? {}) }; m.set(k, g); }
        g.ocorrencias += 1; g.custo += o.custo;
        if (o.dias_resolucao != null) { g.ds += o.dias_resolucao; g.dn += 1; }
        if (o.status === 'Aberta') g.abertas += 1;
      }
      return [...m.values()]
        .map(({ ds, dn, ...g }) => ({ ...g, share_custo: tot ? g.custo / tot : 0, dias_resolucao: dn ? ds / dn : null }))
        .sort((a, b) => b.custo - a.custo);
    };
    const combo = agrupa('combo', (o) => o.tipo.toLowerCase() + (perna === 'entrega' ? ' de ' + o.produto.toLowerCase() : '') + ' na rota ' + nome(o.rota_id));
    saida.push(
      ...agrupa('tipo', (o) => o.tipo),
      ...agrupa('produto', (o) => o.produto),
      ...agrupa('transportadora', (o) => o.transportadora),
      ...agrupa('rota_tipo', (o) => o.rota_id + ' · ' + o.tipo, (o) => ({ rota_id: o.rota_id, tipo: o.tipo })),
      ...combo.slice(0, 1),
    );
  }
  return saida;
}

// ----------------------------------------------------------------- regioes
export interface RegiaoScore {
  perna: Perna; regiao: string; nome: string; n_rotas: number; unidades: number; score: number | null;
  situacao: Situacao | null; n_criticas: number; prejuizo: number;
}

export function calcRegioes(rotaMes: RotaMes[], ref: Referencia, premissas: Premissa[]): RegiaoScore[] {
  const f = faixas(premissas);
  const saida: RegiaoScore[] = [];
  for (const perna of PERNAS) for (const reg of Object.keys(NOME_REGIAO)) {
    const rs = rotaMes.filter((r) => r.perna === perna && r.mes === ref.mes && r.regiao === reg);
    const n = rs.reduce((a, r) => a + r.unidades, 0);
    const score = n ? rs.reduce((a, r) => a + (r.score ?? 0) * r.unidades, 0) / n : null;
    saida.push({
      perna, regiao: reg, nome: NOME_REGIAO[reg], n_rotas: rs.length, unidades: n, score, situacao: situacaoDe(score, f),
      n_criticas: rs.filter((r) => r.situacao === 'Crítica').length, prejuizo: rs.reduce((a, r) => a + r.prejuizo, 0),
    });
  }
  return saida;
}

// ------------------------------------------------------------------- zonas
export function calcZonas(rotaMes: RotaMes[], ref: Referencia) {
  return rotaMes
    .filter((r) => r.mes === ref.mes && r.perna !== 'transferencia')
    .map((r) => ({
      perna: r.perna, uf: r.uf, cidade: r.cidade, zona: r.zona, regiao: r.regiao, rota_id: r.rota_id,
      score: r.score, situacao: r.situacao, unidades: r.unidades, ocorrencias: r.ocorrencias, prejuizo: r.prejuizo,
    }));
}
export type ZonaScore = ReturnType<typeof calcZonas>[number];
