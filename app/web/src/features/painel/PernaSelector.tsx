import { ScoreGauge, tomDoScore } from '@/design-system';
import { usePainel } from '@/data/hooks';
import { fmt } from '@/lib/format';
import { faixas } from '@/lib/score';
import type { Perna } from '@/lib/types';
import { useFiltros } from '@/app/store';

const CARTOES: { perna: Perna; n: number; nome: string; en: string; desc: string }[] = [
  { perna: 'coleta', n: 1, nome: 'Coleta', en: 'First mile', desc: 'Do fornecedor até o CD' },
  { perna: 'transferencia', n: 2, nome: 'Transferência', en: 'Middle mile', desc: 'Do CD aos hubs, passando pelo cross-docking' },
  { perna: 'entrega', n: 3, nome: 'Entrega', en: 'Last mile', desc: 'Do CD ou do hub até o cliente' },
];

export function PernaSelector() {
  const { data } = usePainel();
  const { perna, setPerna } = useFiltros();
  const f = data ? faixas(data.fontes.premissas) : { ok: 85, atencao: 65 };
  return (
    <div className="sr-pernas" id="pernas" role="group" aria-label="Escolher a perna da operação">
      {CARTOES.flatMap((c, i) => {
        const k = data?.kpisTotal.find((x) => x.perna === c.perna);
        const el = (
          <button key={c.perna} type="button" className="sr-pb" aria-pressed={perna === c.perna} aria-controls={'perna-' + c.perna} onClick={() => setPerna(c.perna)}>
            <span className="sr-pb-t"><span className="sr-pb-i">{c.n}</span><span className="sr-pb-n">{c.nome}</span><span className="ds-caption">{c.en}</span></span>
            <span className="sr-pb-d">{c.desc}</span>
            <span className="sr-pb-m">
              <ScoreGauge score={k?.score ?? null} healthy={f.ok} warning={f.atencao} label={`Score médio da perna ${c.nome}: ${fmt.int(k?.score)} de 100`} />
              <span className="sr-pb-k">
                <span className={'sr-pb-v' + (k ? '' : ' ds-skeleton')} data-c={tomDoScore(k?.score, f) || undefined}>{fmt.int(k?.score)}</span>
                <span className="sr-pb-s"><b>{fmt.int(k?.n_criticas)}</b> de <b>{fmt.int(k?.n_rotas)}</b> rotas críticas</span>
                <span className="sr-pb-s">Prejuízo <b>{fmt.brlk(k?.prejuizo)}</b></span>
              </span>
            </span>
          </button>
        );
        return i ? [<span key={'s' + i} className="sr-seta" aria-hidden="true">→</span>, el] : [el];
      })}
    </div>
  );
}
