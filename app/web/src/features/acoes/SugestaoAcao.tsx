import { useState } from 'react';
import { Alert, Button, Chip } from '@/design-system';
import { numerosDaRota, useAcaoAtivaPorRota, useCriarAcao, useMudarStatusAcao, useSugerirAcao } from '@/data/hooks';
import { NOME_FERRAMENTA, temApi, type Sugestao } from '@/data/ia';
import { fmt } from '@/lib/format';
import type { SaudeRota } from '@/lib/score';
import { useFiltros } from '@/app/store';
import { ValidarAcaoModal } from './ValidarAcaoModal';
import { situacaoDaAcao } from './AcoesTabela';

const hoje = () => new Date().toISOString().slice(0, 10);

/**
 * Ação de uma rota, do começo ao fim:
 *  - em acompanhamento: responsável, prazo e score na validação → hoje, com Concluir/Cancelar;
 *  - sugerida: texto do guia (regra) ou da IA (tool use), com a fonte, e Validar/Descartar.
 */
export function SugestaoAcao({ rota }: { rota: SaudeRota }) {
  const ativa = useAcaoAtivaPorRota().get(rota.rota_id);
  const sugerir = useSugerirAcao();
  const criar = useCriarAcao();
  const mudar = useMudarStatusAcao();
  const abrirPratica = useFiltros((s) => s.abrirPratica);
  const [ia, setIa] = useState<Sugestao | null>(null);
  const [validando, setValidando] = useState(false);
  const [descartada, setDescartada] = useState(false);

  if (ativa) {
    const sit = situacaoDaAcao(ativa);
    return (
      <div className="cr-acao-bloco" data-estado="acompanhamento">
        <div className="cr-acao-t"><Chip tone={sit.tom}>{sit.texto}</Chip><span className="ds-muted">Ação validada em {fmt.data(ativa.validada_em)}</span></div>
        <p className="cr-acao-x">{ativa.acao}</p>
        <dl className="cr-dl">
          <div><dt>Responsável</dt><dd>{ativa.responsavel}</dd></div>
          <div><dt>Prazo</dt><dd data-c={sit.texto === 'Atrasada' ? 'bad' : undefined}>{fmt.data(ativa.prazo)}</dd></div>
          <div><dt>Score na validação → hoje</dt><dd>{fmt.int(ativa.score_inicial)} → {fmt.int(rota.score)}</dd></div>
        </dl>
        <div className="cr-acao-b">
          <Button variant="secondary" onClick={() => mudar.mutate({ id: ativa.id, status: 'Concluída' })} loading={mudar.isPending}>Marcar como concluída</Button>
          <Button variant="tertiary" onClick={() => mudar.mutate({ id: ativa.id, status: 'Cancelada' })} disabled={mudar.isPending}>Cancelar acompanhamento</Button>
        </div>
      </div>
    );
  }

  if (rota.situacao === 'Saudável' && !ia) {
    return (
      <div className="cr-acao-bloco">
        <div className="cr-acao-t"><Chip tone="ok">Sem ação</Chip></div>
        <p className="cr-acao-x">Nenhuma ação necessária: a rota está dentro das premissas.</p>
      </div>
    );
  }

  const texto = ia?.acao ?? rota.acao;
  const praticaId = ia?.pratica.id ?? rota.pratica_id;
  const praticaTitulo = ia?.pratica.titulo ?? rota.pratica;

  async function descartar() {
    await criar.mutateAsync({
      rota_id: rota.rota_id, perna: rota.perna, rota: rota.rota, acao: texto, acao_sugerida: texto, foco: rota.foco,
      responsavel: '', prazo: '', status: 'Descartada', score_inicial: rota.score == null ? null : Math.round(rota.score),
      validada_em: hoje(), validada_por: null, pratica_id: praticaId, origem_sugestao: ia ? 'ia' : 'regra', descartada_em: hoje(),
    });
    setDescartada(true);
    setIa(null);
  }

  return (
    <div className="cr-acao-bloco" data-estado="sugerida">
      <div className="cr-acao-t">
        <Chip tone="info">Sugerida</Chip>
        {ia ? <span className="ds-selo ds-selo--ia">Gerada por IA · {ia.meta.modo === 'claude' ? ia.meta.modelo : 'modo simulado'}</span>
          : <span className="ds-muted">Regra do guia</span>}
      </div>
      {descartada && <Alert tone="neutral">Sugestão anterior descartada e registrada no histórico.</Alert>}
      <p className="cr-acao-x">{texto}</p>
      {praticaId && (
        <p className="ds-note" style={{ margin: 0 }}>
          Fonte: guia de boas práticas, <button type="button" className="cr-link" onClick={() => abrirPratica(praticaId)}>{praticaId} · {praticaTitulo}</button>
        </p>
      )}
      {ia && (
        <div className="cr-ia">
          <p style={{ margin: 0 }}><b>Por quê:</b> {ia.justificativa}</p>
          <p className="ds-note" style={{ margin: 0 }}>
            A IA consultou: {[...new Set(ia.ferramentas_chamadas.filter((c) => c.nome !== 'propor_acao').map((c) => NOME_FERRAMENTA[c.nome] ?? c.nome))].join(' · ')}
            {' · '}{fmt.n1(ia.meta.ms / 1000)} s
            {ia.meta.custo_usd > 0 && <> · US$ {ia.meta.custo_usd.toFixed(4)}</>}
            {ia.meta.processado_em && <> · {new Date(ia.meta.processado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</>}
          </p>
          {ia.numeros_fora.length > 0 && (
            <Alert tone="warn" title="Números para conferir">A ação cita valores que não vieram do cálculo: {ia.numeros_fora.join(', ')}.</Alert>
          )}
          {ia.meta.aviso && <Alert tone="neutral">{ia.meta.aviso}</Alert>}
        </div>
      )}
      {sugerir.isError && <Alert tone="bad" title="A IA não conseguiu sugerir">{(sugerir.error as Error).message}. A sugestão do guia continua valendo.</Alert>}
      <div className="cr-acao-b">
        <Button onClick={() => setValidando(true)}>Validar e acompanhar</Button>
        {temApi && (
          <Button variant="secondary" loading={sugerir.isPending}
            onClick={() => sugerir.mutate(
              { rota_id: rota.rota_id, numeros: numerosDaRota(rota), foco: rota.foco_chave, tipo_mais_caro: rota.tipo_top },
              { onSuccess: (s) => { setIa(s); setDescartada(false); } },
            )}>
            {ia ? 'Sugerir de novo' : 'Sugerir com IA'}
          </Button>
        )}
        <Button variant="tertiary" onClick={descartar} disabled={criar.isPending}>Descartar</Button>
      </div>
      {validando && (
        <ValidarAcaoModal aberto rota={rota} acaoSugerida={texto} praticaId={praticaId} prazoDias={ia?.pratica.prazo_dias}
          origem={ia ? 'ia' : 'regra'} onFechar={() => setValidando(false)} />
      )}
    </div>
  );
}
