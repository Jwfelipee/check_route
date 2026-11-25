import { useRef, useState } from 'react';
import { corDoTom, tomDoScore } from '@/design-system';
import { useMapa, usePainel } from '@/data/hooks';
import { fmt } from '@/lib/format';
import { faixas, NOME_REGIAO } from '@/lib/score';
import type { Perna } from '@/lib/types';
import { useFiltros } from '@/app/store';
import { PERNA_CFG } from './config';

interface Area {
  chave: string; nome: string; d: string; x: number; y: number;
  score: number | null; dica: string[];
}

/**
 * Mapa com o score por área (§3.4): cor pela situação, clique/Enter/Espaço filtra a página
 * pela área (de novo, limpa), tooltip ao passar, e lista em texto para leitor de tela.
 */
function MapaScore({ areas, selecionada, onEscolher, rotulo, semDados }: {
  areas: Area[]; selecionada: string; onEscolher: (k: string) => void; rotulo: string; semDados: string;
}) {
  const { data } = usePainel();
  const f = data ? faixas(data.fontes.premissas) : { ok: 85, atencao: 65 };
  const caixa = useRef<HTMLDivElement>(null);
  const [dica, setDica] = useState<{ area: Area; x: number; y: number } | null>(null);
  const cor = (a: Area) =>
    a.score == null ? 'var(--map-empty)' : `color-mix(in srgb, ${corDoTom(tomDoScore(a.score, f))} 55%, var(--color-panel))`;
  const mostra = (a: Area, ev: { clientX: number; clientY: number }) => {
    const r = caixa.current!.getBoundingClientRect();
    setDica({ area: a, x: Math.min(r.width - 230, Math.max(0, ev.clientX - r.left + 12)), y: Math.max(0, ev.clientY - r.top - 80) });
  };

  return (
    <div className="cr-mapa" ref={caixa}>
      <svg viewBox="0 0 400 400" role="group" aria-label={rotulo}>
        {areas.map((a) => {
          const tem = a.score != null;
          const sel = a.chave === selecionada;
          return (
            <path key={a.chave} d={a.d} fill={cor(a)} stroke={sel ? 'var(--color-fg)' : 'var(--color-panel)'} strokeWidth={sel ? 4 : 2}
              opacity={selecionada && !sel ? 0.4 : 1} className={tem ? 'cr-mapa-on' : undefined}
              role={tem ? 'button' : undefined} tabIndex={tem ? 0 : undefined} aria-pressed={tem ? sel : undefined}
              aria-label={tem ? `${a.nome}: score ${fmt.int(a.score)}. ${sel ? 'Remover o filtro.' : 'Filtrar a página por esta área.'}` : `${a.nome}: ${semDados}`}
              onClick={tem ? () => onEscolher(a.chave) : undefined}
              onKeyDown={tem ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onEscolher(a.chave); } } : undefined}
              onMouseMove={tem ? (e) => mostra(a, e) : undefined} onMouseLeave={() => setDica(null)}
              onFocus={tem ? (e) => { const b = (e.target as SVGPathElement).getBoundingClientRect(); mostra(a, { clientX: b.x + b.width / 2, clientY: b.y + b.height / 2 }); } : undefined}
              onBlur={() => setDica(null)} />
          );
        })}
        {areas.map((a) => (
          <text key={a.chave + '-t'} x={a.x} textAnchor="middle" className="cr-mapa-t" opacity={selecionada && a.chave !== selecionada ? 0.45 : 1} aria-hidden="true">
            <tspan x={a.x} y={a.y - 6} className="cr-mapa-n">{a.nome}</tspan>
            <tspan x={a.x} y={a.y + (a.score != null ? 20 : 14)} className={a.score != null ? 'cr-mapa-v' : 'cr-mapa-nd'}>
              {a.score != null ? Math.round(a.score) : semDados}
            </tspan>
          </text>
        ))}
      </svg>
      {dica && (
        <div className="ds-tip" style={{ left: dica.x, top: dica.y }}>
          <b>{dica.area.nome}</b>
          {dica.area.dica.map((l) => <div key={l}>{l}</div>)}
          <div>{dica.area.chave === selecionada ? 'Clique para remover o filtro' : 'Clique para filtrar'}</div>
        </div>
      )}
      <ul className="ds-sr-only">
        {areas.map((a) => <li key={a.chave}>{a.nome}: {a.score == null ? semDados : `score ${Math.round(a.score)}`}</li>)}
      </ul>
    </div>
  );
}

/** Transferência: score por região do hub (mapa do Brasil). */
export function MapaBrasil({ perna }: { perna: Perna }) {
  const { data: geo } = useMapa();
  const { data } = usePainel();
  const { filtros, setFiltro } = useFiltros();
  const [, plural] = PERNA_CFG[perna].unidade;
  if (!geo || !data) return <div className="ds-skeleton" style={{ height: 220 }} />;
  const areas: Area[] = Object.entries(geo.regioes).map(([reg, g]) => {
    const r = data.regioes.find((x) => x.perna === perna && x.regiao === reg);
    const tem = r && r.n_rotas > 0 && r.score != null;
    return {
      chave: reg, nome: NOME_REGIAO[reg] ?? reg, d: g.d, x: Number(g.x), y: Number(g.y), score: tem ? r.score : null,
      dica: tem ? [
        `${r.situacao} · score ${fmt.int(r.score)}`,
        `${r.n_rotas} ${r.n_rotas > 1 ? 'rotas' : 'rota'}, ${r.n_criticas} ${r.n_criticas === 1 ? 'crítica' : 'críticas'}`,
        `${fmt.int(r.unidades)} ${plural} · prejuízo ${fmt.brl(r.prejuizo)}`,
      ] : [],
    };
  });
  return (
    <>
      <MapaScore areas={areas} selecionada={filtros.regiao} onEscolher={(k) => setFiltro('regiao', filtros.regiao === k ? '' : k)}
        rotulo="Mapa do Brasil por região com o score da transferência" semDados="sem rotas" />
      <FiltroAtivo texto={filtros.regiao ? `Região: ${NOME_REGIAO[filtros.regiao]}` : 'Todas as regiões'} onLimpar={filtros.regiao ? () => setFiltro('regiao', '') : undefined} />
    </>
  );
}

/** Coleta e entrega: score por zona da cidade do estado escolhido. */
export function MapaCidade({ perna }: { perna: 'coleta' | 'entrega' }) {
  const { data: geo } = useMapa();
  const { data } = usePainel();
  const { filtros, setFiltro } = useFiltros();
  const [, plural] = PERNA_CFG[perna].unidade;
  const uf = filtros[`uf_${perna}`] || 'SP';
  const zonaSel = filtros[`zona_${perna}`];
  if (!geo || !data) return <div className="ds-skeleton" style={{ height: 220 }} />;
  const cidade = geo.cidades[uf];
  const zonas = data.zonas.filter((z) => z.perna === perna && z.uf === uf);
  if (!cidade || !zonas.length) return <p className="ds-note" style={{ margin: 0 }}>Sem rotas desta etapa neste estado.</p>;
  const nomeCidade = zonas[0].cidade ?? uf;
  const areas: Area[] = Object.entries(cidade.zonas).map(([z, g]) => {
    const r = zonas.find((x) => x.zona === z);
    return {
      chave: z, nome: z, d: g.d, x: Number(g.x), y: Number(g.y), score: r?.score ?? null,
      dica: r ? [
        `${nomeCidade} · ${r.situacao ?? '—'} · score ${fmt.int(r.score)}`,
        `${fmt.int(r.unidades)} ${plural} no mês`,
        `${fmt.int(r.ocorrencias)} ocorrências · prejuízo ${fmt.brl(r.prejuizo)}`,
      ] : [],
    };
  });
  return (
    <>
      <MapaScore areas={areas} selecionada={zonaSel} onEscolher={(k) => setFiltro(`zona_${perna}`, zonaSel === k ? '' : k)}
        rotulo={`Mapa de ${nomeCidade} por zona com o score de cada zona`} semDados="sem rota" />
      <FiltroAtivo texto={zonaSel ? `${nomeCidade} · zona ${zonaSel}` : `${nomeCidade} · todas as zonas`}
        onLimpar={zonaSel ? () => setFiltro(`zona_${perna}`, '') : undefined} />
    </>
  );
}

function FiltroAtivo({ texto, onLimpar }: { texto: string; onLimpar?: () => void }) {
  return (
    <div className="ds-kpi-n" style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', flexWrap: 'wrap' }}>
      <span>{texto}</span>
      {onLimpar && <button type="button" className="cr-link" onClick={onLimpar}>limpar</button>}
    </div>
  );
}
