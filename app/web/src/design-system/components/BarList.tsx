import type { Tom } from '../tone';

export interface BarItem { key: string; label: string; value: number; display: string; detail?: string; tone?: Tom }

/** Lista de barras horizontais proporcionais ao maior valor (ex.: prejuízo por tipo de ocorrência). */
export function BarList({ items, empty = 'Nenhuma ocorrência no mês.' }: { items: BarItem[]; empty?: string }) {
  if (!items.length) return <div className="ds-muted" style={{ fontSize: 'var(--fs-sm)' }}>{empty}</div>;
  const max = Math.max(...items.map((x) => x.value)) || 1;
  return (
    <div className="ds-bars">
      {items.map((x) => (
        <div className="ds-bar-row" key={x.key}>
          <span title={x.label}>{x.label}</span>
          <div className="ds-track"><i data-c={x.tone || undefined} style={{ width: `${Math.max(2, (x.value / max) * 100)}%` }} /></div>
          <em>{x.display}{x.detail && <small>{x.detail}</small>}</em>
        </div>
      ))}
    </div>
  );
}
