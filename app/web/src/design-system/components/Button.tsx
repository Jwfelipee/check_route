import type { ButtonHTMLAttributes } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'danger';

/**
 * Primário azul (ex.: "Validar e acompanhar"), secundário com borda azul ("Ver evidências"),
 * terciário textual ("Cancelar"), destrutivo vermelho só para exclusão confirmada.
 * `loading` desabilita e marca aria-busy.
 */
export function Button({ variant = 'primary', loading, className, children, disabled, ...rest }:
  { variant?: ButtonVariant; loading?: boolean } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className={`ds-btn ds-btn--${variant} ${className ?? ''}`} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? 'Carregando…' : children}
    </button>
  );
}
