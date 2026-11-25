import { BarList, Card, Chip, Kpi, Pill, Segmented, tomDaSituacao, tomDaVariacao, tomDoScore, type Tom } from '@/design-system';
import { useAcaoAtivaPorRota, usePainel } from '@/data/hooks';
import { fmt } from '@/lib/format';
import { faixas, NOME_REGIAO, passaFiltro, pilares } from '@/lib/score';
import type { Perna, Situacao } from '@/lib/types';
import { useFiltros } from '@/app/store';
import { PERNA_CFG } from './config';
import { RotaDetalhe } from './RotaDetalhe';
import { MapaBrasil, MapaCidade } from './Mapas';
import { MesAMes } from './MesAMes';
import { AcoesTabela } from '@/features/acoes/AcoesTabela';

const SITUACOES = [
  { value: '' as const, label: 'Todas' },
  { value: 'Crítica' as const, label: 'Críticas' },
  { value: 'Atenção' as const, label: 'Atenção' },
  { value: 'Saudável' as const, label: 'Saudáveis' },
];

/**
 * Uma perna da operação (#perna-coleta, #perna-transferencia, #perna-entrega).
 * Ordem das seções igual à do artifact (especificação em docs/TELAS.md).
 */
export function PernaView({ perna }: { perna: Perna }) {
  const cfg = PERNA_CFG[perna];
  const { data, isLoading } = usePainel();
  const { filtros, setFiltro, situacao, setSituacao } = useFiltros();
  const ativas = useAcaoAtivaPorRota();
  const f = data ? faixas(data.fontes.premissas) : { ok: 85, atencao: 65 };
  const k = data?.kpis.find((x) => x.perna === perna);
  const meta = (chave: string) => data?.fontes.premissas.find((p) => p.perna === perna && p.chave === chave)?.nota_cem;
  const filtroSit = situacao[perna] ?? '';
  const rotas = (data?.saudeRotas ?? []).filter((r) => r.perna === perna && passaFiltro(r, filtros) && (!filtroSit || r.situacao === filtroSit));
  const ufs = Array.from(new Set((data?.fontes.rotas ?? []).filter((r) => r.perna === perna && r.uf).map((r) => r.uf!))).sort();
  const variacao = (v: number | null | undefined, f2: (n: number) => string) => <span data-c={tomDaVariacao(v) || undefined}>{v == null ? '—' : f2(v)}</span>;
  const padroes = (dim: string) => (data?.padroes ?? []).filter((p) => p.perna === perna && p.dim === dim);
  const combo = padroes('combo')[0];
  const tomShare = (s: number): Tom => (s >= 0.3 ? 'bad' : s >= 0.15 ? 'warn' : '');

  return (
    <section className="sr-perna" id={'perna-' + perna}>
      <div className="sr-ph">
        <h2 className="sr-ph-t">{cfg.titulo} <span>· {cfg.en}</span></h2>
        <p className="sr-ph-d">{cfg.descricao}</p>
      </div>

      {/* Filtros: coleta/entrega por estado (e zona pelo mapa); transferência por região (pelo mapa do Brasil). */}
      {perna !== 'transferencia' ? (
        <div className="sr-filtros" id={'filtros-' + perna}>
          <label className="ds-field"><span>Estado</span>
            <select value={filtros[`uf_${perna}`]} onChange={(e) => { setFiltro(`uf_${perna}`, e.target.value); setFiltro(`zona_${perna}`, ''); }}>
              {ufs.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </label>
          <label className="ds-field"><span>Zona</span>
            <select value={filtros[`zona_${perna}`]} onChange={(e) => setFiltro(`zona_${perna}`, e.target.value)}>
              <option value="">Todas</option>
              {['Central', 'Norte', 'Sul', 'Leste', 'Oeste'].map((z) => <option key={z} value={z}>{z}</option>)}
            </select>
          </label>
        </div>
      ) : (
        <div className="sr-filtros">
          <label className="ds-field"><span>Região do hub</span>
            <select value={filtros.regiao} onChange={(e) => setFiltro('regiao', e.target.value)}>
              <option value="">Todas</option>
              {Object.entries(NOME_REGIAO).map(([v, n]) => <option key={v} value={v}>{n}</option>)}
            </select>
          </label>
        </div>
      )}

      <div className="ds-kpis">
        <Kpi id={`kpi-score-${perna}`} loading={isLoading} label={`Score médio da ${cfg.titulo.toLowerCase()}`} value={fmt.int(k?.score)} unit="/100" tone={tomDoScore(k?.score, f)}
          note={<>{variacao(k?.delta_score, fmt.sint)} pontos sobre o mês anterior · saudável a partir de <span>{f.ok}</span></>} />
        <Kpi id={`kpi-prazo-${perna}`} loading={isLoading} label={cfg.kpiPrazo} value={fmt.pct1(k?.pct_prazo as number)}
          note={<>{variacao(k?.delta_pct_prazo as number, fmt.spp)} sobre o mês anterior · meta <span>{fmt.pct(meta('pct_prazo'))}</span></>} />
        <Kpi id={`kpi-chave-${perna}`} loading={isLoading} label={cfg.kpiChave.label} value={fmt.pct1(k?.[cfg.kpiChave.campo] as number)}
          note={<>{variacao(k?.['delta_' + cfg.kpiChave.campo] as number, fmt.spp)} sobre o mês anterior · meta <span>{fmt.pct(meta(cfg.kpiChave.campo))}</span></>} />
        <Kpi id={`kpi-prejuizo-${perna}`} loading={isLoading} label="Prejuízo com ocorrências no mês" value={fmt.brlk(k?.prejuizo)}
          note={<><span>{fmt.int(k?.ocorrencias)}</span> ocorrências, <span>{fmt.int(k?.abertas)}</span> ainda em aberto</>} />
        <Kpi id={`kpi-economia-${perna}`} loading={isLoading} label="Economia estimada no mês" value={fmt.brlk(k?.economia)} note={cfg.economiaNota} />
        <div className="ds-kpi" id={'mapa-' + perna}>
          <div className="ds-kpi-l">{cfg.temMapaCidade ? 'Score por zona da cidade' : 'Score por região do hub'}</div>
          {perna === 'transferencia' ? <MapaBrasil perna={perna} /> : <MapaCidade perna={perna} />}
        </div>
      </div>

      <Card id={'rotas-' + perna} title={`Rotas de ${cfg.titulo.toLowerCase()}`}
        actions={<Segmented label={`Filtrar as rotas de ${cfg.titulo.toLowerCase()} pela situação`} value={filtroSit} onChange={(v) => setSituacao(perna, v as Situacao | '')} options={SITUACOES} />}
        note={`Cada rota recebe um score de 0 a 100 pelas cinco premissas da ${cfg.titulo.toLowerCase()}. As piores aparecem primeiro. Abra uma rota para ver o detalhe e a ação.`}>
        <div className="sr-rotas">
          {rotas.map((r) => (
            <details key={r.rota_id} className="sr-rc" data-c={tomDaSituacao(r.situacao) || undefined}>
              <summary>
                <div className="sr-rt">
                  <b>{r.rota}</b>
                  <Chip tone={tomDaSituacao(r.situacao)}>{r.situacao}</Chip>
                  <span className="ds-muted" style={{ fontSize: 13 }}>{r.transportadora}</span>
                  {ativas.has(r.rota_id) && <Chip tone="warn">Em acompanhamento</Chip>}
                  <span className="sr-rpre">Score {fmt.int(r.score)}/100 <Pill tone={tomDaVariacao(r.delta_score)}>{fmt.sint(r.delta_score)}</Pill></span>
                </div>
                <div className="ds-muted" style={{ fontSize: 13 }}>
                  {fmt.int(r.unidades)} {cfg.unidade[1]} · prejuízo {fmt.brl(r.prejuizo)} em {r.ocorrencias} ocorrências
                  {r.acidentes > 0 && <> · <b data-c="bad">{fmt.n1(r.acidentes_mil)} acidentes por mil {cfg.unidade[1]}</b></>}
                  {' '}· mais tira pontos: <b>{r.foco ?? '—'}</b>
                </div>
              </summary>
              <RotaDetalhe rota={r} />
            </details>
          ))}
          {!isLoading && !rotas.length && <p className="ds-note">Nenhuma rota nessa situação neste mês.</p>}
        </div>
      </Card>

      <Card id={'acoes-' + perna} title="Ações em acompanhamento" note="Ações que alguém validou, com responsável e prazo. O score da rota no dia da validação fica guardado para comparar com o de hoje.">
        <AcoesTabela perna={perna} modo="ativas" vazio='Nenhuma ação em acompanhamento. Abra uma rota e use "Validar e acompanhar".' />
      </Card>

      <Card id={'padroes-' + perna} title={`Onde se concentra o prejuízo da ${cfg.titulo.toLowerCase()}`} note="Ocorrências do mês somadas por tipo, produto e transportadora. A barra é o custo; ao lado, quantas ocorrências e a parte do prejuízo.">
        {combo && <p style={{ margin: '0 0 14px', fontSize: 14 }}><b>{fmt.pct(combo.share_custo)}</b> do prejuízo da {cfg.titulo.toLowerCase()} no mês vem de <b>{combo.valor}</b>.</p>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
          {(['tipo', 'produto', 'transportadora'] as const).map((dim) => (
            <div key={dim} style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', padding: 'var(--space-3) var(--space-4)', minWidth: 0 }}>
              <div className="ds-caption">Por {dim === 'tipo' ? 'tipo de ocorrência' : dim}</div>
              <BarList items={padroes(dim).map((p) => ({ key: p.valor, label: p.valor, value: p.custo, display: fmt.brlk(p.custo), detail: `${p.ocorrencias} ocorr. · ${fmt.pct(p.share_custo)}`, tone: tomShare(p.share_custo) }))} />
            </div>
          ))}
        </div>
      </Card>

      <Card id={'ranking-' + perna} title={`Ranking das rotas de ${cfg.titulo.toLowerCase()}`} note="As cinco premissas de cada rota no mês, do pior score para o melhor.">
        <div className="ds-table-box">
          <table className="ds-table">
            <thead><tr>
              <th>Rota</th><th>Transportadora</th><th className="num">Score</th>
              {cfg.ranking.map((c) => <th key={c.campo} className="num">{c.label}</th>)}
              {perna === 'transferencia' && <th className="num">Acidentes / mil viagens</th>}
              <th className="num">Prejuízo</th><th className="num">Economia estimada</th><th>Situação</th>
            </tr></thead>
            <tbody>
              {(data?.saudeRotas ?? []).filter((r) => r.perna === perna && passaFiltro(r, filtros)).map((r) => (
                <tr key={r.rota_id}>
                  <td>{r.rota}</td><td>{r.transportadora}</td>
                  <td className="num" data-c={tomDoScore(r.score, f) || undefined}>{fmt.int(r.score)}</td>
                  {cfg.ranking.map((c) => {
                    const nt = r[`nota_${c.campo}`] as number | null;
                    return <td key={c.campo} className="num" data-c={nt != null && nt < f.atencao ? 'bad' : undefined}>{fmt[c.fmt]((r as any)[c.campo])}</td>;
                  })}
                  {perna === 'transferencia' && <td className="num" data-c={r.acidentes > 0 ? 'bad' : undefined}>{r.acidentes_mil == null ? '—' : fmt.n1(r.acidentes_mil)}</td>}
                  <td className="num">{fmt.brl(r.prejuizo)}</td><td className="num">{fmt.brl(r.economia)}</td>
                  <td><Chip tone={tomDaSituacao(r.situacao)}>{r.situacao}</Chip></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card id={'mes-' + perna} title={`${cfg.titulo} mês a mês`} note="Barras: prejuízo com ocorrências. Linha: score médio, ponderado pelas unidades de cada rota. O mês atual, marcado com *, vai até a data da posição.">
        <MesAMes perna={perna} />
      </Card>

      <details className="ds-card" id={'premissas-' + perna}>
        <summary style={{ cursor: 'pointer', fontWeight: 600, minHeight: 24 }}>Como o score da {cfg.titulo.toLowerCase()} é calculado</summary>
        <p className="ds-note">Cada premissa vira uma nota de 0 a 100 numa régua linear: nota 0 no valor ruim, nota 100 na meta. O score é a média das notas ponderada pelos pesos. Rota saudável a partir de <b>{f.ok}</b>, em atenção a partir de <b>{f.atencao}</b>, crítica abaixo disso.</p>
        <div className="ds-table-box">
          <table className="ds-table">
            <thead><tr><th>Premissa</th><th>O que mede</th><th className="num">Peso</th><th className="num">Nota 0 em</th><th className="num">Nota 100 em</th></tr></thead>
            <tbody>
              {pilares(data?.fontes.premissas ?? [], perna).map((p) => {
                const v = (x?: number) => (x == null ? '—' : p.formato === 'pct' ? fmt.pct(x) : p.formato === 'horas' ? fmt.horas(x) : p.formato === 'dias' ? fmt.dias(x) : fmt.n1(x));
                return <tr key={p.chave}><td>{p.premissa}</td><td style={{ whiteSpace: 'normal' }}>{p.descricao}</td><td className="num">{fmt.pct(p.peso)}</td><td className="num">{v(p.nota_zero)}</td><td className="num">{v(p.nota_cem)}</td></tr>;
              })}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
