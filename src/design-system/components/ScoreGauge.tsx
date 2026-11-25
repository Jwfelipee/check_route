import { arc as d3arc, scaleLinear } from 'd3';
import { corDoTom, tomDoScore } from '../tone';

/**
 * Meio contagiro do score (0–100), igual ao do artifact: trilho cinza, faixa verde
 * fina a partir do score saudável, arco colorido pela situação, marcador da faixa e ponteiro.
 */
export function ScoreGauge({ score, healthy = 85, warning = 65, label, width = 96 }: { score: number | null; healthy?: number; warning?: number; label: string; width?: number }) {
  const R = 88, r = 66;
  const A = scaleLinear().domain([0, 100]).range([-Math.PI / 2, Math.PI / 2]).clamp(true);
  const arc = d3arc<{ startAngle: number; endAngle: number }>().innerRadius(r).outerRadius(R).cornerRadius(5);
  const faixa = d3arc<{ startAngle: number; endAngle: number }>().innerRadius(R + 2).outerRadius(R + 6);
  const a = A(healthy), sx = Math.sin(a), sy = -Math.cos(a);
  const cor = corDoTom(tomDoScore(score, { ok: healthy, atencao: warning }));
  return (
    <svg viewBox="0 0 220 118" width={width} role="img" aria-label={label} style={{ display: 'block', height: 'auto' }}>
      <g transform="translate(110,98)">
        <path d={arc({ startAngle: -Math.PI / 2, endAngle: Math.PI / 2 })!} fill="color-mix(in srgb, var(--color-fg) 9%, transparent)" />
        <path d={faixa({ startAngle: a, endAngle: A(100) })!} fill="var(--color-ok)" opacity={0.5} />
        {score != null && score > 0 && <path d={arc({ startAngle: -Math.PI / 2, endAngle: A(score) })!} fill={cor} />}
        <line x1={sx * (r - 6)} y1={sy * (r - 6)} x2={sx * (R + 6)} y2={sy * (R + 6)} strokeWidth={2.5} stroke="var(--color-fg)" />
        <text className="ds-tick" x={-(R + r) / 2} y={16} textAnchor="middle">0</text>
        <text className="ds-tick" x={(R + r) / 2} y={16} textAnchor="middle">100</text>
        {score != null && (
          <>
            <path d={`M -3.5 0 L 0 -${r + 6} L 3.5 0 Z`} transform={`rotate(${(A(score) * 180) / Math.PI})`} fill="var(--color-fg)" />
            <circle r={8} fill="var(--color-fg)" />
            <circle r={3} fill="var(--color-bg)" />
          </>
        )}
      </g>
    </svg>
  );
}
