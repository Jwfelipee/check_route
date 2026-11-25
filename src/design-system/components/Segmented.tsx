export interface SegOption<T extends string> { value: T; label: string }

/** Grupo de botões exclusivos (filtro de situação, abas, perna do guia). */
export function Segmented<T extends string>({ options, value, onChange, label, size }: {
  options: SegOption<T>[]; value: T; onChange: (v: T) => void; label: string; size?: 'lg';
}) {
  return (
    <div className={'ds-seg' + (size === 'lg' ? ' ds-seg--lg' : '')} role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}
