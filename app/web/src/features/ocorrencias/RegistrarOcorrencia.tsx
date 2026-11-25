import { useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Alert, Button, Card } from '@/design-system';
import { useFontes, useRegistrarOcorrencia } from '@/data/hooks';
import { GRAVIDADES, iaApi, NOME_DADO_PESSOAL, PRODUTOS, TIPOS_TRANSFERENCIA, type Ficha, type RespostaExtracao } from '@/data/ia';
import { fmt } from '@/lib/format';
import { useFiltros } from '@/app/store';

const TAMANHO_MAX_FOTO = 5 * 1024 * 1024;
const OBRIGATORIOS: (keyof Ficha)[] = ['tipo', 'rota_id', 'data_hora', 'trecho', 'produto', 'custo_estimado'];
const ROTULO: Partial<Record<keyof Ficha, string>> = {
  tipo: 'Tipo da ocorrência', rota_id: 'Rota (hub de destino)', data_hora: 'Data e hora', trecho: 'Trecho (rodovia e km)',
  produto: 'Carga afetada', custo_estimado: 'Prejuízo estimado (R$)',
};

interface Foto { base64: string; tipo: string; nome: string; previa: string }

/**
 * Registro de ocorrência pelo painel (mesma extração do WhatsApp): relato e foto →
 * IA preenche a ficha → a pessoa revisa e confirma. Nada é gravado sem a confirmação.
 */
export function RegistrarOcorrencia() {
  const { data: fontes } = useFontes();
  const abrirRota = useFiltros((s) => s.abrirRota);
  const hubs = (fontes?.rotas ?? []).filter((r) => r.perna === 'transferencia');
  const [relato, setRelato] = useState('');
  const [complemento, setComplemento] = useState('');
  const [foto, setFoto] = useState<Foto | null>(null);
  const [leitura, setLeitura] = useState<number | null>(null);
  const [erroFoto, setErroFoto] = useState<string | null>(null);
  const [res, setRes] = useState<RespostaExtracao | null>(null);
  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [registradaId, setRegistradaId] = useState<string | null>(null);
  const inputFoto = useRef<HTMLInputElement>(null);

  const extrair = useMutation({
    mutationFn: (texto: string) => iaApi.extrair(texto, foto ? { base64: foto.base64, tipo: foto.tipo } : undefined),
    onSuccess: (r) => { setRes(r); setFicha(r.ficha); setComplemento(''); },
  });
  const registrar = useRegistrarOcorrencia();

  const faltam = ficha ? OBRIGATORIOS.filter((c) => ficha[c] === null || ficha[c] === '') : [];
  const incerto = (c: keyof Ficha) => Boolean(res && ((res.faltando.includes(c) && (ficha?.[c] == null || ficha?.[c] === '')) || res.revisar.includes(c)));
  const atualiza = <K extends keyof Ficha>(c: K, v: Ficha[K]) => setFicha((f) => (f ? { ...f, [c]: v } : f));

  function escolherFoto(arquivo: File | undefined) {
    setErroFoto(null);
    if (!arquivo) return;
    if (!/^image\/(jpeg|png|webp)$/.test(arquivo.type)) { setErroFoto('Use uma foto JPG, PNG ou WebP.'); return; }
    if (arquivo.size > TAMANHO_MAX_FOTO) { setErroFoto('A foto passa de 5 MB. Envie uma menor.'); return; }
    const leitor = new FileReader();
    leitor.onprogress = (e) => e.lengthComputable && setLeitura(Math.round((e.loaded / e.total) * 100));
    leitor.onerror = () => { setLeitura(null); setErroFoto('Não foi possível ler a foto. Tente de novo.'); };
    leitor.onload = () => {
      const url = String(leitor.result);
      setFoto({ base64: url.replace(/^data:[^,]+,/, ''), tipo: arquivo.type, nome: arquivo.name, previa: url });
      setLeitura(null);
    };
    leitor.readAsDataURL(arquivo);
  }

  function recomecar() {
    setRelato(''); setComplemento(''); setFoto(null); setRes(null); setFicha(null); setRegistradaId(null);
    extrair.reset(); registrar.reset();
    if (inputFoto.current) inputFoto.current.value = '';
  }

  async function confirmar() {
    if (!ficha || faltam.length) return;
    const oc = await registrar.mutateAsync({
      ...ficha, relato: [relato, complemento].filter(Boolean).join('\n'), canal: 'formulario', com_foto: Boolean(foto),
    });
    setRegistradaId(oc.id);
  }

  if (registradaId) {
    return (
      <Card id="registrar-ocorrencia" title="Registrar ocorrência">
        <Alert tone="ok" title={`Ocorrência registrada · protocolo ${registradaId}`}>
          Ela já entra no score e na taxa de acidentes da rota.
        </Alert>
        <div className="cr-acao-b" style={{ marginTop: 'var(--space-4)' }}>
          <Button onClick={() => abrirRota('transferencia')}>Ver a rota na Transferência</Button>
          <Button variant="secondary" onClick={recomecar}>Registrar outra</Button>
        </div>
      </Card>
    );
  }

  return (
    <Card id="registrar-ocorrencia" title="Registrar ocorrência"
      note="Cole o relato do motorista (ou do SAC) e, se tiver, a foto. A IA preenche a ficha; você revisa e confirma. É o mesmo fluxo do WhatsApp.">
      {!res && (
        <div className="ds-modal-b">
          <label className="ds-campo"><span>Relato<span className="ds-req" aria-hidden="true">*</span></span>
            <textarea value={relato} onChange={(e) => setRelato(e.target.value)} rows={5} required
              placeholder="Ex.: Tombamento da carreta na BR-381 km 512 hoje às 03:40, indo pro hub de Belo Horizonte. 40 caixas de micro-ondas, prejuízo uns R$ 38 mil." />
          </label>
          <div className="ds-campo">Foto (opcional)
            <div className="cr-upload">
              <input ref={inputFoto} type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => escolherFoto(e.target.files?.[0])} aria-describedby="foto-ajuda" />
              {leitura != null && <progress max={100} value={leitura} aria-label="Lendo a foto">{leitura}%</progress>}
              {foto && (
                <div className="cr-previa">
                  <img src={foto.previa} alt={`Foto enviada: ${foto.nome}`} />
                  <Button variant="tertiary" onClick={() => { setFoto(null); if (inputFoto.current) inputFoto.current.value = ''; }}>Remover foto</Button>
                </div>
              )}
            </div>
            <small id="foto-ajuda">JPG, PNG ou WebP até 5 MB. A foto vai para a análise, mas não fica guardada.</small>
            {erroFoto && <span className="ds-erro" role="alert">{erroFoto}</span>}
          </div>
          {extrair.isError && (
            <Alert tone="bad" title="Não foi possível analisar o relato">
              {(extrair.error as Error).message}.{' '}
              <button type="button" className="cr-link" onClick={() => extrair.mutate(relato)}>Tentar de novo</button>
            </Alert>
          )}
          <div className="cr-acao-b">
            <Button onClick={() => extrair.mutate(relato)} loading={extrair.isPending} disabled={relato.trim().length < 5 || leitura != null}>
              Analisar relato
            </Button>
          </div>
        </div>
      )}

      {res && ficha && (
        <div className="ds-modal-b">
          <div className="cr-acao-t" style={{ color: 'var(--color-fg)' }}>
            <span className="ds-selo ds-selo--ia">Ficha gerada por IA · {res.meta.modo === 'claude' ? res.meta.modelo : 'modo simulado'}</span>
            <span className="ds-muted">
              {res.meta.processado_em && new Date(res.meta.processado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
              {' · '}{fmt.n1(res.meta.ms / 1000)} s{res.meta.custo_usd > 0 && <> · US$ {res.meta.custo_usd.toFixed(4)}</>}
            </span>
          </div>

          {res.privacidade.mascarados.length > 0 && (
            <Alert tone="info" title="Dados pessoais mascarados">
              {res.privacidade.mascarados.map((d) => NOME_DADO_PESSOAL[d] ?? d).join(', ')}: a IA não recebeu esses dados e eles não serão gravados.
            </Alert>
          )}
          {res.guardas.instrucao_suspeita && (
            <Alert tone="warn" title="O relato tem uma instrução suspeita">
              Tratada como dado, não como ordem: {res.guardas.motivos.join('; ')}. Confira a ficha antes de confirmar.
            </Alert>
          )}
          {res.meta.aviso && <Alert tone="neutral">{res.meta.aviso}</Alert>}

          {!res.ok && res.pergunta && (
            <Alert tone="warn" title="Faltam informações">
              <p style={{ margin: '0 0 var(--space-2)' }}>{res.pergunta}</p>
              <label className="ds-campo">Complemento do relato
                <textarea value={complemento} onChange={(e) => setComplemento(e.target.value)} rows={2} placeholder="Resposta do motorista" />
              </label>
              <div className="cr-acao-b" style={{ marginTop: 'var(--space-2)' }}>
                <Button variant="secondary" disabled={!complemento.trim()} loading={extrair.isPending}
                  onClick={() => extrair.mutate(`${relato}\n${complemento}`)}>Analisar de novo com o complemento</Button>
              </div>
            </Alert>
          )}

          <details className="cr-relato">
            <summary>Relato como a IA recebeu</summary>
            <p>{res.relato_mascarado}</p>
          </details>

          <div className="ds-form-grid" id="ficha-revisavel">
            <Campo c="tipo" incerto={incerto('tipo')}>
              <select value={ficha.tipo ?? ''} onChange={(e) => atualiza('tipo', (e.target.value || null) as Ficha['tipo'])} required>
                <option value="">Selecione</option>
                {TIPOS_TRANSFERENCIA.map((t) => <option key={t}>{t}</option>)}
              </select>
            </Campo>
            <Campo c="rota_id" incerto={incerto('rota_id')}>
              <select value={ficha.rota_id ?? ''} onChange={(e) => atualiza('rota_id', e.target.value || null)} required>
                <option value="">Selecione</option>
                {hubs.map((r) => <option key={r.rota_id} value={r.rota_id}>{r.rota}</option>)}
              </select>
            </Campo>
            <Campo c="data_hora" incerto={incerto('data_hora')}>
              <input type="datetime-local" value={ficha.data_hora ?? ''} onChange={(e) => atualiza('data_hora', e.target.value || null)} required />
            </Campo>
            <Campo c="trecho" incerto={incerto('trecho')}>
              <input value={ficha.trecho ?? ''} onChange={(e) => atualiza('trecho', e.target.value || null)} required />
            </Campo>
            <Campo c="produto" incerto={incerto('produto')}>
              <select value={ficha.produto ?? ''} onChange={(e) => atualiza('produto', (e.target.value || null) as Ficha['produto'])} required>
                <option value="">Selecione</option>
                {PRODUTOS.map((p) => <option key={p}>{p}</option>)}
              </select>
            </Campo>
            <Campo c="custo_estimado" incerto={incerto('custo_estimado')} aviso={res.revisar.includes('custo_estimado') ? 'Valor fora do esperado: confira.' : undefined}>
              <input type="number" min={0} step="0.01" inputMode="decimal" value={ficha.custo_estimado ?? ''} required
                onChange={(e) => atualiza('custo_estimado', e.target.value === '' ? null : Number(e.target.value))} />
            </Campo>
            <label className="ds-campo">Placa (pseudônimo)
              <input value={ficha.placa ?? 'Não informado'} readOnly />
              <small>A placa real não é guardada; o pseudônimo permite cruzar o mesmo veículo.</small>
            </label>
            <label className="ds-campo">Veículo
              <input value={ficha.tipo_veiculo ?? ''} onChange={(e) => atualiza('tipo_veiculo', e.target.value || null)} placeholder="Não informado" />
            </label>
            <label className="ds-campo">Embalagem
              <input value={ficha.embalagem ?? ''} onChange={(e) => atualiza('embalagem', e.target.value || null)} placeholder="Não informado" />
            </label>
            <label className="ds-campo">Via e clima
              <input value={ficha.condicao_via_clima ?? ''} onChange={(e) => atualiza('condicao_via_clima', e.target.value || null)} placeholder="Não informado" />
            </label>
            <label className="ds-campo">Gravidade
              <select value={ficha.gravidade ?? ''} onChange={(e) => atualiza('gravidade', (e.target.value || null) as Ficha['gravidade'])}>
                <option value="">Não informado</option>
                {GRAVIDADES.map((g) => <option key={g}>{g}</option>)}
              </select>
            </label>
            <label className="ds-campo">Volumes afetados
              <input type="number" min={0} value={ficha.volumes_afetados ?? ''} placeholder="Não informado"
                onChange={(e) => atualiza('volumes_afetados', e.target.value === '' ? null : Number(e.target.value))} />
            </label>
            <label className="ds-campo">Houve vítima?
              <select value={ficha.houve_vitima == null ? '' : ficha.houve_vitima ? 'sim' : 'nao'}
                onChange={(e) => atualiza('houve_vitima', e.target.value === '' ? null : e.target.value === 'sim')}>
                <option value="">Não informado</option><option value="nao">Não</option><option value="sim">Sim</option>
              </select>
            </label>
            <label className="ds-campo ds-campo--full">Resumo
              <textarea value={ficha.resumo} onChange={(e) => atualiza('resumo', e.target.value)} rows={2} />
            </label>
          </div>

          {faltam.length > 0 && (
            <p className="ds-erro">Para registrar, preencha: {faltam.map((c) => ROTULO[c]).join(', ')}.</p>
          )}
          {registrar.isError && <Alert tone="bad" title="Não foi possível registrar">{(registrar.error as Error).message}</Alert>}
          <div className="cr-acao-b">
            <Button onClick={confirmar} disabled={faltam.length > 0} loading={registrar.isPending}>Confirmar e registrar</Button>
            <Button variant="tertiary" onClick={recomecar}>Descartar</Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function Campo({ c, incerto, aviso, children }: { c: keyof Ficha; incerto: boolean; aviso?: string; children: React.ReactNode }) {
  return (
    <label className="ds-campo" data-incerto={incerto || undefined}>
      <span>{ROTULO[c]}<span className="ds-req" aria-hidden="true">*</span></span>
      {children}
      {incerto && <small>{aviso ?? 'A IA não encontrou no relato: confira ou preencha.'}</small>}
    </label>
  );
}
