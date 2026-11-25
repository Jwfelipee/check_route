import { useState } from 'react';
import { Button, Modal } from '@/design-system';
import { useCriarAcao } from '@/data/hooks';
import type { SaudeRota } from '@/lib/score';

const hoje = () => new Date().toISOString().slice(0, 10);
const emDias = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

/**
 * "Validar ação e acompanhar" (controle humano): a sugestão só vira compromisso com
 * responsável e prazo. Sem os três campos, não confirma.
 */
export function ValidarAcaoModal({ rota, acaoSugerida, praticaId, prazoDias, origem, aberto, onFechar }: {
  rota: SaudeRota; acaoSugerida: string; praticaId: string | null; prazoDias?: number; origem: 'ia' | 'ia_contexto';
  aberto: boolean; onFechar: () => void;
}) {
  const criar = useCriarAcao();
  const [acao, setAcao] = useState(acaoSugerida);
  const [responsavel, setResponsavel] = useState('');
  const [prazo, setPrazo] = useState(emDias(prazoDias ?? 14));
  const [tentou, setTentou] = useState(false);
  const faltando = !acao.trim() || !responsavel.trim() || !prazo;

  async function confirmar() {
    setTentou(true);
    if (faltando) return;
    await criar.mutateAsync({
      rota_id: rota.rota_id, perna: rota.perna, rota: rota.rota, acao: acao.trim(), acao_sugerida: acaoSugerida,
      foco: rota.foco, responsavel: responsavel.trim(), prazo, status: 'Em acompanhamento',
      score_inicial: rota.score == null ? null : Math.round(rota.score), validada_em: hoje(), validada_por: null,
      pratica_id: praticaId, origem_sugestao: origem,
    });
    onFechar();
  }

  return (
    <Modal id="validar-acao" aberto={aberto} onFechar={onFechar} titulo="Validar ação e acompanhar"
      descricao="A ação sai de sugestão e vira acompanhamento, com responsável e prazo. O score de hoje fica guardado para comparar depois."
      rodape={<>
        <Button variant="tertiary" onClick={onFechar}>Cancelar</Button>
        <Button onClick={confirmar} loading={criar.isPending}>Validar e acompanhar</Button>
      </>}>
      <label className="ds-campo">Rota
        <input value={`${rota.rota} · score ${rota.score == null ? '—' : Math.round(rota.score)}/100`} readOnly />
      </label>
      <label className="ds-campo"><span>Ação<span className="ds-req" aria-hidden="true">*</span></span>
        <textarea value={acao} onChange={(e) => setAcao(e.target.value)} aria-invalid={tentou && !acao.trim()} required />
        <small>Pode ajustar o texto da sugestão.</small>
      </label>
      <div className="ds-form-grid">
        <label className="ds-campo"><span>Responsável<span className="ds-req" aria-hidden="true">*</span></span>
          <input value={responsavel} onChange={(e) => setResponsavel(e.target.value)} placeholder="Quem vai tocar a ação"
            aria-invalid={tentou && !responsavel.trim()} required />
        </label>
        <label className="ds-campo"><span>Prazo<span className="ds-req" aria-hidden="true">*</span></span>
          <input type="date" value={prazo} min={hoje()} onChange={(e) => setPrazo(e.target.value)} aria-invalid={tentou && !prazo} required />
        </label>
      </div>
      {tentou && faltando && <p className="ds-erro" role="alert">Preencha a ação, o responsável e o prazo.</p>}
      {criar.isError && <p className="ds-erro" role="alert">Não foi possível salvar: {(criar.error as Error).message}</p>}
    </Modal>
  );
}
