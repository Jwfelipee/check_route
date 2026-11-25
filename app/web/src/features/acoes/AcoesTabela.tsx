import { Button, Chip, type Tom } from '@/design-system';
import { useAcoes, useMudarStatusAcao, usePainel } from '@/data/hooks';
import { fmt } from '@/lib/format';
import { NOME_PERNA } from '@/lib/score';
import type { Acao, Perna } from '@/lib/types';

const hoje = () => new Date().toISOString().slice(0, 10);

export function situacaoDaAcao(a: Acao): { texto: string; tom: Tom } {
  if (a.status === 'Em acompanhamento') {
    return a.prazo < hoje() ? { texto: 'Atrasada', tom: 'bad' } : { texto: 'Em andamento', tom: 'warn' };
  }
  if (a.status === 'Concluída') return { texto: 'Concluída', tom: 'ok' };
  return { texto: a.status, tom: '' };
}

/**
 * Ações validadas (§3.6): "ativas" = em acompanhamento; "historico" = concluídas,
 * canceladas e descartadas. Score na validação × hoje mostra se a ação funcionou.
 */
export function AcoesTabela({ perna, modo, vazio }: { perna?: Perna; modo: 'ativas' | 'historico'; vazio: string }) {
  const { data: acoes, isLoading, error } = useAcoes();
  const { data } = usePainel();
  const mudar = useMudarStatusAcao();
  const scoreHoje = new Map((data?.saudeRotas ?? []).map((r) => [r.rota_id, r.score]));
  const lista = (acoes ?? [])
    .filter((a) => !perna || a.perna === perna)
    .filter((a) => (modo === 'ativas' ? a.status === 'Em acompanhamento' : a.status !== 'Em acompanhamento'))
    .sort((a, b) => (modo === 'ativas' ? a.prazo.localeCompare(b.prazo) : (b.validada_em ?? '').localeCompare(a.validada_em ?? '')));

  if (error) return <p className="ds-erro">Não foi possível carregar as ações: {(error as Error).message}</p>;
  if (isLoading) return <div className="ds-skeleton" style={{ height: 48 }} />;
  if (!lista.length) return <p className="ds-note" style={{ margin: 0 }}>{vazio}</p>;

  return (
    <div className="ds-table-box">
      <table className="ds-table">
        <thead><tr>
          <th>Rota</th>{!perna && <th>Etapa</th>}<th>Ação</th><th>Responsável</th><th className="num">Prazo</th>
          <th className="num">Validada em</th><th className="num">Score na validação</th><th className="num">Score hoje</th><th>Situação</th>
          {modo === 'ativas' && <th><span className="ds-sr-only">Ações</span></th>}
        </tr></thead>
        <tbody>
          {lista.map((a) => {
            const sit = situacaoDaAcao(a);
            const atual = scoreHoje.get(a.rota_id);
            const delta = atual != null && a.score_inicial != null ? atual - a.score_inicial : null;
            return (
              <tr key={a.id}>
                <td>{a.rota}</td>
                {!perna && <td>{NOME_PERNA[a.perna]}</td>}
                <td style={{ whiteSpace: 'normal', minWidth: 260, fontWeight: 400 }}>{a.acao}</td>
                <td>{a.status === 'Descartada' ? '—' : a.responsavel || '—'}</td>
                <td className="num" data-c={sit.texto === 'Atrasada' ? 'bad' : undefined}>{a.status === 'Descartada' ? '—' : fmt.data(a.prazo)}</td>
                <td className="num">{fmt.data(a.status === 'Descartada' ? a.descartada_em ?? a.validada_em : a.validada_em)}</td>
                <td className="num">{a.score_inicial == null ? '—' : fmt.int(a.score_inicial)}</td>
                <td className="num">
                  {atual == null ? '—' : fmt.int(atual)}
                  {delta != null && <small data-c={delta > 0.5 ? 'ok' : delta < -0.5 ? 'bad' : undefined}> ({fmt.sint(delta)})</small>}
                </td>
                <td><Chip tone={sit.tom}>{sit.texto}</Chip></td>
                {modo === 'ativas' && (
                  <td>
                    <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                      <Button variant="secondary" onClick={() => mudar.mutate({ id: a.id, status: 'Concluída' })} disabled={mudar.isPending}>Concluir</Button>
                      <Button variant="tertiary" onClick={() => mudar.mutate({ id: a.id, status: 'Cancelada' })} disabled={mudar.isPending}>Cancelar</Button>
                    </div>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
