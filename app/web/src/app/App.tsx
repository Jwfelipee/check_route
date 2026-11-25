import { Alert, Icon } from '@/design-system';
import { usePainel } from '@/data/hooks';
import { fmt } from '@/lib/format';
import { useFiltros, type Pagina } from './store';
import { Sidebar } from './Sidebar';
import { PernaSelector } from '@/features/painel/PernaSelector';
import { PernaView } from '@/features/perna/PernaView';
import { Guia } from '@/features/guia/Guia';
import { VisaoGeral } from '@/features/visao/VisaoGeral';
import { OcorrenciasPagina } from '@/features/ocorrencias/OcorrenciasPagina';
import { AcoesPagina } from '@/features/acoes/AcoesPagina';
import { ContatosPagina } from '@/features/contatos/ContatosPagina';

const TITULO: Record<Pagina, string> = {
  visao: 'Visão geral',
  rotas: 'Saúde das rotas',
  ocorrencias: 'Ocorrências',
  acoes: 'Ações',
  contatos: 'Contatos',
  guia: 'Guia de boas práticas',
};

/** Casca do produto: menu lateral (248 px) + cabeçalho (64 px) + conteúdo com margem de 24 px. */
export function App() {
  const { data, isLoading, error } = usePainel();
  const { pagina, perna, setMenuAberto } = useFiltros();
  const ref = data?.fontes.referencia;
  const geral = data?.kpisTotal.find((k) => k.perna === 'geral');
  const periodo = ref ? `${fmt.mesNome(ref.mes)[0].toUpperCase()}${fmt.mesNome(ref.mes).slice(1)} ${ref.mes.slice(0, 4)}` : '—';

  return (
    <div className="cr-app">
      <a className="cr-skip" href="#conteudo">Pular para o conteúdo</a>
      <Sidebar />
      <div className="cr-main">
        <header className="cr-head" id="cabecalho">
          <button type="button" className="cr-menu-btn" aria-label="Abrir menu" aria-controls="menu" onClick={() => setMenuAberto(true)}>
            <Icon name="menu" />
          </button>
          <div className="cr-head-t">
            <h1>{TITULO[pagina]}</h1>
            <p>{periodo} | {pagina === 'rotas' ? 'Por etapa' : 'Todas as etapas'} · posição de {ref ? fmt.data(ref.data) : '—'}</p>
          </div>
        </header>

        <main className="ds-page" id="conteudo" tabIndex={-1}>
          {error && (
            <Alert tone="bad" title="Não foi possível carregar os dados">
              {String((error as Error).message)}. Confira se a API está no ar e recarregue a página.
            </Alert>
          )}

          {pagina === 'visao' && <VisaoGeral />}

          {pagina === 'rotas' && (
            <>
              <p className="sr-lede" id="resumo">
                {isLoading || !geral || !ref ? '…' : (
                  <>Em <b>{fmt.mesNome(ref.mes)} (até {fmt.data(ref.data).slice(0, 5)})</b>, a operação tem <b>{fmt.int(geral.n_criticas)}</b> rotas críticas
                    de <b>{fmt.int(geral.n_rotas)}</b> e <b>{fmt.brlk(geral.prejuizo)}</b> de prejuízo com ocorrências. A etapa com o menor score é
                    a <b>{geral.pior_nome}</b>, com <b>{fmt.int(geral.pior_score)}/100</b>.</>
                )}
              </p>
              <PernaSelector />
              <p className="ds-note" style={{ margin: 'calc(var(--space-2) * -1) 0 0' }}>Escolha uma etapa para ver as rotas, o prejuízo e as premissas dela. Cada etapa tem as suas premissas.</p>
              <PernaView perna={perna} key={perna} />
            </>
          )}

          {pagina === 'ocorrencias' && <OcorrenciasPagina />}
          {pagina === 'acoes' && <AcoesPagina />}
          {pagina === 'contatos' && <ContatosPagina />}
          {pagina === 'guia' && <Guia />}
        </main>
      </div>
    </div>
  );
}
