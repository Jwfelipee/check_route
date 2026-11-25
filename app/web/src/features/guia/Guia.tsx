import { useState } from 'react';
import { Chip, Segmented } from '@/design-system';
import { useFontes } from '@/data/hooks';
import { NOME_PERNA } from '@/lib/score';
import { PERNAS, type Perna } from '@/lib/types';

/** Aba "Guia de boas práticas": repositório por perna (public/data/praticas.json). */
export function Guia() {
  const { data } = useFontes();
  const [filtro, setFiltro] = useState<Perna | ''>('');
  const pernas = PERNAS.filter((p) => !filtro || p === filtro);
  return (
    <section className="sr-perna" id="guia">
      <div className="sr-ph">
        <h2 className="sr-ph-t">Boas práticas por etapa</h2>
        <p className="sr-ph-d">Repositório das boas práticas da operação, separado por perna. As ações sugeridas no painel saem daqui: cada rota recebe a prática ligada à premissa que mais tira pontos dela ou, quando o problema é ocorrência, ao tipo de ocorrência que mais custou.</p>
      </div>
      <div><Segmented label="Filtrar o guia pela perna" value={filtro} onChange={setFiltro}
        options={[{ value: '', label: 'Todas' }, ...PERNAS.map((p) => ({ value: p, label: NOME_PERNA[p] }))]} /></div>
      {pernas.map((perna) => (
        <div key={perna}>
          <h3 style={{ margin: '0 0 var(--space-3)', fontSize: 'var(--fs-section)', lineHeight: 'var(--lh-section)', fontWeight: 700 }}>{NOME_PERNA[perna]}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(320px, 100%), 1fr))', gap: 'var(--gap-md)' }}>
            {(data?.praticas ?? []).filter((p) => p.perna === perna).map((p) => (
              <article key={p.id} id={'pratica-' + p.id} className="ds-card" style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Chip>{p.id}</Chip><b style={{ fontSize: 'var(--fs-md)' }}>{p.titulo}</b></div>
                <div className="ds-caption">Quando usar</div><p style={{ margin: 0 }}>{p.quando_usar}</p>
                <div className="ds-caption">Como fazer</div>
                <ul style={{ margin: 0, paddingLeft: 18 }}>{p.como_fazer.split(';').map((s) => <li key={s}>{s.trim()}</li>)}</ul>
                <div className="ds-muted" style={{ fontSize: 13, marginTop: 4 }}>Melhora <b>{p.melhora}</b> · esforço <b>{p.esforco}</b> · prazo típico <b>{p.prazo_dias} dias</b></div>
                <div className="ds-muted" style={{ fontSize: 'var(--fs-caption)' }}>{p.origem}</div>
              </article>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
