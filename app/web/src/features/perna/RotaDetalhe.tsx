import { BarList, MiniLine, ScoreGauge, tomDoScore, type Tom } from '@/design-system';
import { usePainel } from '@/data/hooks';
import { fmt } from '@/lib/format';
import { faixas, pilares, type SaudeRota } from '@/lib/score';
import type { Premissa } from '@/lib/types';
import { SugestaoAcao } from '@/features/acoes/SugestaoAcao';
import { PERNA_CFG } from './config';

/** Valor de uma premissa no formato dela (%, horas, dias, número). */
export function valorPremissa(p: Premissa, v: number | null | undefined) {
  if (v == null) return '—';
  return p.formato === 'pct' ? fmt.pct1(v) : p.formato === 'horas' ? fmt.horas(v) : p.formato === 'dias' ? fmt.dias(v) : fmt.n1(v);
}

/**
 * Detalhe de uma rota (§3.5): score com contagiro, nota de cada premissa, frete e economia,
 * acidentes por mil viagens, ocorrências do mês por tipo, score nos últimos meses e a ação.
 */
export function RotaDetalhe({ rota }: { rota: SaudeRota }) {
  const { data } = usePainel();
  if (!data) return null;
  const f = faixas(data.fontes.premissas);
  const cfg = PERNA_CFG[rota.perna];
  const [unidade, unidades] = cfg.unidade;
  const pil = pilares(data.fontes.premissas, rota.perna);
  const ref = data.fontes.referencia;
  const serie = data.rotaMes
    .filter((x) => x.rota_id === rota.rota_id)
    .sort((a, b) => a.mes.localeCompare(b.mes))
    .map((x) => ({ mes: x.mes, rotulo: fmt.mes3(x.mes), score: x.score, parcial: x.mes === ref.mes }));
  const tipos = data.padroes.filter((p) => p.dim === 'rota_tipo' && p.rota_id === rota.rota_id);
  const desvio = rota.custo_vs_orcado != null ? rota.custo_vs_orcado - 1 : null;
  const tomDesvio: Tom = desvio == null ? '' : desvio <= 0.005 ? 'ok' : desvio <= 0.08 ? 'warn' : 'bad';
  const acidentesNaSerie = data.rotaMes.filter((x) => x.rota_id === rota.rota_id).some((x) => x.acidentes > 0);

  return (
    <div className="sr-det">
      <div className="sr-hero">
        <div className="sr-z sr-zg">
          <ScoreGauge score={rota.score} healthy={f.ok} warning={f.atencao} width={120} label={`Score da rota ${rota.rota}: ${fmt.int(rota.score)} de 100`} />
          <div className="sr-gcol">
            <div className="ds-caption">Score da rota</div>
            <div className="sr-gv" data-c={tomDoScore(rota.score, f) || undefined}>{fmt.int(rota.score)}<small>/100</small></div>
            <dl className="cr-dl cr-dl--col">
              <div><dt>Mês anterior</dt><dd>{fmt.int(rota.score_ant)}</dd></div>
              <div><dt>Variação</dt><dd data-c={rota.delta_score == null ? undefined : rota.delta_score > 0.5 ? 'ok' : rota.delta_score < -0.5 ? 'bad' : undefined}>
                {rota.delta_score == null ? '—' : `${fmt.sint(rota.delta_score)} pts`}</dd></div>
              <div><dt>Mais tira pontos</dt><dd>{rota.foco ?? '—'}</dd></div>
            </dl>
          </div>
        </div>

        <div className="sr-z">
          <div className="ds-caption">Nota de cada premissa (0 a 100)</div>
          <div className="sr-prs">
            {pil.map((p) => {
              const nt = rota[`nota_${p.chave}`] as number | null;
              const tom = tomDoScore(nt, f);
              return (
                <div className="sr-pr" key={p.chave} title={p.descricao}>
                  <span>{p.premissa}<small>{fmt.pct(p.peso)}</small></span>
                  <div className="ds-track" role="img" aria-label={`Nota ${fmt.int(nt)} de 100`}>
                    <i data-c={tom || undefined} style={{ width: `${Math.max(2, nt ?? 0)}%` }} />
                  </div>
                  <em data-c={tom || undefined}>{valorPremissa(p, (rota as unknown as Record<string, number | null>)[p.chave])}</em>
                </div>
              );
            })}
          </div>
        </div>

        <div className="sr-cels">
          <div className="sr-cel" data-c={tomDesvio || undefined}>
            <div className="ds-caption">Frete por {unidade}</div>
            <div className="sr-cel-v">{fmt.brl(rota.frete_unidade)}</div>
            <span className="ds-pill" data-c={tomDesvio || undefined}>{desvio == null ? '—' : `${fmt.sint(desvio * 100)}% do orçado`}</span>
            <div className="sr-cel-s">Orçado <b>{fmt.brl(rota.frete_orcado)}</b> por {unidade}</div>
          </div>
          <div className="sr-cel" data-c={rota.economia > 0.5 ? (rota.situacao === 'Crítica' ? 'bad' : 'warn') : 'ok'}>
            <div className="ds-caption">Economia estimada</div>
            <div className="sr-cel-v">{fmt.brlk(rota.economia)}<small> no mês</small></div>
            <div className="sr-cel-s">{rota.tipo_top ? <>Maior causa: <b>{rota.tipo_top}</b> ({fmt.brlk(rota.tipo_top_custo)})</> : 'Sem ocorrências no mês'}</div>
            <div className="sr-cel-s"><b>{fmt.int(rota.ocorrencias)}</b> ocorrências · <b>{fmt.int(rota.abertas)}</b> em aberto</div>
          </div>
          {(rota.perna === 'transferencia' || acidentesNaSerie) && (
            <div className="sr-cel" data-c={rota.acidentes > 0 ? 'bad' : 'ok'}>
              <div className="ds-caption">Acidentes na estrada</div>
              <div className="sr-cel-v">{rota.acidentes_mil == null ? 'Indisponível' : fmt.n1(rota.acidentes_mil)}<small> por mil {unidades}</small></div>
              <div className="sr-cel-s"><b>{fmt.int(rota.acidentes)}</b> acidentes em <b>{fmt.int(rota.unidades)}</b> {unidades} no mês</div>
            </div>
          )}
        </div>
      </div>

      <div className="sr-body">
        <div className="sr-sub">
          <div className="ds-caption">Ocorrências do mês por tipo</div>
          <BarList empty="Nenhuma ocorrência na rota neste mês."
            items={tipos.map((t) => ({
              key: t.valor, label: t.tipo ?? t.valor, value: t.custo, display: fmt.brlk(t.custo),
              detail: `${t.ocorrencias} ocorr. · ${fmt.pct(t.share_custo)}`, tone: t.share_custo >= 0.3 ? 'bad' : t.share_custo >= 0.15 ? 'warn' : undefined,
            }))} />
        </div>
        <div className="sr-sub">
          <div className="ds-caption">Score nos últimos meses</div>
          <MiniLine serie={serie} saudavel={f.ok} atencao={f.atencao} label={`Score de ${rota.rota} de ${serie[0]?.rotulo ?? ''} a ${serie.at(-1)?.rotulo ?? ''}`} />
          <div className="sr-cel-s">Tracejado: score saudável ({f.ok}). * mês parcial.</div>
        </div>
      </div>

      <div className="sr-sub">
        <div className="ds-caption">Ação</div>
        <SugestaoAcao rota={rota} />
      </div>
    </div>
  );
}
