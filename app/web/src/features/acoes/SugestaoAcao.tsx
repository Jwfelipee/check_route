import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Chip } from '@/design-system';
import { useAcaoAtivaPorRota, useCriarAcao, useDarDetalhes, useMudarStatusAcao, useSugestaoAcao } from '@/data/hooks';
import { ErroApi, NOME_DADO_PESSOAL, NOME_FERRAMENTA, temApi } from '@/data/ia';
import { fmt } from '@/lib/format';
import type { SaudeRota } from '@/lib/score';
import { useFiltros } from '@/app/store';
import { ValidarAcaoModal } from './ValidarAcaoModal';
import { situacaoDaAcao } from './AcoesTabela';

const hoje = () => new Date().toISOString().slice(0, 10);
const MAX_DETALHES = 600;

/** true quando o bloco aparece na tela: a IA só trabalha para quem está olhando (e não para a lista inteira de uma vez). */
function useVisivel<T extends Element>() {
  const ref = useRef<T>(null);
  const [visivel, setVisivel] = useState(typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    if (visivel || !ref.current) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisivel(true); io.disconnect(); } }, { rootMargin: '120px' });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [visivel]);
  return [ref, visivel] as const;
}

const MOTIVO: Record<string, string> = {
  sem_chave: 'A chave da IA não está configurada no servidor.',
  mcp_indisponivel: 'Não consegui consultar os dados detalhados da rota.',
  falha_ia: 'A IA não respondeu como esperado.',
};

/**
 * Ação de uma rota, do começo ao fim:
 *  - em acompanhamento: responsável, prazo e score na validação → hoje, com Concluir/Cancelar;
 *  - sugerida: SEMPRE pela IA, a partir do guia de boas práticas e dos dados da rota (MCP). Cita as
 *    práticas usadas, aceita "Dar detalhes" (a pessoa conta o que os dados não mostram) e só vira
 *    compromisso quando alguém valida.
 */
export function SugestaoAcao({ rota }: { rota: SaudeRota }) {
  const ativa = useAcaoAtivaPorRota().get(rota.rota_id);
  const [ref, visivel] = useVisivel<HTMLDivElement>();
  const precisa = !ativa && rota.situacao !== 'Saudável';
  const sug = useSugestaoAcao(rota, precisa && visivel);
  const detalhes = useDarDetalhes(rota);
  const criar = useCriarAcao();
  const mudar = useMudarStatusAcao();
  const qc = useQueryClient();
  const abrirPratica = useFiltros((s) => s.abrirPratica);
  const [validando, setValidando] = useState(false);
  const [descartada, setDescartada] = useState(false);
  const [dandoDetalhes, setDandoDetalhes] = useState(false);
  const [texto, setTexto] = useState('');

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

  if (!precisa) {
    return (
      <div className="cr-acao-bloco">
        <div className="cr-acao-t"><Chip tone="ok">Sem ação</Chip></div>
        <p className="cr-acao-x">Nenhuma ação necessária: a rota está dentro das premissas.</p>
      </div>
    );
  }

  if (!temApi) {
    return (
      <div className="cr-acao-bloco" ref={ref}>
        <div className="cr-acao-t"><Chip tone="info">Sugerida</Chip></div>
        <p className="cr-acao-x">A sugestão de ação é gerada por IA a partir dos dados da rota. Conecte a API do painel para ver a sugestão.</p>
      </div>
    );
  }

  const s = detalhes.data ?? sug.data;
  const erro = (detalhes.error ?? sug.error) as ErroApi | null;
  const gerando = sug.isFetching || detalhes.isPending;

  async function descartar() {
    if (!s) return;
    try {
      await criar.mutateAsync({
      rota_id: rota.rota_id, perna: rota.perna, rota: rota.rota, acao: s.acao, acao_sugerida: s.acao, foco: rota.foco,
      responsavel: '', prazo: '', status: 'Descartada', score_inicial: rota.score == null ? null : Math.round(rota.score),
      validada_em: hoje(), validada_por: null, pratica_id: s.praticas.find((p) => p.papel === 'principal')?.id ?? null,
      origem_sugestao: s.contexto ? 'ia_contexto' : 'ia', descartada_em: hoje(),
      });
    } catch { return; } // o erro aparece no bloco (criar.isError)
    detalhes.reset();
    setDescartada(true);
    // Com a ação descartada no histórico os dados da rota mudam: a IA prepara outra, sabendo do que não serviu.
    await qc.invalidateQueries({ queryKey: ['sugestao', rota.rota_id] });
  }

  function enviarDetalhes() {
    if (!texto.trim()) return;
    detalhes.mutate(texto.trim(), { onSuccess: () => { setDandoDetalhes(false); setTexto(''); setDescartada(false); } });
  }

  const principal = s?.praticas.find((p) => p.papel === 'principal') ?? s?.praticas[0];

  return (
    <div className="cr-acao-bloco" data-estado="sugerida" ref={ref} aria-busy={gerando}>
      <div className="cr-acao-t">
        <Chip tone="info">Sugerida</Chip>
        <span className="ds-selo ds-selo--ia">Gerada por IA{s ? ` · ${s.simulado ? 'modo simulado' : s.meta?.modelo}` : ''}</span>
        {s && s.versao > 1 && <span className="ds-muted">Versão {s.versao}</span>}
      </div>

      {descartada && !gerando && <Alert tone="neutral">Sugestão anterior descartada e registrada no histórico. Esta nova leva isso em conta.</Alert>}

      {!s && !erro && (
        <>
          <div className="ds-skeleton" style={{ height: 64 }} />
          <p className="ds-note" style={{ margin: 0 }} role="status">A IA está analisando o guia de boas práticas e os dados da rota…</p>
        </>
      )}

      {!s && !gerando && erro && (
        <Alert tone="bad" title="A IA não conseguiu sugerir uma ação agora">
          {MOTIVO[erro.motivo ?? ''] ?? erro.message} {erro.motivo === 'sem_chave' ? '' : 'Tente de novo em instantes.'}
        </Alert>
      )}

      {s && (
        <>
          {gerando && <p className="ds-note" style={{ margin: 0 }} role="status">Gerando uma nova sugestão com os seus detalhes…</p>}
          <p className="cr-acao-x">{s.acao}</p>
          <div>
            <p className="ds-note" style={{ margin: '0 0 var(--space-1)' }}>Baseado no guia de boas práticas:</p>
            <ul className="cr-praticas">
              {s.praticas.map((p) => (
                <li key={p.id}>
                  <button type="button" className="cr-link" onClick={() => abrirPratica(p.id)}>{p.id} · {p.titulo}</button>
                  <span className="ds-muted"> ({p.papel}) {p.como_usou}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="cr-ia">
            <p style={{ margin: 0 }}><b>Por quê:</b> {s.justificativa}</p>
            {s.considerou_contexto && <p style={{ margin: 0 }}><b>Considerou seus detalhes:</b> {s.considerou_contexto}</p>}
            <p className="ds-note" style={{ margin: 0 }}>
              A IA consultou: {[...new Set(s.ferramentas_chamadas.filter((c) => c.nome !== 'propor_acao').map((c) => NOME_FERRAMENTA[c.nome] ?? c.nome))].join(' · ')}
              {' · '}{s.cache
                ? <>reaproveitada de {new Date(s.criada_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</>
                : s.meta && <>{fmt.n1(s.meta.ms / 1000)} s{s.meta.custo_usd > 0 && <> · US$ {s.meta.custo_usd.toFixed(4)}</>}</>}
            </p>
            {s.numeros_fora.length > 0 && (
              <Alert tone="warn" title="Números para conferir">A ação cita valores que não vieram do cálculo: {s.numeros_fora.join(', ')}.</Alert>
            )}
            {s.privacidade.mascarados.length > 0 && (
              <Alert tone="neutral" title="Dados pessoais mascarados">Nos seus detalhes foram ocultados: {s.privacidade.mascarados.map((m) => NOME_DADO_PESSOAL[m] ?? m).join(', ')}.</Alert>
            )}
            {s.guardas.instrucao_suspeita && (
              <Alert tone="warn" title="Instrução suspeita nos detalhes">O texto tentava dar ordens à IA ({s.guardas.motivos.join('; ')}). Foi tratado só como informação.</Alert>
            )}
          </div>
        </>
      )}

      {erro && s && <Alert tone="bad" title="Não consegui gerar outra sugestão">{MOTIVO[erro.motivo ?? ''] ?? erro.message} A anterior continua valendo.</Alert>}

      {criar.isError && <Alert tone="bad" title="Não foi possível descartar">{(criar.error as Error).message}</Alert>}

      {dandoDetalhes && (
        <form className="ds-campo" onSubmit={(e) => { e.preventDefault(); enviarDetalhes(); }}>
          <label htmlFor={`detalhes-${rota.rota_id}`}>O que a IA precisa saber sobre esta rota?</label>
          <textarea id={`detalhes-${rota.rota_id}`} value={texto} maxLength={MAX_DETALHES} rows={3} autoFocus
            placeholder="Ex.: a transportadora trocou de motorista em outubro; o trecho está em obra desde setembro"
            onChange={(e) => setTexto(e.target.value)} />
          <small>{texto.length}/{MAX_DETALHES}. Não escreva telefone, CPF ou nome de pessoas: eles são ocultados.</small>
          <div className="cr-acao-b">
            <Button type="submit" loading={detalhes.isPending} disabled={!texto.trim()}>Gerar nova sugestão</Button>
            <Button type="button" variant="tertiary" onClick={() => { setDandoDetalhes(false); setTexto(''); }} disabled={detalhes.isPending}>Cancelar</Button>
          </div>
        </form>
      )}

      <div className="cr-acao-b">
        {s ? (
          <>
            <Button onClick={() => setValidando(true)} disabled={gerando}>Validar e acompanhar</Button>
            {!dandoDetalhes && <Button variant="secondary" onClick={() => setDandoDetalhes(true)} disabled={gerando}>Dar detalhes</Button>}
            <Button variant="tertiary" onClick={descartar} disabled={criar.isPending || gerando}>Descartar</Button>
          </>
        ) : (
          !gerando && erro && <Button variant="secondary" onClick={() => sug.refetch()}>Tentar de novo</Button>
        )}
      </div>

      {validando && s && (
        <ValidarAcaoModal aberto rota={rota} acaoSugerida={s.acao} praticaId={principal?.id ?? null} prazoDias={principal?.prazo_dias}
          origem={s.contexto ? 'ia_contexto' : 'ia'} onFechar={() => setValidando(false)} />
      )}
    </div>
  );
}

