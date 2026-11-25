import type { ButtonHTMLAttributes } from 'react';

export function Button({ variant = 'primary', className, ...rest }: { variant?: 'primary' | 'secondary' } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" className={`ds-btn ds-btn--${variant} ${className ?? ''}`} {...rest} />;
}
