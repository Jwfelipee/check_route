import type { Situacao } from '@/lib/types';

export type Tom = 'ok' | 'warn' | 'bad' | '';

export const tomDaSituacao = (s: Situacao | null | undefined): Tom =>
  s === 'Saudável' ? 'ok' : s === 'Atenção' ? 'warn' : s === 'Crítica' ? 'bad' : '';

/** Tom de um score pelas faixas (padrão 85/65, vindas das premissas). */
export const tomDoScore = (score: number | null | undefined, f = { ok: 85, atencao: 65 }): Tom =>
  score == null ? '' : score >= f.ok ? 'ok' : score >= f.atencao ? 'warn' : 'bad';

/** Variação: subir é bom (up) ou ruim (down)? */
export const tomDaVariacao = (v: number | null | undefined, bomQuando: 'up' | 'down' = 'up', tolerancia = 0.0005): Tom =>
  v == null || Math.abs(v) < tolerancia ? '' : (v > 0) === (bomQuando === 'up') ? 'ok' : 'bad';

export const corDoTom = (t: Tom) =>
  t === 'ok' ? 'var(--color-ok)' : t === 'warn' ? 'var(--color-warn)' : t === 'bad' ? 'var(--color-bad)' : 'var(--color-fg-muted)';
