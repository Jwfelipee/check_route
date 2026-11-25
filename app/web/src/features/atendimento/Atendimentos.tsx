import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Card, Chip, Segmented, type Tom } from '@/design-system';
import {
  atendenteSalvo, ErroAtendimento, salvarAtendente, salvarToken, tokenSalvo, useAcao, useConversa, useConversas, WA_URL,
  type ConversaResumo, type Evento,
} from '@/data/atendimento';
import './atendimento.css';

/** +55 12 98123-0645 a partir de 5512981230645. */
export function formatarTelefone(t: string): string {
  const m = t.match(/^(\d{2})(\d{2})(\d{4,5})(\d{4})$/);
  return m ? `+${m[1]} ${m[2]} ${m[3]}-${m[4]}` : `+${t}`;
}

const hora = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  const hoje = new Date().toDateString() === d.toDateString();
  return hoje ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};

type Etapa = { rotulo: string; tom: Tom };
function etapa(c: { modo: string; aguardando_confirmacao: boolean; tem_ficha?: boolean; ficha?: unknown; faltando: string[]; expirada?: boolean }): Etapa {
  if (c.modo === 'humano') return { rotulo: 'Com atendente', tom: 'info' as Tom };
  if (c.expirada) return { rotulo: 'Encerrada', tom: '' };
  if (c.aguardando_confirmacao) return { rotulo: 'Esperando confirmação', tom: 'warn' };
  if (c.tem_ficha || c.ficha) return { rotulo: `Coletando dados (${c.faltando.length} faltando)`, tom: '' };
  return { rotulo: 'Início', tom: '' };
}

/** Janela de 24 h da Meta: fora dela, texto livre não é entregue. */
const foraDaJanela = (ultimaDoMotorista: string | null) => !!ultimaDoMotorista && Date.now() - Date.parse(ultimaDoMotorista) > 24 * 3600_000;

type Filtro = 'todas' | 'bot' | 'humano' | 'confirmacao';

export function Atendimentos() {
  const [token, setToken] = useState(tokenSalvo());
  const [atendente, setAtendente] = useState(atendenteSalvo());
  const conectado = !!token && !!atendente;
  const lista = useConversas(conectado);
  const erro = lista.error instanceof ErroAtendimento ? lista.error : null;

  if (!WA_URL) {
    return (
      <Alert tone="warn" title="Painel de atendimentos sem endereço">
        Defina <code>VITE_WA_URL</code> com o endereço do app de WhatsApp (ex.: https://checkroute-whatsapp.wfelipe.com.br) e gere o build de novo.
      </Alert>
    );
  }

  if (!conectado || erro?.status === 401 || erro?.status === 503) {
    return <Conectar erro={erro} atendente={atendente} onSalvar={(t, n) => { salvarToken(t); salvarAtendente(n); setToken(t); setAtendente(n); void lista.refetch(); }} />;
  }

  return <Painel conversas={lista.data?.conversas ?? []} carregando={lista.isLoading} erro={lista.error as Error | null}
    info={lista.data ? `IA: ${lista.data.modo_ia} · WhatsApp: ${lista.data.meta === 'dry-run' ? 'teste (não envia)' : 'Cloud API'}` : ''}
    atendente={atendente} onSair={() => { salvarToken(''); setToken(''); }} />;
}

function Conectar({ erro, atendente, onSalvar }: { erro: ErroAtendimento | null; atendente: string; onSalvar: (token: string, nome: string) => void }) {
  const [t, setT] = useState('');
  const [n, setN] = useState(atendente);
  return (
    <Card title="Conectar ao atendimento" note="O token fica salvo só neste navegador. Peça o WA_ADMIN_TOKEN a quem administra o servidor." style={{ maxWidth: 520 }}>
      {erro && <Alert tone="bad" title={erro.status === 503 ? 'Painel desligado no servidor' : 'Token recusado'}>{erro.message}</Alert>}
      <form className="at-form" onSubmit={(e) => { e.preventDefault(); if (t.trim() && n.trim()) onSalvar(t, n); }}>
        <label className="ds-field">Seu nome (aparece para o motorista)
          <input value={n} onChange={(e) => setN(e.target.value)} maxLength={60} required autoComplete="name" />
        </label>
        <label className="ds-field">Token do painel
          <input value={t} onChange={(e) => setT(e.target.value)} type="password" required autoComplete="off" />
        </label>
        <Button type="submit">Conectar</Button>
      </form>
    </Card>
  );
}

function Painel({ conversas, carregando, erro, info, atendente, onSair }: {
  conversas: ConversaResumo[]; carregando: boolean; erro: Error | null; info: string; atendente: string; onSair: () => void;
}) {
  const [filtro, setFiltro] = useState<Filtro>('todas');
  const [busca, setBusca] = useState('');
  const [sel, setSel] = useState<string | null>(null);

  const visiveis = useMemo(() => conversas.filter((c) =>
    (filtro === 'todas' || (filtro === 'bot' && c.modo === 'bot') || (filtro === 'humano' && c.modo === 'humano') || (filtro === 'confirmacao' && c.aguardando_confirmacao))
    && (!busca || `${c.nome ?? ''} ${c.telefone}`.toLowerCase().includes(busca.toLowerCase().replace(/\D/g, '') || busca.toLowerCase()))), [conversas, filtro, busca]);
  const comAtendente = conversas.filter((c) => c.modo === 'humano').length;

  return (
    <div className="cr-stack">
      <div className="at-topo">
        <p className="ds-note" style={{ margin: 0 }}>
          {conversas.length} conversas nos últimos 7 dias · {comAtendente} com atendente{info && ` · ${info}`} · você: <b>{atendente}</b>
        </p>
        <Button variant="tertiary" onClick={onSair}>Trocar token</Button>
      </div>
      {erro && <Alert tone="bad" title="Não foi possível atualizar as conversas">{erro.message}</Alert>}
      <div className="at-grid">
        <section className="ds-card at-lista" aria-label="Conversas">
          <Segmented label="Filtrar conversas" value={filtro} onChange={setFiltro} options={[
            { value: 'todas', label: 'Todas' }, { value: 'bot', label: 'Bot' }, { value: 'humano', label: 'Atendente' }, { value: 'confirmacao', label: 'Confirmar' },
          ]} />
          <label className="ds-field at-busca">
            <span className="at-sr">Buscar</span>
            <input placeholder="Buscar por nome ou telefone" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </label>
          <ul className="at-itens">
            {carregando && <li className="ds-note">Carregando…</li>}
            {!carregando && !visiveis.length && <li className="ds-note">Nenhuma conversa {filtro === 'todas' ? 'nos últimos 7 dias' : 'neste filtro'}.</li>}
            {visiveis.map((c) => {
              const e = etapa(c);
              const esperando = c.modo === 'humano' && c.ultimo_autor === 'motorista';
              return (
                <li key={c.telefone}>
                  <button type="button" className="at-item" aria-current={sel === c.telefone || undefined} onClick={() => setSel(c.telefone)}>
                    <span className="at-item-l1"><b>{c.nome || formatarTelefone(c.telefone)}</b><time>{hora(c.ultima_em ?? c.atualizado_em)}</time></span>
                    {c.nome && <span className="at-item-tel">{formatarTelefone(c.telefone)}</span>}
                    <span className="at-item-prev">{c.ultimo_autor === 'motorista' ? '' : c.ultimo_autor === 'sistema' ? '• ' : '↪ '}{c.ultima_previa ?? '—'}</span>
                    <span className="at-item-tags"><Chip tone={e.tom}>{e.rotulo}</Chip>{esperando && <Chip tone="bad">Esperando resposta</Chip>}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
        {sel ? <Detalhe tel={sel} atendente={atendente} key={sel} /> : (
          <section className="ds-card at-vazio"><p className="ds-note">Escolha uma conversa para ver a transcrição, assumir o atendimento ou reiniciar.</p></section>
        )}
      </div>
    </div>
  );
}

function Detalhe({ tel, atendente }: { tel: string; atendente: string }) {
  const { data: c, error } = useConversa(tel);
  const acao = useAcao();
  const [avisar, setAvisar] = useState(true);
  const [confirmarReinicio, setConfirmarReinicio] = useState(false);
  const [texto, setTexto] = useState('');
  const fimRef = useRef<HTMLDivElement>(null);
  const qtd = c?.eventos.length ?? 0;
  useEffect(() => { fimRef.current?.scrollIntoView({ block: 'nearest' }); }, [qtd]);

  if (error) return <section className="ds-card"><Alert tone="bad" title="Não foi possível abrir a conversa">{(error as Error).message}</Alert></section>;
  if (!c) return <section className="ds-card"><p className="ds-note">Carregando…</p></section>;

  const e = etapa(c);
  const ultimaDoMotorista = [...c.eventos].reverse().find((x) => x.autor === 'motorista')?.criado_em ?? null;
  const fora = foraDaJanela(ultimaDoMotorista);
  const exec = (a: 'reiniciar' | 'assumir' | 'devolver' | 'mensagens', corpo: Record<string, unknown>) => acao.mutateAsync({ tel, acao: a, corpo });
  const enviar = async () => {
    if (!texto.trim()) return;
    await exec('mensagens', { texto });
    setTexto('');
  };

  return (
    <section className="ds-card at-det" aria-label={`Conversa com ${c.nome ?? formatarTelefone(tel)}`}>
      <header className="at-det-h">
        <div>
          <h2 className="ds-card-t">{c.nome || formatarTelefone(tel)}</h2>
          <p className="ds-note" style={{ margin: 0 }}>{formatarTelefone(tel)}{c.atendente && ` · atendente: ${c.atendente}`}</p>
        </div>
        <Chip tone={e.tom}>{e.rotulo}</Chip>
      </header>

      <div className="at-acoes">
        {c.modo === 'bot'
          ? <Button loading={acao.isPending} onClick={() => exec('assumir', { atendente, avisar })}>Assumir conversa</Button>
          : <Button variant="secondary" loading={acao.isPending} onClick={() => exec('devolver', { por: atendente, avisar })}>Devolver ao bot</Button>}
        {!confirmarReinicio
          ? <Button variant="tertiary" onClick={() => setConfirmarReinicio(true)}>Reiniciar conversa</Button>
          : (
            <span className="at-confirma" role="group" aria-label="Confirmar reinício">
              Apaga a ficha em andamento e volta para o bot.
              <Button variant="danger" onClick={async () => { await exec('reiniciar', { por: atendente, avisar }); setConfirmarReinicio(false); }}>Reiniciar</Button>
              <Button variant="tertiary" onClick={() => setConfirmarReinicio(false)}>Cancelar</Button>
            </span>
          )}
        <label className="at-check"><input type="checkbox" checked={avisar} onChange={(ev) => setAvisar(ev.target.checked)} /> Avisar o motorista</label>
      </div>
      {acao.error && <Alert tone="bad" title="A ação não foi feita">{(acao.error as Error).message}</Alert>}
      {fora && <Alert tone="warn" title="Fora da janela de 24 horas">A última mensagem do motorista tem mais de 24 h. A Meta não entrega texto livre até ele escrever de novo.</Alert>}

      {c.resumo && (
        <details className="at-ficha" open={c.aguardando_confirmacao}>
          <summary>Ficha em andamento{c.faltando.length ? ` · faltam ${c.faltando.length}` : ' · completa'}</summary>
          <pre>{c.resumo.replace(/\*/g, '')}</pre>
          {!!c.faltando.length && <p className="ds-note">Falta: {c.faltando.join(', ')}</p>}
        </details>
      )}

      <div className="at-msgs" role="log" aria-live="polite">
        {c.eventos.map((ev) => <Bolha key={ev.id} ev={ev} />)}
        {!c.eventos.length && <p className="ds-note">Sem mensagens registradas.</p>}
        <div ref={fimRef} />
      </div>

      {c.modo === 'humano' ? (
        <form className="at-compor" onSubmit={(ev) => { ev.preventDefault(); void enviar(); }}>
          <label className="at-sr" htmlFor="at-texto">Mensagem para o motorista</label>
          <textarea id="at-texto" rows={2} value={texto} maxLength={4000} placeholder="Escreva para o motorista (Enter envia, Shift+Enter quebra linha)"
            onChange={(ev) => setTexto(ev.target.value)}
            onKeyDown={(ev) => { if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); void enviar(); } }} />
          <Button type="submit" loading={acao.isPending} disabled={!texto.trim()}>Enviar</Button>
        </form>
      ) : (
        <p className="ds-note at-dica">O bot está respondendo. Assuma a conversa para escrever.</p>
      )}
    </section>
  );
}

const NOME_AUTOR: Record<Evento['autor'], string> = { motorista: 'Motorista', bot: 'Bot', atendente: 'Atendente', sistema: '' };

function Bolha({ ev }: { ev: Evento }) {
  if (ev.autor === 'sistema') return <p className="at-sis">{ev.texto} · {hora(ev.criado_em)}</p>;
  return (
    <div className="at-bolha" data-autor={ev.autor}>
      <span className="at-bolha-a">{NOME_AUTOR[ev.autor]} · {hora(ev.criado_em)}</span>
      <p>{ev.texto.replace(/\*/g, '')}</p>
    </div>
  );
}
