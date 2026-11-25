import { useEffect, useRef, type ReactNode } from 'react';
import { Icon } from './Icon';

/**
 * Diálogo modal (raio 16): foco preso dentro dele, Esc fecha, e o foco volta
 * para quem abriu ao fechar.
 */
export function Modal({ titulo, descricao, aberto, onFechar, children, rodape, id }: {
  titulo: string; descricao?: ReactNode; aberto: boolean; onFechar: () => void; children: ReactNode; rodape?: ReactNode; id?: string;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  // Guarda a função mais recente sem reexecutar o efeito (senão o foco pularia a cada render).
  const fechar = useRef(onFechar);
  fechar.current = onFechar;

  useEffect(() => {
    if (!aberto) return;
    const anterior = document.activeElement as HTMLElement | null;
    const focaveis = () =>
      Array.from(caixa.current?.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])') ?? [])
        .filter((el) => !el.hasAttribute('disabled'));
    (focaveis().find((el) => el.matches('input, textarea, select')) ?? focaveis()[0])?.focus();
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); fechar.current(); return; }
      if (e.key !== 'Tab') return;
      const els = focaveis();
      if (!els.length) return;
      const [primeiro, ultimo] = [els[0], els[els.length - 1]];
      if (e.shiftKey && document.activeElement === primeiro) { e.preventDefault(); ultimo.focus(); }
      else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro.focus(); }
    };
    document.addEventListener('keydown', tecla);
    const rolagem = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', tecla);
      document.body.style.overflow = rolagem;
      anterior?.focus();
    };
  }, [aberto]);

  if (!aberto) return null;
  return (
    <div className="ds-modal-fundo" onMouseDown={(e) => e.target === e.currentTarget && onFechar()}>
      <div className="ds-modal" role="dialog" aria-modal="true" aria-labelledby="ds-modal-t" ref={caixa} id={id}>
        <div className="ds-modal-h">
          <h2 id="ds-modal-t">{titulo}</h2>
          <button type="button" className="ds-modal-x" aria-label="Fechar" onClick={onFechar}><Icon name="fechar" /></button>
        </div>
        {descricao && <p className="ds-note" style={{ margin: 0 }}>{descricao}</p>}
        <div className="ds-modal-b">{children}</div>
        {rodape && <div className="ds-modal-f">{rodape}</div>}
      </div>
    </div>
  );
}
