import type { ReactNode } from 'react';
import { Icon } from './Icon';

export type AlertTone = 'ok' | 'warn' | 'bad' | 'info' | 'neutral';

/** Sucesso, atenção, crítico, informação e neutro: sempre ícone + texto, nunca só cor. */
export function Alert({ tone = 'info', title, children }: { tone?: AlertTone; title?: ReactNode; children?: ReactNode }) {
  return (
    <div className="ds-alert" data-c={tone} role={tone === 'bad' ? 'alert' : 'status'}>
      <span data-c={tone === 'neutral' ? undefined : tone}><Icon name={tone} size={18} /></span>
      <div>
        {title && <b>{title}</b>}
        {children}
      </div>
    </div>
  );
}
