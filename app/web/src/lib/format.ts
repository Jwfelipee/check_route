/** Formatos pt-BR usados em todo o painel (mesmos do artifact original). */
const nf = new Intl.NumberFormat('pt-BR');
const n1f = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const brl0 = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const brlk = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 });

export const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export const MES3 = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

const sinal = (v: number) => (v > 0 ? '+' : v < 0 ? '−' : '');
const safe = (fn: (v: number) => string) => (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? '—' : fn(v));

export const fmt = {
  int: safe((v) => nf.format(Math.round(v))),
  pct: safe((v) => Math.round(v * 100) + '%'),
  pct1: safe((v) => n1f.format(v * 100) + '%'),
  n1: safe((v) => n1f.format(v)),
  horas: safe((v) => n1f.format(v) + ' h'),
  dias: safe((v) => n1f.format(v) + ' dias'),
  brl: safe((v) => brl0.format(v)),
  brlk: safe((v) => brlk.format(v)),
  /** inteiro com sinal: +3 / −2 */
  sint: safe((v) => { const r = Math.round(v); return sinal(r) + nf.format(Math.abs(r)); }),
  /** pontos percentuais com sinal: +1,2 p.p. */
  spp: safe((v) => { const p = Math.round(v * 1000) / 10; return sinal(p) + n1f.format(Math.abs(p)) + ' p.p.'; }),
  data: (v: string | null | undefined) => (v ? `${v.slice(8, 10)}/${v.slice(5, 7)}/${v.slice(0, 4)}` : '—'),
  mesNome: (mes: string) => MESES[Number(mes.slice(5, 7)) - 1],
  mes3: (mes: string) => MES3[Number(mes.slice(5, 7)) - 1],
};
