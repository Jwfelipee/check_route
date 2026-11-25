import { Segmented } from '@/design-system';
import { usePainel } from '@/data/hooks';
import { fmt } from '@/lib/format';
import { useFiltros } from './store';
import { PernaSelector } from '@/features/painel/PernaSelector';
import { PernaView } from '@/features/perna/PernaView';
import { Guia } from '@/features/guia/Guia';

export function App() {
  const { data, isLoading, error } = usePainel();
  const { aba, setAba, perna } = useFiltros();
  const ref = data?.fontes.referencia;
  const geral = data?.kpisTotal.find((k) => k.perna === 'geral');

  return (
    <div className="ds-page" id="saude-rotas">
      <header className="sr-head" id="cabecalho">
        <div className="sr-logo">e.</div>
        <div>
          <h1 className="sr-ttl">Saúde das rotas</h1>
          <p className="sr-sub">Protótipo do Hackathon Eteg · Equipe 3 · dados fictícios · posição de {ref ? fmt.data(ref.data) : '—'}</p>
        </div>
        <Segmented size="lg" label="Escolher a aba" value={aba} onChange={setAba}
          options={[{ value: 'painel', label: 'Painel' }, { value: 'guia', label: 'Guia de boas práticas' }]} />
      </header>

      {error && <p className="ds-err">Não foi possível carregar os dados: {String((error as Error).message)}</p>}

      {aba === 'painel' ? (
        <>
          <p className="sr-lede" id="resumo">
            {isLoading || !geral || !ref ? '…' : (
              <>Em <b>{fmt.mesNome(ref.mes)} (até {fmt.data(ref.data).slice(0, 5)})</b>, a operação tem <b>{fmt.int(geral.n_criticas)}</b> rotas críticas
                de <b>{fmt.int(geral.n_rotas)}</b> e <b>{fmt.brlk(geral.prejuizo)}</b> de prejuízo com ocorrências. A perna com o menor score é
                a <b>{geral.pior_nome}</b>, com <b>{fmt.int(geral.pior_score)}</b>.</>
            )}
          </p>
          <PernaSelector />
          <p className="ds-muted" style={{ margin: '-6px 0 0', fontSize: 12 }}>Clique em uma perna para ver as rotas, o prejuízo e as premissas dela. Cada perna tem as suas premissas.</p>
          <PernaView perna={perna} key={perna} />
        </>
      ) : (
        <Guia />
      )}

      <p className="ds-muted" style={{ fontSize: 11.5 }}>Todos os números são fictícios, gerados para o protótipo do hackathon. Nenhum dado real de cliente.</p>
    </div>
  );
}
