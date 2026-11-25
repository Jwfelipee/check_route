import type { HTMLAttributes, ReactNode } from 'react';

export function Card({ title, note, actions, children, ...rest }: { title?: ReactNode; note?: ReactNode; actions?: ReactNode } & HTMLAttributes<HTMLElement>) {
  return (
    <section className="ds-card" {...rest}>
      {(title || actions) && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          {title && <h2 style={{ margin: 0, fontSize: 'var(--fs-md)', fontWeight: 600 }}>{title}</h2>}
          {actions}
        </div>
      )}
      {note && <p className="ds-note">{note}</p>}
      {children}
    </section>
  );
}
