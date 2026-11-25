import { useMemo } from 'react';
import { Alert, BarList, Button, Card, Chip, Kpi, tomDaSituacao, tomDoScore } from '@/design-system';
import { usePainel } from '@/data/hooks';
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
  const { abrirRota, setPagina } = useFiltros();
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
  const prioritaria = [...rotasDoMes].filter((r) => r.score != null).sort((a, b) => a.score! - b.score! || b.prejuizo - a.prejuizo)[0];
  const ranking = [...rotasDoMes].sort((a, b) => b.prejuizo - a.prejuizo).slice(0, 5);
  const carregando = isLoading || !resumo;

  return (
    <section className="cr-stack" id="visao-geral">
      <Alert tone="info" title="Base sintética">
        Todos os números desta demonstração são fictícios, gerados para o Hackathon ETEG 2026. Nenhum dado real de cliente.
      </Alert>

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
            Economia estimada no mês: <b>{fmt.brlk(resumo?.economia)}</b>. É uma estimativa com as metas das premissas, não economia comprovada.
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
              <p className="cr-acao-x">{prioritaria.acao}</p>
              {prioritaria.pratica_id && (
                <p className="ds-note" style={{ margin: 0 }}>Fonte: guia de boas práticas, {prioritaria.pratica_id} · {prioritaria.pratica}</p>
              )}
              <p className="ds-note" style={{ margin: 0 }}>É uma sugestão: só vale depois de validada, com responsável e prazo.</p>
              <div className="cr-acao-b">
                <Button onClick={() => abrirRota(prioritaria.perna)}>Abrir a rota</Button>
                <Button variant="secondary" onClick={() => setPagina('guia')}>Ver no guia</Button>
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
