/**
 * Ferramentas do agente. O modelo decide QUANDO chamar; o código decide O QUE vale:
 *  - analisar_relato: manda o relato (e a última foto) para POST /ocorrencias/extrair da API;
 *  - pedir_confirmacao: o código confere se a ficha está completa e envia o resumo com botões;
 *  - minhas_rotas: as rotas do contato que está conversando (nunca as de outras pessoas).
 * O escopo é regra de código: a rota da ficha precisa estar entre as do contato.
 * Não existe ferramenta de "registrar": a ocorrência só entra na API quando o motorista
 * aperta "Confirmar" (tratado em agente/index.ts, sem passar pelo modelo).
 */
import type Anthropic from '@anthropic-ai/sdk';
import { api } from '../api.js';
import { baixarMidia, enviarBotoes } from '../meta/client.js';
import type { Conversa } from '../estado.js';
import { faltandoNaFicha, perguntaPadrao, resumoParaConfirmar } from './ficha.js';

export const BOTAO_CONFIRMAR = 'confirmar_ocorrencia';
export const BOTAO_CORRIGIR = 'corrigir_ocorrencia';

const IMAGENS_ACEITAS = new Set(['image/jpeg', 'image/png', 'image/webp']);

export const FERRAMENTAS: Anthropic.Beta.BetaTool[] = [
  {
    name: 'analisar_relato',
    description:
      'Transforma o relato do motorista em uma ficha de ocorrência, usando a IA de extração da API do painel. ' +
      'Chame sempre que o motorista trouxer informação nova sobre a ocorrência. Passe o relato completo e consolidado ' +
      '(tudo o que ele já disse nesta conversa, não só a última mensagem). A última foto enviada vai junto automaticamente. ' +
      'Devolve a ficha, os campos que faltam e uma pergunta sugerida.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: { relato: { type: 'string', description: 'Relato consolidado, em português, com todos os fatos já informados' } },
      required: ['relato'],
      additionalProperties: false,
    },
  },
  {
    name: 'pedir_confirmacao',
    description:
      'Envia ao motorista o resumo da ficha atual com os botões Confirmar e Corrigir. Só funciona quando a ficha está completa; ' +
      'se faltar algo, devolve o que falta. Depois de chamar com sucesso, não escreva mais nada neste turno.',
    strict: true,
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
  },
  {
    name: 'minhas_rotas',
    description: 'Lista as rotas de transferência desta pessoa (CD Cajamar → hub), as únicas em que ela pode registrar ocorrência.',
    strict: true,
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
  },
];

export interface Contexto { conversa: Conversa }

export async function executar(nome: string, entrada: unknown, ctx: Contexto): Promise<{ texto: string; erro?: boolean; encerraTurno?: boolean }> {
  const c = ctx.conversa;
  switch (nome) {
    case 'analisar_relato': {
      const relato = String((entrada as { relato?: unknown })?.relato ?? '').trim();
      if (relato.length < 5) return { texto: 'Relato vazio ou curto demais.', erro: true };
      let imagem: { base64: string; mime: string } | undefined;
      if (c.foto_media_id) {
        try {
          const m = await baixarMidia(c.foto_media_id);
          if (IMAGENS_ACEITAS.has(m.mime)) imagem = m;
        } catch { /* sem foto: segue só com o texto */ }
      }
      const r = await api.extrair(relato, imagem);
      const { pergunta_ao_motorista: _p, ...ficha } = r.ficha;

      // Escopo: a rota da ficha tem de ser de quem está falando. Só uma rota? É ela quando o relato não diz o hub.
      const ct = c.contato;
      let rotaFora = false;
      let rotaAssumida = false;
      if (ct && !ct.todas_as_rotas) {
        const minhas = ct.rotas.map((x) => x.rota_id);
        if (ficha.rota_id && !minhas.includes(String(ficha.rota_id))) { rotaFora = true; ficha.rota_id = null; }
        else if (!ficha.rota_id && minhas.length === 1) { ficha.rota_id = minhas[0]; rotaAssumida = true; }
      }
      c.ficha_pendente = { ...ficha, relato };
      c.faltando = faltandoNaFicha(c.ficha_pendente);
      c.aguardando_confirmacao = false;
      const nomesRotas = ct?.rotas.map((x) => x.rota).join('; ');
      const pergunta = rotaFora
        ? `Você só pode registrar ocorrências nas suas rotas: ${nomesRotas}. Foi em qual delas?`
        : c.faltando.length ? (r.pergunta ?? perguntaPadrao(c.faltando)) : null;
      return {
        texto: JSON.stringify({
          completa: c.faltando.length === 0,
          faltando: c.faltando,
          pergunta_sugerida: pergunta,
          ...(rotaFora ? { aviso: 'A rota citada não está entre as rotas desta pessoa; não foi usada.' } : {}),
          ...(rotaAssumida ? { aviso: 'A rota não foi citada; foi usada a única rota desta pessoa.' } : {}),
          ficha,
        }),
      };
    }
    case 'pedir_confirmacao': {
      const faltando = faltandoNaFicha(c.ficha_pendente);
      if (!c.ficha_pendente || faltando.length) {
        return { texto: JSON.stringify({ enviado: false, faltando, pergunta_sugerida: perguntaPadrao(faltando) }), erro: true };
      }
      const hub = c.contato?.rotas.find((h) => h.rota_id === c.ficha_pendente!.rota_id);
      await enviarBotoes(c.telefone, resumoParaConfirmar(c.ficha_pendente, hub?.rota), [
        { id: BOTAO_CONFIRMAR, titulo: 'Confirmar' },
        { id: BOTAO_CORRIGIR, titulo: 'Corrigir' },
      ]);
      c.aguardando_confirmacao = true;
      return { texto: JSON.stringify({ enviado: true }), encerraTurno: true };
    }
    case 'minhas_rotas': {
      const rotas = c.contato?.rotas ?? [];
      return { texto: rotas.length ? rotas.map((h) => `${h.rota_id}: ${h.rota}`).join('\n') : 'Nenhuma rota cadastrada para esta pessoa.' };
    }
    default:
      return { texto: `Ferramenta desconhecida: ${nome}`, erro: true };
  }
}
