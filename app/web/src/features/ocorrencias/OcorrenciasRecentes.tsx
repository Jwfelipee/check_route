import { Alert, Card, Chip } from '@/design-system';
import { useAcaoAtivaPorRota, useFontes, usePainel, useRecentes } from '@/data/hooks';
import { NOME_DADO_PESSOAL } from '@/data/ia';
import { fmt } from '@/lib/format';
import type { Ocorrencia } from '@/lib/types';

const CANAL: Record<string, string> = { whatsapp: 'WhatsApp', formulario: 'Formulário' };
const CAMPOS: [string, string][] = [
  ['tipo', 'Tipo'], ['data_hora', 'Data e hora'], ['trecho', 'Trecho'], ['produto', 'Carga'], ['custo_estimado', 'Prejuízo estimado'],
  ['placa', 'Placa'], ['tipo_veiculo', 'Veículo'], ['embalagem', 'Embalagem'], ['condicao_via_clima', 'Via e clima'],
  ['gravidade', 'Gravidade'], ['volumes_afetados', 'Volumes'], ['houve_vitima', 'Houve vítima'],
];

const texto = (k: string, v: unknown) => {
  if (v == null || v === '') return 'Não informado';
  if (k === 'custo_estimado') return fmt.brl(Number(v));
  if (k === 'houve_vitima') return v ? 'Sim' : 'Não';
  if (k === 'data_hora') { const s = String(v); return `${fmt.data(s.slice(0, 10))} ${s.slice(11, 16)}`; }
  return String(v);
};

/** Últimas ocorrências registradas pelo relato (WhatsApp ou formulário): relato × ficha. */
export function OcorrenciasRecentes() {
  const { data, isLoading, error } = useRecentes();
  const { data: fontes } = useFontes();
  const { data: painel } = usePainel();
  const ativas = useAcaoAtivaPorRota();
  const nomeRota = new Map((fontes?.rotas ?? []).map((r) => [r.rota_id, r.rota]));
  const situacaoRota = new Map((painel?.saudeRotas ?? []).map((r) => [r.rota_id, r.situacao]));

  const situacao = (o: Ocorrencia) => {
    if (ativas.has(o.rota_id)) return <Chip tone="warn">Ação em acompanhamento</Chip>;
    const s = situacaoRota.get(o.rota_id);
    if (s && s !== 'Saudável') return <Chip tone="info">Aguardando validação de ação</Chip>;
    return <Chip tone="ok">Registrada</Chip>;
  };

  return (
    <Card id="ocorrencias-recentes" title="Ocorrências recentes"
      note="Registradas pelo WhatsApp ou pelo formulário, as mais novas primeiro. Abra uma para ver o relato ao lado da ficha registrada.">
      {error && <Alert tone="bad" title="Não foi possível carregar">{(error as Error).message}</Alert>}
      {isLoading && <div className="ds-skeleton" style={{ height: 80 }} />}
      {data && !data.length && <p className="ds-note" style={{ margin: 0 }}>Nenhuma ocorrência registrada pelo relato ainda. Use o formulário acima ou o WhatsApp.</p>}
      <div className="cr-lista">
        {(data ?? []).map((o) => {
          const d = (o.detalhes ?? {}) as Record<string, unknown>;
          const priv = (d.privacidade as { mascarados?: string[] } | undefined)?.mascarados ?? [];
          const guardas = d.guardas as { instrucao_suspeita?: boolean; motivos?: string[] } | undefined;
          return (
            <details key={o.id} className="cr-item cr-recente">
              <summary>
                <div className="sr-rt">
                  <b>{o.tipo}</b>
                  <span className="ds-selo">{CANAL[o.canal ?? ''] ?? o.canal ?? '—'}</span>
                  <span className="ds-muted">{nomeRota.get(o.rota_id) ?? o.rota_id}</span>
                  {situacao(o)}
                  <span className="sr-rpre">{fmt.brl(o.custo)}</span>
                </div>
                <div className="ds-muted" style={{ fontSize: 13 }}>
                  {o.id} · registrada {d.registrada_em ? new Date(String(d.registrada_em)).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : fmt.data(o.data)}
                  {d.com_foto ? ' · com foto' : ''}
                </div>
              </summary>
              <div className="cr-lado">
                <div>
                  <div className="ds-caption">Relato original</div>
                  <p className="cr-relato-txt">{String(d.relato ?? 'Não informado')}</p>
                  {priv.length > 0 && <p className="ds-note" style={{ margin: 0 }}>Mascarado: {priv.map((x) => NOME_DADO_PESSOAL[x] ?? x).join(', ')}.</p>}
                  {guardas?.instrucao_suspeita && <Alert tone="warn">Instrução suspeita tratada como dado: {guardas.motivos?.join('; ')}.</Alert>}
                </div>
                <div>
                  <div className="ds-caption">Ficha registrada</div>
                  <dl className="cr-ficha">
                    {CAMPOS.map(([k, rot]) => <div key={k}><dt>{rot}</dt><dd>{texto(k, d[k])}</dd></div>)}
                  </dl>
                </div>
              </div>
            </details>
          );
        })}
      </div>
    </Card>
  );
}
