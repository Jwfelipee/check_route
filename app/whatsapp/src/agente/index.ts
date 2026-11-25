/**
 * Orquestra uma mensagem recebida: carrega a conversa, trata o que é regra de código
 * (número autorizado, áudio, botões Confirmar/Corrigir, comando de reinício, atendente humano)
 * e passa o resto para o agente. Tudo do mesmo telefone (mensagens e ações do painel)
 * passa por uma fila, uma coisa de cada vez.
 */
import { api } from '../api.js';
import { config } from '../config.js';
import { carregar, recomecar, registrarEvento, registrarTrilha, salvar, type Conversa } from '../estado.js';
import { enviarTexto, marcarLida } from '../meta/client.js';
import type { MensagemRecebida } from '../meta/webhook.js';
import { turnoClaude } from './claude.js';
import { COMANDO_REINICIAR, faltandoNaFicha, SAUDACAO } from './ficha.js';
import { BOTAO_CONFIRMAR, BOTAO_CORRIGIR } from './ferramentas.js';
import { turnoSimulado } from './simulado.js';

const filas = new Map<string, Promise<unknown>>();

/** Executa `fn` na fila do telefone (nunca em paralelo com outra mensagem ou ação do mesmo número). */
export function naFila<T>(telefone: string, fn: () => Promise<T>): Promise<T> {
  const anterior = filas.get(telefone) ?? Promise.resolve();
  const atual = anterior.catch(() => undefined).then(fn);
  filas.set(telefone, atual);
  void atual.catch(() => undefined).finally(() => { if (filas.get(telefone) === atual) filas.delete(telefone); });
  return atual;
}

export function processar(m: MensagemRecebida): Promise<void> {
  return naFila(m.de, () => tratar(m)).catch((e) => console.error(`[wa] erro com ${m.de}:`, e));
}

const turno = (c: Conversa, entrada: string) => (config.iaReal ? turnoClaude : turnoSimulado)({ conversa: c }, entrada);

function descrever(m: MensagemRecebida): { tipo: string; texto: string } {
  switch (m.tipo) {
    case 'texto': return { tipo: 'texto', texto: m.texto };
    case 'imagem': return { tipo: 'imagem', texto: `[foto]${m.legenda ? ` ${m.legenda}` : ''}` };
    case 'botao': return { tipo: 'botao', texto: `[botão] ${m.titulo}` };
    case 'audio': return { tipo: 'audio', texto: '[áudio]' };
    default: return { tipo: 'outro', texto: `[${m.original}]` };
  }
}

async function tratar(m: MensagemRecebida) {
  await marcarLida(m.id);
  const d = descrever(m);
  await registrarEvento(m.de, 'motorista', d.tipo, d.texto);

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

  // Atendente humano no comando: o agente não responde. O texto entra no relato,
  // para o agente saber o que foi dito se a conversa voltar para ele.
  if (c.modo === 'humano') {
    if (m.tipo === 'texto') c.relato = `${c.relato}\n${m.texto}`.trim();
    if (m.tipo === 'imagem') c.foto_media_id = m.mediaId;
    await salvar(c);
    return;
  }

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
        const r = await confirmar(c);
        resposta = r.texto;
        if (r.ok) c = recomecar(c);
      } else if (m.botaoId === BOTAO_CORRIGIR) {
        c.aguardando_confirmacao = false;
        resposta = await turno(c, 'Quero corrigir a ficha.');
      }
      break;

    case 'imagem':
      c.foto_media_id = m.mediaId;
      if (m.legenda) c.relato = `${c.relato}\n${m.legenda}`.trim();
      resposta = await turno(c, `[O motorista enviou uma foto]${m.legenda ? ` com a legenda: ${m.legenda}` : ''}`);
      break;

    case 'texto':
      if (COMANDO_REINICIAR.test(m.texto)) {
        c = recomecar(c);
        await registrarEvento(m.de, 'sistema', 'reinicio', 'Conversa reiniciada pelo motorista');
        resposta = SAUDACAO;
        break;
      }
      // Confirmação digitada ("sim", "confirmo") também vale, desde que haja resumo pendente.
      if (c.aguardando_confirmacao && /^\s*(sim|confirmo|confirmar|ok)\s*[.!]*\s*$/i.test(m.texto)) {
        const r = await confirmar(c);
        resposta = r.texto;
        if (r.ok) c = recomecar(c);
        break;
      }
      c.relato = `${c.relato}\n${m.texto}`.trim();
      resposta = await turno(c, m.texto);
      break;
  }

  await salvar(c);
  if (resposta) await enviarTexto(m.de, resposta);
}

/** Grava na API a ficha que o motorista viu e confirmou. Só o código chega aqui, nunca o modelo. */
async function confirmar(c: Conversa): Promise<{ ok: boolean; texto: string }> {
  if (!c.aguardando_confirmacao || !c.ficha_pendente) return { ok: false, texto: 'Não tenho nenhuma ocorrência esperando confirmação. Me conte o que aconteceu.' };
  if (faltandoNaFicha(c.ficha_pendente).length) return { ok: false, texto: 'A ficha ainda está incompleta. Me diga o que falta e eu mando o resumo de novo.' };
  const ct = c.contato;
  if (!ct) return { ok: false, texto: 'Não consegui confirmar o seu cadastro. Tente de novo em alguns minutos.' };
  if (!ct.todas_as_rotas && !ct.rotas.some((r) => r.rota_id === c.ficha_pendente?.rota_id)) {
    return { ok: false, texto: `Essa rota não está entre as suas (${ct.rotas.map((r) => r.rota).join('; ')}). Me diga em qual delas foi.` };
  }
  // Quem registrou vai no campo próprio (reportado_por), não no texto do relato: o relato fica sem telefone nem nome.
  // com_foto: a API só guarda que havia foto, não a imagem; o canal e o remetente a API grava a partir do contato.
  const ficha = { ...c.ficha_pendente, relato: c.ficha_pendente.relato ?? c.relato, com_foto: !!c.foto_media_id };
  try {
    const oc = await api.registrar(ficha, ct.id);
    await registrarTrilha(c.telefone, oc.id, ficha, ct.id);
    await registrarEvento(c.telefone, 'sistema', 'registro', `Ocorrência registrada: ${oc.id}`);
    return { ok: true, texto: `✅ Ocorrência registrada. Protocolo: *${oc.id}*.\nObrigado! Se precisar registrar outra, é só mandar mensagem.` };
  } catch (e) {
    console.error('[wa] falha ao registrar:', e);
    return { ok: false, texto: `Não consegui registrar agora (${(e as Error).message}). Tente apertar Confirmar de novo em alguns minutos.` };
  }
}

// ---------- ações do painel de atendimentos ----------

const MSG_ASSUMIU = (nome: string) => `Oi! Aqui é ${nome}, da equipe de operações. Vou continuar o seu atendimento por aqui.`;
const MSG_DEVOLVEU = 'Obrigado! Agora o assistente automático volta a te atender. Se quiser recomeçar, mande *reiniciar*.';

/** Zera a conversa (ficha, relato, histórico) e volta para o bot. Opcionalmente avisa o motorista. */
export const reiniciarConversa = (telefone: string, por: string, avisar: boolean) =>
  naFila(telefone, async () => {
    await salvar(recomecar(await carregar(telefone)));
    await registrarEvento(telefone, 'sistema', 'reinicio', `Conversa reiniciada no painel por ${por}`);
    if (avisar) await enviarTexto(telefone, SAUDACAO);
  });

/** Atendente assume: o agente para de responder até alguém devolver. */
export const assumirConversa = (telefone: string, atendente: string, avisar: boolean) =>
  naFila(telefone, async () => {
    const c = await carregar(telefone);
    c.modo = 'humano';
    c.atendente = atendente;
    await salvar(c);
    await registrarEvento(telefone, 'sistema', 'assumir', `${atendente} assumiu a conversa`);
    if (avisar) await enviarTexto(telefone, MSG_ASSUMIU(atendente), 'atendente');
  });

/** Devolve ao bot. O que foi dito com o atendente vira uma nota no histórico do agente. */
export const devolverConversa = (telefone: string, por: string, avisar: boolean, transcricaoHumana: string) =>
  naFila(telefone, async () => {
    const c = await carregar(telefone);
    if (c.modo !== 'humano') return;
    c.modo = 'bot';
    c.atendente = null;
    c.aguardando_confirmacao = false;
    if (transcricaoHumana && c.historico.length) {
      c.historico.push({
        role: 'user',
        content: `[Nota do sistema, não é o motorista: um atendente humano conversou com ele enquanto você estava pausado. Transcrição:\n${transcricaoHumana}\nContinue a partir daqui; se ele trouxe dados novos, chame analisar_relato.]`,
      });
    }
    await salvar(c);
    await registrarEvento(telefone, 'sistema', 'devolver', `Conversa devolvida ao bot por ${por}`);
    if (avisar) await enviarTexto(telefone, MSG_DEVOLVEU, 'atendente');
  });

/** Mensagem escrita pelo atendente no painel. Só com a conversa assumida. */
export const enviarComoAtendente = (telefone: string, texto: string) =>
  naFila(telefone, async () => {
    const c = await carregar(telefone);
    if (c.modo !== 'humano') throw new Error('Assuma a conversa antes de escrever.');
    await enviarTexto(telefone, texto, 'atendente');
    await salvar(c); // atualiza atualizado_em
  });
