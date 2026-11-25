import { Icon, type IconName } from '@/design-system';
import { useFiltros, type Pagina } from './store';

const ITENS: { pagina: Pagina; label: string; icon: IconName }[] = [
  { pagina: 'visao', label: 'Visão geral', icon: 'visao' },
  { pagina: 'rotas', label: 'Saúde das rotas', icon: 'rotas' },
  { pagina: 'ocorrencias', label: 'Ocorrências', icon: 'ocorrencias' },
  { pagina: 'acoes', label: 'Ações', icon: 'acoes' },
  { pagina: 'atendimentos', label: 'Atendimentos', icon: 'conversas' },
  { pagina: 'guia', label: 'Guia de boas práticas', icon: 'guia' },
];

/**
 * Menu lateral (248 px, azul profundo). Marca no produto: símbolo + nome em texto, sem slogan.
 * No tablet e no celular vira gaveta aberta pelo botão do cabeçalho.
 */
export function Sidebar() {
  const { pagina, setPagina, menuAberto, setMenuAberto } = useFiltros();
  return (
    <>
      <nav className="cr-side" id="menu" aria-label="Menu principal" data-aberto={menuAberto || undefined}>
        <div className="cr-brand">
          <span className="cr-brand-sym"><img src="/brand/checkroute-simbolo.png" alt="" width={36} height={37} /></span>
          <span className="cr-brand-n">CheckRoute</span>
          <button type="button" className="cr-side-x" aria-label="Fechar menu" onClick={() => setMenuAberto(false)}><Icon name="fechar" /></button>
        </div>
        <ul className="cr-nav">
          {ITENS.map((it) => (
            <li key={it.label}>
              <button type="button" className="cr-nav-i" aria-current={pagina === it.pagina ? 'page' : undefined} onClick={() => setPagina(it.pagina)}>
                <Icon name={it.icon} /> <span>{it.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </nav>
      {menuAberto && <div className="cr-scrim" onClick={() => setMenuAberto(false)} aria-hidden="true" />}
    </>
  );
}
