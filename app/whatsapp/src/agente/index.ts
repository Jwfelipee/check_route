/**
 * Orquestra uma mensagem recebida: carrega a conversa, trata o que é regra de código
 * (número autorizado, áudio, botões Confirmar/Corrigir) e passa o resto para o agente.
 * Mensagens do mesmo telefone são processadas em fila, uma de cada vez.
 */
import { api } from '../api.js';
import { config } from '../config.js';
import { carregar, recomecar, registrarTrilha, salvar, type Conversa } from '../estado.js';
import { enviarTexto, marcarLida } from '../meta/client.js';
import type { MensagemRecebida } from '../meta/webhook.js';
import { turnoClaude } from './claude.js';
import { faltandoNaFicha } from './ficha.js';
import { BOTAO_CONFIRMAR, BOTAO_CORRIGIR } from './ferramentas.js';
import { turnoSimulado } from './simulado.js';

const filas = new Map<string, Promise<void>>();

export function processar(m: MensagemRecebida): Promise<void> {
  const anterior = filas.get(m.de) ?? Promise.resolve();
  const atual = anterior.then(() => tratar(m)).catch((e) => console.error(`[wa] erro com ${m.de}:`, e));
  filas.set(m.de, atual);
  void atual.finally(() => { if (filas.get(m.de) === atual) filas.delete(m.de); });
  return atual;
}

const turno = (c: Conversa, entrada: string) => (config.iaReal ? turnoClaude : turnoSimulado)({ conversa: c }, entrada);

async function tratar(m: MensagemRecebida) {
  await marcarLida(m.id);

  // Quem fala é quem o painel cadastrou para este número (verificado pela Meta). Sem cadastro, nada vai para a IA.
  let contato;
  try {
    contato = await api.contato(m.de);
  } catch (e) {
    console.error(`[wa] não consegui conferir o cadastro de ${m.de}:`, e);
    await enviarTexto(m.de, 'Estou com instabilidade para confirmar o seu cadastro agora. Tente de novo em alguns minutos.');
    return;
  }
  if (!contato || !contato.ativo) {
    await enviarTexto(m.de, 'Este número não está cadastrado para registrar ocorrências. Peça ao responsável da sua transportadora para cadastrar você no painel.');
    return;
  }
  let c = await carregar(m.de, contato.nome);
  c.contato = contato;
  let resposta: string | null = null;

  switch (m.tipo) {
    case 'audio':
      resposta = 'Ainda não consigo ouvir áudio. Pode escrever o que aconteceu? Se tiver foto, pode mandar também.';
      break;

    case 'outro':
      resposta = 'Consigo receber texto e foto. Me conte por escrito o que aconteceu na viagem.';
      break;

    case 'botao':
      if (m.botaoId === BOTAO_CONFIRMAR) {
        resposta = await confirmar(c);
        if (resposta.startsWith('✅')) c = recomecar(c);
      } else if (m.botaoId === BOTAO_CORRIGIR) {
        c.aguardando_confirmacao = false;
        resposta = await turno(c, 'Quero corrigir a ficha.');
      }
      break;

    case 'imagem': {
      c.foto_media_id = m.mediaId;
      if (m.legenda) c.relato = `${c.relato}\n${m.legenda}`.trim();
      resposta = await turno(c, `[O motorista enviou uma foto]${m.legenda ? ` com a legenda: ${m.legenda}` : ''}`);
      break;
    }

    case 'texto': {
      // Confirmação digitada ("sim", "confirmo") também vale, desde que haja resumo pendente.
      if (c.aguardando_confirmacao && /^\s*(sim|confirmo|confirmar|ok)\s*[.!]*\s*$/i.test(m.texto)) {
        resposta = await confirmar(c);
        if (resposta.startsWith('✅')) c = recomecar(c);
        break;
      }
      c.relato = `${c.relato}\n${m.texto}`.trim();
      resposta = await turno(c, m.texto);
      break;
    }
  }

  await salvar(c);
  if (resposta) await enviarTexto(m.de, resposta);
}

/** Grava na API a ficha que o motorista viu e confirmou. Só o código chega aqui, nunca o modelo. */
async function confirmar(c: Conversa): Promise<string> {
  if (!c.aguardando_confirmacao || !c.ficha_pendente) return 'Não tenho nenhuma ocorrência esperando confirmação. Me conte o que aconteceu.';
  const faltando = faltandoNaFicha(c.ficha_pendente);
  if (faltando.length) return 'A ficha ainda está incompleta. Me diga o que falta e eu mando o resumo de novo.';
  const ct = c.contato;
  if (!ct) return 'Não consegui confirmar o seu cadastro. Tente de novo em alguns minutos.';
  if (!ct.todas_as_rotas && !ct.rotas.some((r) => r.rota_id === c.ficha_pendente?.rota_id)) {
    return `Essa rota não está entre as suas (${ct.rotas.map((r) => r.rota).join('; ')}). Me diga em qual delas foi.`;
  }
  // Quem registrou vai no campo próprio (reportado_por), não no texto do relato: o relato fica sem telefone nem nome.
  const ficha = { ...c.ficha_pendente, relato: c.ficha_pendente.relato ?? c.relato };
  try {
    const oc = await api.registrar(ficha, ct.id);
    await registrarTrilha(c.telefone, oc.id, ficha, ct.id);
    return `✅ Ocorrência registrada. Protocolo: *${oc.id}*.\nObrigado! Se precisar registrar outra, é só mandar mensagem.`;
  } catch (e) {
    console.error('[wa] falha ao registrar:', e);
    return `Não consegui registrar agora (${(e as Error).message}). Tente apertar Confirmar de novo em alguns minutos.`;
  }
}
