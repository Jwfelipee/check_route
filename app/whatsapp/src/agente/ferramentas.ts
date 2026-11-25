/**
 * Ferramentas do agente. O modelo decide QUANDO chamar; o código decide O QUE vale:
 *  - analisar_relato: manda o relato (e a última foto) para POST /ocorrencias/extrair da API;
 *  - pedir_confirmacao: o código confere se a ficha está completa e envia o resumo com botões;
 *  - listar_hubs: lista os hubs de destino para ajudar o motorista a dizer a rota.
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
    name: 'listar_hubs',
    description: 'Lista os hubs de destino das rotas de transferência (CD Cajamar → hub), para identificar a rota.',
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
      c.ficha_pendente = { ...ficha, relato };
      c.faltando = faltandoNaFicha(c.ficha_pendente);
      c.aguardando_confirmacao = false;
      return {
        texto: JSON.stringify({
          completa: c.faltando.length === 0,
          faltando: c.faltando,
          pergunta_sugerida: c.faltando.length ? (r.pergunta ?? perguntaPadrao(c.faltando)) : null,
          ficha,
        }),
      };
    }
    case 'pedir_confirmacao': {
      const faltando = faltandoNaFicha(c.ficha_pendente);
      if (!c.ficha_pendente || faltando.length) {
        return { texto: JSON.stringify({ enviado: false, faltando, pergunta_sugerida: perguntaPadrao(faltando) }), erro: true };
      }
      const hub = (await api.hubs().catch(() => [])).find((h) => h.rota_id === c.ficha_pendente!.rota_id);
      await enviarBotoes(c.telefone, resumoParaConfirmar(c.ficha_pendente, hub?.rota), [
        { id: BOTAO_CONFIRMAR, titulo: 'Confirmar' },
        { id: BOTAO_CORRIGIR, titulo: 'Corrigir' },
      ]);
      c.aguardando_confirmacao = true;
      return { texto: JSON.stringify({ enviado: true }), encerraTurno: true };
    }
    case 'listar_hubs': {
      const hubs = await api.hubs();
      return { texto: hubs.map((h) => `${h.rota_id}: ${h.rota}`).join('\n') };
    }
    default:
      return { texto: `Ferramenta desconhecida: ${nome}`, erro: true };
  }
}
