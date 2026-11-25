import { useState } from 'react';
import { Alert, Button, Card, Chip, Modal } from '@/design-system';
import { useContatos, useCriarContato, useEditarContato, useFontes } from '@/data/hooks';
import { temApi, type PapelContato } from '@/data/ia';

const PAPEL: Record<PapelContato, string> = { motorista: 'Motorista', transportadora: 'Responsável da transportadora', gestor: 'Gestor (todas as rotas)' };

/**
 * Contatos: quem pode registrar ocorrências pelo WhatsApp e por quais rotas responde.
 * O cadastro é feito aqui; número que não está na lista não registra nada. O telefone aparece mascarado.
 */
export function ContatosPagina() {
  const { data, isLoading, error } = useContatos();
  const { data: fontes } = useFontes();
  const editar = useEditarContato();
  const [cadastrando, setCadastrando] = useState(false);
  const nomeRota = new Map((fontes?.rotas ?? []).map((r) => [r.rota_id, r.rota]));

  if (!temApi) {
    return (
      <Alert tone="info" title="O cadastro de contatos usa a API">
        Defina <code>VITE_API_URL</code> em <code>app/web/.env</code> (por exemplo, http://localhost:7333) e recarregue a página.
      </Alert>
    );
  }

  return (
    <section className="cr-stack" id="contatos">
      <Card id="contatos-lista" title="Contatos do WhatsApp"
        note="Só quem está aqui consegue registrar ocorrências pelo WhatsApp, e só nas rotas listadas. A IA que atende cada pessoa também só enxerga os dados dessas rotas.">
        <div className="cr-acao-b" style={{ marginTop: 0 }}>
          <Button onClick={() => setCadastrando(true)}>Cadastrar contato</Button>
        </div>
        {error && <Alert tone="bad" title="Não foi possível carregar">{(error as Error).message}</Alert>}
        {isLoading && <div className="ds-skeleton" style={{ height: 80 }} />}
        {editar.isError && <Alert tone="bad" title="Não foi possível salvar">{(editar.error as Error).message}</Alert>}
        {data && (
          <div className="ds-table-box">
            <table className="ds-table">
              <thead><tr><th>Nome</th><th>Papel</th><th>Transportadora</th><th>Rotas</th><th>Telefone</th><th>Situação</th><th><span className="ds-sr-only">Ações</span></th></tr></thead>
              <tbody>
                {data.map((c) => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 500 }}>{c.nome}</td>
                    <td>{PAPEL[c.papel]}</td>
                    <td>{c.transportadora ?? '—'}</td>
                    <td style={{ whiteSpace: 'normal', minWidth: 180 }}>
                      {c.papel === 'gestor' ? 'Todas' : c.rotas.map((id) => nomeRota.get(id) ?? id).join('; ')}
                    </td>
                    <td>{c.telefone}</td>
                    <td><Chip tone={c.ativo ? 'ok' : ''}>{c.ativo ? 'Ativo' : 'Inativo'}</Chip></td>
                    <td>
                      <Button variant="tertiary" disabled={editar.isPending}
                        onClick={() => editar.mutate({ id: c.id, ativo: !c.ativo })}>{c.ativo ? 'Desativar' : 'Ativar'}</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {cadastrando && <CadastrarContato onFechar={() => setCadastrando(false)} />}
    </section>
  );
}

function CadastrarContato({ onFechar }: { onFechar: () => void }) {
  const criar = useCriarContato();
  const { data: fontes } = useFontes();
  const rotas = (fontes?.rotas ?? []).filter((r) => r.perna === 'transferencia');
  const [telefone, setTelefone] = useState('');
  const [nome, setNome] = useState('');
  const [papel, setPapel] = useState<PapelContato>('motorista');
  const [transportadora, setTransportadora] = useState('');
  const [escolhidas, setEscolhidas] = useState<string[]>([]);
  const [tentou, setTentou] = useState(false);
  const digitos = telefone.replace(/\D/g, '');
  const todas = papel === 'gestor';
  const faltando = digitos.length < 10 || nome.trim().length < 2 || (!todas && !escolhidas.length);

  const alterna = (id: string) => setEscolhidas((r) => (r.includes(id) ? r.filter((x) => x !== id) : [...r, id]));

  async function salvar() {
    setTentou(true);
    if (faltando) return;
    await criar.mutateAsync({ telefone: digitos, nome: nome.trim(), papel, transportadora: transportadora.trim() || null, rotas: todas ? [] : escolhidas }).then(onFechar, () => undefined);
  }

  return (
    <Modal id="cadastrar-contato" aberto onFechar={onFechar} titulo="Cadastrar contato"
      descricao="A pessoa passa a registrar ocorrências pelo WhatsApp, só nas rotas marcadas. Quem não estiver cadastrado não registra nada."
      rodape={<>
        <Button variant="tertiary" onClick={onFechar}>Cancelar</Button>
        <Button onClick={salvar} loading={criar.isPending}>Cadastrar</Button>
      </>}>
      <div className="ds-form-grid">
        <label className="ds-campo"><span>Telefone (com DDD)<span className="ds-req" aria-hidden="true">*</span></span>
          <input value={telefone} onChange={(e) => setTelefone(e.target.value)} inputMode="tel" placeholder="55 31 99999-0000"
            aria-invalid={tentou && digitos.length < 10} required />
          <small>O número do WhatsApp da pessoa. Ele só aparece mascarado depois.</small>
        </label>
        <label className="ds-campo"><span>Nome<span className="ds-req" aria-hidden="true">*</span></span>
          <input value={nome} onChange={(e) => setNome(e.target.value)} aria-invalid={tentou && nome.trim().length < 2} required />
        </label>
        <label className="ds-campo"><span>Papel<span className="ds-req" aria-hidden="true">*</span></span>
          <select value={papel} onChange={(e) => setPapel(e.target.value as PapelContato)}>
            {(Object.keys(PAPEL) as PapelContato[]).map((p) => <option key={p} value={p}>{PAPEL[p]}</option>)}
          </select>
        </label>
        <label className="ds-campo">Transportadora
          <input value={transportadora} onChange={(e) => setTransportadora(e.target.value)} placeholder="Ex.: Transp. Alfa" />
        </label>
      </div>
      {!todas && (
        <fieldset className="ds-campo" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend style={{ padding: 0 }}>Rotas em que ela responde<span className="ds-req" aria-hidden="true">*</span></legend>
          <div className="cr-checks">
            {rotas.map((r) => (
              <label key={r.rota_id} className="cr-check">
                <input type="checkbox" checked={escolhidas.includes(r.rota_id)} onChange={() => alterna(r.rota_id)} />
                <span>{r.rota} <span className="ds-muted">· {r.transportadora}</span></span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {tentou && faltando && <p className="ds-erro" role="alert">Informe o telefone com DDD, o nome{todas ? '' : ' e pelo menos uma rota'}.</p>}
      {criar.isError && <p className="ds-erro" role="alert">Não foi possível cadastrar: {(criar.error as Error).message}</p>}
    </Modal>
  );
}
