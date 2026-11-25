import { scaleLinear, scalePoint } from 'd3';
import { useState } from 'react';
import { corDoTom, tomDoScore } from '../tone';

export interface PontoSerie { mes: string; rotulo: string; score: number | null; parcial?: boolean }

/**
 * Score da rota nos últimos meses: linha com pontos coloridos pela situação e
 * tracejado no score saudável. Tooltip ao passar ou focar um ponto.
 */
export function MiniLine({ serie, saudavel, atencao, label }: { serie: PontoSerie[]; saudavel: number; atencao: number; label: string }) {
  const [ativo, setAtivo] = useState<number | null>(null);
  const W = 320, H = 120, m = { t: 14, r: 12, b: 22, l: 28 };
  const x = scalePoint<string>().domain(serie.map((p) => p.mes)).range([m.l, W - m.r]).padding(0.3);
  const y = scaleLinear().domain([0, 100]).range([H - m.b, m.t]);
  const validos = serie.filter((p) => p.score != null);
  const caminho = validos.map((p, i) => `${i ? 'L' : 'M'}${x(p.mes)},${y(p.score!)}`).join(' ');
  const p = ativo != null ? serie[ativo] : null;
  return (
    <div className="ds-mini">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} style={{ width: '100%', height: 'auto', display: 'block' }}>
        {[0, 50, 100].map((v) => (
          <g key={v}>
            <line x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} stroke="var(--chart-grid)" />
            <text className="ds-tick" x={m.l - 6} y={y(v) + 3} textAnchor="end">{v}</text>
          </g>
        ))}
        <line x1={m.l} x2={W - m.r} y1={y(saudavel)} y2={y(saudavel)} stroke="var(--color-ok)" strokeDasharray="4 4" />
        <path d={caminho} fill="none" stroke="var(--chart-1)" strokeWidth={2.25} />
        {serie.map((pt, i) => pt.score == null ? null : (
          <circle key={pt.mes} cx={x(pt.mes)} cy={y(pt.score)} r={ativo === i ? 6 : 4.5}
            fill={corDoTom(tomDoScore(pt.score, { ok: saudavel, atencao }))} stroke="var(--color-panel)" strokeWidth={2}
            tabIndex={0} aria-label={`${pt.rotulo}: score ${Math.round(pt.score)}`}
            onMouseEnter={() => setAtivo(i)} onMouseLeave={() => setAtivo(null)} onFocus={() => setAtivo(i)} onBlur={() => setAtivo(null)} />
        ))}
        {serie.map((pt) => (
          <text key={pt.mes} className="ds-tick" x={x(pt.mes)} y={H - 6} textAnchor="middle">{pt.rotulo}{pt.parcial ? '*' : ''}</text>
        ))}
      </svg>
      {p && p.score != null && (
        <div className="ds-tip" style={{ left: `${(x(p.mes)! / W) * 100}%`, top: 0, transform: 'translate(-50%, -100%)', width: 'auto' }}>
          <b>{p.rotulo}{p.parcial ? ' (mês parcial)' : ''}</b>Score {Math.round(p.score)}/100
        </div>
      )}
    </div>
  );
}
