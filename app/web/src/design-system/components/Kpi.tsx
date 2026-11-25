import type { ReactNode } from 'react';
import type { Tom } from '../tone';

/** Cartão de indicador: título, valor (com unidade opcional, ex.: "/100") e nota com período/comparação. */
export function Kpi({ label, value, unit, tone, note, loading, id }: {
  label: string; value: ReactNode; unit?: string; tone?: Tom; note?: ReactNode; loading?: boolean; id?: string;
}) {
  return (
    <div className="ds-kpi" id={id}>
      <div className="ds-kpi-l">{label}</div>
      <div className={'ds-kpi-v' + (loading ? ' ds-skeleton' : '')} data-c={tone || undefined}>
        {loading ? '—' : value}{!loading && unit && <small>{unit}</small>}
      </div>
      {note && <div className="ds-kpi-n">{note}</div>}
    </div>
  );
}
