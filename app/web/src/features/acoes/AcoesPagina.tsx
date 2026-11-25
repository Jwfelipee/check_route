import { useState } from 'react';
import { Button, Card, Chip, Segmented, tomDaSituacao } from '@/design-system';
import { useAcaoAtivaPorRota, usePainel } from '@/data/hooks';
import { fmt } from '@/lib/format';
import { NOME_PERNA } from '@/lib/score';
import { PERNAS, type Perna } from '@/lib/types';
import { useFiltros } from '@/app/store';
import { PERNA_CFG } from '@/features/perna/config';
import { AcoesTabela } from './AcoesTabela';
import { SugestaoAcao } from './SugestaoAcao';

const POR_PAGINA = 6;

/**
 * Ações: rotas que pedem ação (sugestão do guia ou da IA, validar ou descartar),
 * ações em acompanhamento e o histórico (concluídas, canceladas e descartadas).
 */
export function AcoesPagina() {
  const { data, isLoading } = usePainel();
  const ativas = useAcaoAtivaPorRota();
  const abrirRota = useFiltros((s) => s.abrirRota);
  const [etapa, setEtapa] = useState<Perna | ''>('');
  const [mostrar, setMostrar] = useState(POR_PAGINA);

  const pedem = (data?.saudeRotas ?? [])
    .filter((r) => r.situacao !== 'Saudável' && r.situacao != null && !ativas.has(r.rota_id))
    .filter((r) => !etapa || r.perna === etapa)
    .sort((a, b) => (a.score ?? 0) - (b.score ?? 0));

  return (
    <section className="cr-stack" id="acoes">
      <Card id="rotas-pedem-acao" title="Rotas que pedem ação"
        note="Rotas críticas ou em atenção sem ação em andamento, da pior para a melhor. A sugestão vem do guia de boas práticas; a IA pode adaptá-la consultando os dados da rota."
        actions={<Segmented label="Filtrar pela etapa" value={etapa} onChange={(v) => { setEtapa(v); setMostrar(POR_PAGINA); }}
          options={[{ value: '', label: 'Todas' }, ...PERNAS.map((p) => ({ value: p, label: NOME_PERNA[p] }))]} />}>
        {isLoading && <div className="ds-skeleton" style={{ height: 120 }} />}
        <div className="cr-lista">
          {pedem.slice(0, mostrar).map((r) => (
            <article key={r.rota_id} className="cr-item" id={'acao-rota-' + r.rota_id}>
              <div className="sr-rt">
                <b>{r.rota}</b>
                <Chip tone={tomDaSituacao(r.situacao)}>{r.situacao}</Chip>
                <span className="ds-muted">{NOME_PERNA[r.perna]} · {r.transportadora}</span>
                <span className="sr-rpre">Score {fmt.int(r.score)}/100</span>
              </div>
              <p className="ds-note" style={{ margin: 0 }}>
                Prejuízo {fmt.brl(r.prejuizo)} em {fmt.int(r.ocorrencias)} ocorrências
                {r.acidentes > 0 && <> · <b data-c="bad">{fmt.n1(r.acidentes_mil)} acidentes por mil {PERNA_CFG[r.perna].unidade[1]}</b></>}
                {' '}· mais tira pontos: <b>{r.foco ?? '—'}</b>
                {' '}· <button type="button" className="cr-link" onClick={() => abrirRota(r.perna)}>ver na etapa</button>
              </p>
              <SugestaoAcao rota={r} />
            </article>
          ))}
        </div>
        {!isLoading && !pedem.length && <p className="ds-note" style={{ margin: 0 }}>Nenhuma rota pedindo ação nesta etapa: todas estão saudáveis ou já têm ação em andamento.</p>}
        {pedem.length > mostrar && (
          <div style={{ marginTop: 'var(--space-4)' }}>
            <Button variant="secondary" onClick={() => setMostrar((n) => n + POR_PAGINA)}>Mostrar mais {Math.min(POR_PAGINA, pedem.length - mostrar)} de {pedem.length - mostrar}</Button>
          </div>
        )}
      </Card>

      <Card id="acoes-em-acompanhamento" title="Em acompanhamento"
        note="Ações validadas, com responsável e prazo. O score na validação × hoje mostra se a ação está funcionando.">
        <AcoesTabela modo="ativas" vazio="Nenhuma ação em acompanhamento ainda." />
      </Card>

      <Card id="acoes-historico" title="Histórico" note="Ações concluídas, canceladas e sugestões descartadas.">
        <AcoesTabela modo="historico" vazio="Nada no histórico ainda." />
      </Card>
    </section>
  );
}
