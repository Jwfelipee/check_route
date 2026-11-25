import type { ReactNode } from 'react';
import type { Tom } from '../tone';

/** Cartão de indicador: rótulo, número grande (serif, tabular) e nota com a variação. */
export function Kpi({ label, value, tone, note, loading, id }: { label: string; value: ReactNode; tone?: Tom; note?: ReactNode; loading?: boolean; id?: string }) {
  return (
    <div className="ds-kpi" id={id}>
      <div className="ds-kpi-l">{label}</div>
      <div className={'ds-kpi-v' + (loading ? ' ds-skeleton' : '')} data-c={tone || undefined}>{loading ? '—' : value}</div>
      {note && <div className="ds-kpi-n">{note}</div>}
    </div>
  );
}
