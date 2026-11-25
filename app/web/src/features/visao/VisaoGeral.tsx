import { useMemo } from 'react';
import { BarList, Card, Chip, Kpi, tomDaSituacao, tomDoScore } from '@/design-system';
import { useAcaoAtivaPorRota, usePainel } from '@/data/hooks';
import { SugestaoAcao } from '@/features/acoes/SugestaoAcao';
import { fmt } from '@/lib/format';
import { faixas, NOME_PERNA } from '@/lib/score';
import { PERNAS } from '@/lib/types';
import { useFiltros } from '@/app/store';

/** Taxa = ocorrências / operações × 1.000; denominador zero vira indisponível, nunca zero. */
const taxaPorMil = (ocorrencias: number, unidades: number) => (unidades > 0 ? (ocorrencias / unidades) * 1000 : null);

/**
 * Visão geral (design system CheckRoute, 03 / Navegação): KPIs da operação inteira no mês,
 * perdas por etapa, ação prioritária e ranking financeiro. Não depende dos filtros da perna.
 */
export function VisaoGeral() {
  const { data, isLoading } = usePainel();
  const abrirRota = useFiltros((s) => s.abrirRota);
  const ativas = useAcaoAtivaPorRota();
  const f = data ? faixas(data.fontes.premissas) : { ok: 85, atencao: 65 };
  const ref = data?.fontes.referencia;

  const resumo = useMemo(() => {
    if (!data || !ref) return null;
    const doMes = data.rotaMes.filter((r) => r.mes === ref.mes);
    const soma = (rs: typeof doMes, k: 'ocorrencias' | 'unidades' | 'prejuizo' | 'economia') => rs.reduce((s, r) => s + (r[k] || 0), 0);
    const porEtapa = PERNAS.map((perna) => {
      const rs = doMes.filter((r) => r.perna === perna);
      const unidades = soma(rs, 'unidades');
      return {
        perna, unidades, ocorrencias: soma(rs, 'ocorrencias'), prejuizo: soma(rs, 'prejuizo'),
        score: unidades ? rs.reduce((s, r) => s + (r.score || 0) * r.unidades, 0) / unidades : null,
      };
    });
    const unidades = soma(doMes, 'unidades');
    return {
      ocorrencias: soma(doMes, 'ocorrencias'),
      prejuizo: soma(doMes, 'prejuizo'),
      economia: soma(doMes, 'economia'),
      taxa: taxaPorMil(soma(doMes, 'ocorrencias'), unidades),
      score: unidades ? doMes.reduce((s, r) => s + (r.score || 0) * r.unidades, 0) / unidades : null,
      porEtapa,
    };
  }, [data, ref]);

  const rotasDoMes = data?.saudeRotas ?? [];
  // Pior rota que ainda não tem ação em andamento (se todas tiverem, a pior de todas).
  const porScore = [...rotasDoMes].filter((r) => r.score != null).sort((a, b) => a.score! - b.score! || b.prejuizo - a.prejuizo);
  const prioritaria = porScore.find((r) => !ativas.has(r.rota_id)) ?? porScore[0];
  const ranking = [...rotasDoMes].sort((a, b) => b.prejuizo - a.prejuizo).slice(0, 5);
  const carregando = isLoading || !resumo;

  return (
    <section className="cr-stack" id="visao-geral">
      <div className="ds-kpis cr-kpis-4">
        <Kpi id="kpi-ocorrencias" loading={carregando} label="Ocorrências únicas" value={fmt.int(resumo?.ocorrencias)}
          note={ref ? `${fmt.mesNome(ref.mes)} até ${fmt.data(ref.data).slice(0, 5)} · todas as etapas` : undefined} />
        <Kpi id="kpi-perdas" loading={carregando} label="Perdas registradas" value={fmt.brlk(resumo?.prejuizo)}
          note="Custos das ocorrências do mês (efetivados e provisionados)" />
        <Kpi id="kpi-taxa" loading={carregando} label="Taxa por mil operações" value={resumo?.taxa == null ? 'Indisponível' : fmt.n1(resumo.taxa)}
          note="Ocorrências ÷ coletas, viagens e entregas do mês × 1.000" />
        <Kpi id="kpi-score" loading={carregando} label="Score geral" value={fmt.int(resumo?.score)} unit="/100" tone={tomDoScore(resumo?.score, f)}
          note={<>Média ponderada pelas operações · saudável a partir de <span>{f.ok}</span></>} />
      </div>

      <div className="cr-grid-2">
        <Card id="perdas-por-etapa" title="Perdas por etapa" note="Prejuízo com ocorrências no mês e a taxa por mil operações de cada etapa.">
          <BarList items={(resumo?.porEtapa ?? []).map((e) => ({
            key: e.perna, label: NOME_PERNA[e.perna], value: e.prejuizo, display: fmt.brlk(e.prejuizo),
            detail: `${fmt.n1(taxaPorMil(e.ocorrencias, e.unidades))} por mil`,
          }))} />
          <p className="ds-note" style={{ margin: 'var(--space-4) 0 0' }}>
            Economia estimada no mês, com as metas das premissas: <b>{fmt.brlk(resumo?.economia)}</b>.
          </p>
        </Card>

        <Card id="acao-prioritaria" title="Ação prioritária">
          {prioritaria ? (
            <div className="cr-acao">
              <div className="cr-acao-t">
                <Chip tone={tomDaSituacao(prioritaria.situacao)}>{prioritaria.situacao}</Chip>
                <span>{NOME_PERNA[prioritaria.perna]} · score {fmt.int(prioritaria.score)}/100</span>
              </div>
              <b className="cr-acao-r">{prioritaria.rota}</b>
              <SugestaoAcao rota={prioritaria} />
              <div>
                <button type="button" className="cr-link" onClick={() => abrirRota(prioritaria.perna)}>Abrir a rota em {NOME_PERNA[prioritaria.perna]}</button>
              </div>
            </div>
          ) : (
            <p className="ds-note">{carregando ? 'Carregando…' : 'Nenhuma rota com score no mês.'}</p>
          )}
        </Card>
      </div>

      <Card id="ranking-financeiro" title="Ranking financeiro" note="As cinco rotas com mais prejuízo no mês, de todas as etapas.">
        <div className="ds-table-box">
          <table className="ds-table">
            <thead><tr>
              <th>Rota</th><th>Etapa</th><th>Transportadora</th><th className="num">Ocorrências</th>
              <th className="num">Por mil operações</th><th className="num">Prejuízo</th><th>Situação</th>
            </tr></thead>
            <tbody>
              {ranking.map((r) => (
                <tr key={r.rota_id}>
                  <td>{r.rota}</td><td>{NOME_PERNA[r.perna]}</td><td>{r.transportadora}</td>
                  <td className="num">{fmt.int(r.ocorrencias)}</td>
                  <td className="num">{r.unidades ? fmt.n1(taxaPorMil(r.ocorrencias, r.unidades)) : 'Não informado'}</td>
                  <td className="num">{fmt.brl(r.prejuizo)}</td>
                  <td><Chip tone={tomDaSituacao(r.situacao)}>{r.situacao ?? 'Não informado'}</Chip></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </section>
  );
}
