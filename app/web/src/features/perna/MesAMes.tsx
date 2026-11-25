import { max, scaleBand, scaleLinear } from 'd3';
import { useEffect, useRef, useState } from 'react';
import { corDoTom, tomDoScore } from '@/design-system';
import { usePainel } from '@/data/hooks';
import { fmt, MESES } from '@/lib/format';
import { faixas } from '@/lib/score';
import type { Perna } from '@/lib/types';
import { PERNA_CFG } from './config';

/** Largura do elemento, atualizada quando a tela muda (o gráfico se redesenha). */
function useLargura<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/**
 * Mês a mês (§3.9): barras = prejuízo (eixo esquerdo), linha = score médio ponderado
 * (eixo direito, 0–100), tracejado no score saudável, mês atual com *. Tooltip por mês
 * e tabela equivalente para leitor de tela.
 */
export function MesAMes({ perna }: { perna: Perna }) {
  const { data } = usePainel();
  const [ref, W] = useLargura<HTMLDivElement>();
  const [ativo, setAtivo] = useState<string | null>(null);
  const cfg = PERNA_CFG[perna];
  const D = (data?.redeMes ?? []).filter((d) => d.perna === perna);
  const f = data ? faixas(data.fontes.premissas) : { ok: 85, atencao: 65 };
  const H = 250, m = { t: 22, r: 40, b: 26, l: 62 };

  const x = scaleBand<string>().domain(D.map((d) => d.mes)).range([m.l, Math.max(m.l + 1, W - m.r)]).padding(0.32);
  const y = scaleLinear().domain([0, (max(D, (d) => d.prejuizo) || 1) * 1.15]).nice().range([H - m.b, m.t]);
  const y2 = scaleLinear().domain([0, 100]).range([H - m.b, m.t]);
  const cx = (mes: string) => (x(mes) ?? 0) + x.bandwidth() / 2;
  const pts = D.filter((d) => d.score != null);
  const linha = pts.map((d, i) => `${i ? 'L' : 'M'}${cx(d.mes)},${y2(d.score!)}`).join(' ');
  const nomeMes = (mes: string) => { const n = MESES[Number(mes.slice(5, 7)) - 1]; return n[0].toUpperCase() + n.slice(1); };
  const sel = D.find((d) => d.mes === ativo);

  return (
    <div className="cr-grafico" ref={ref}>
      {W > 0 && D.length > 0 && (
        <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Prejuízo com ocorrências e score médio da ${cfg.titulo.toLowerCase()} por mês`}>
          {y.ticks(4).map((t) => (
            <g key={t}>
              <line x1={m.l} x2={W - m.r} y1={y(t)} y2={y(t)} stroke="var(--chart-grid)" />
              <text className="ds-tick" x={m.l - 6} y={y(t)} dy="0.32em" textAnchor="end">{fmt.brlk(t)}</text>
            </g>
          ))}
          {[0, 50, 100].map((t) => <text key={t} className="ds-tick" x={W - m.r + 6} y={y2(t)} dy="0.32em">{t}</text>)}
          <line x1={m.l} x2={W - m.r} y1={y2(f.ok)} y2={y2(f.ok)} strokeDasharray="4 4" stroke="var(--color-ok)" />
          {D.map((d) => (
            <g key={d.mes}>
              <rect x={x(d.mes)} width={x.bandwidth()} y={y(d.prejuizo)} height={y(0) - y(d.prejuizo)} rx={3}
                fill="var(--chart-1)" opacity={d.parcial ? 0.35 : ativo === d.mes ? 0.85 : 0.6} />
              <text className="ds-tick" x={cx(d.mes)} y={H - 7} textAnchor="middle">{fmt.mes3(d.mes)}{d.parcial ? '*' : ''}</text>
            </g>
          ))}
          <path d={linha} fill="none" stroke="var(--color-fg)" strokeWidth={2.25} />
          {pts.map((d) => (
            <g key={d.mes + '-p'}>
              <circle cx={cx(d.mes)} cy={y2(d.score!)} r={4.5} fill={corDoTom(tomDoScore(d.score, f))} stroke="var(--color-panel)" strokeWidth={1.5} />
              <text className="ds-label" x={cx(d.mes)} y={y2(d.score!) - 9} textAnchor="middle">{Math.round(d.score!)}</text>
            </g>
          ))}
          {D.map((d) => (
            <rect key={d.mes + '-h'} x={(x(d.mes) ?? 0) - (x.step() - x.bandwidth()) / 2} width={x.step()} y={m.t} height={H - m.t - m.b}
              fill="transparent" tabIndex={0} aria-label={`${nomeMes(d.mes)}: score ${fmt.int(d.score)}, prejuízo ${fmt.brl(d.prejuizo)}`}
              onMouseEnter={() => setAtivo(d.mes)} onMouseLeave={() => setAtivo(null)} onFocus={() => setAtivo(d.mes)} onBlur={() => setAtivo(null)} />
          ))}
        </svg>
      )}
      {sel && (
        <div className="ds-tip" style={{ left: Math.max(0, Math.min(W - 236, cx(sel.mes) - 115)), top: 0 }}>
          <b>{nomeMes(sel.mes)}{sel.parcial ? ' (parcial)' : ''}</b>
          <div>Score médio {fmt.int(sel.score)} · {cfg.kpiPrazo.toLowerCase()} {fmt.pct1(sel.pct_prazo as number)}</div>
          <div>{fmt.int(sel.unidades)} {cfg.unidade[1]} · prejuízo {fmt.brl(sel.prejuizo)} em {fmt.int(sel.ocorrencias)} ocorrências</div>
          <div>Rotas: {sel.criticas} críticas, {sel.atencao} em atenção, {sel.saudaveis} saudáveis</div>
        </div>
      )}
      <table className="ds-sr-only">
        <caption>Mês a mês da {cfg.titulo.toLowerCase()}</caption>
        <thead><tr><th>Mês</th><th>Score</th><th>Prejuízo</th><th>Ocorrências</th></tr></thead>
        <tbody>{D.map((d) => <tr key={d.mes}><td>{nomeMes(d.mes)}</td><td>{fmt.int(d.score)}</td><td>{fmt.brl(d.prejuizo)}</td><td>{fmt.int(d.ocorrencias)}</td></tr>)}</tbody>
      </table>
    </div>
  );
}
