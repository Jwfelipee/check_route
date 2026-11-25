/**
 * Agente sem IA (sem ANTHROPIC_API_KEY ou AI_PROVIDER=fake): regras fixas, mesmo fluxo.
 * Junta tudo o que o motorista escreveu, manda para a extração da API e pergunta o que falta
 * ou envia a confirmação. Serve para a demo não travar e para os testes.
 */
import { executar, type Contexto } from './ferramentas.js';
import { SAUDACAO } from './ficha.js';

export async function turnoSimulado(ctx: Contexto, _entrada: string): Promise<string | null> {
  const c = ctx.conversa;
  if (c.relato.trim().length < 5) {
    return SAUDACAO;
  }
  const analise = JSON.parse((await executar('analisar_relato', { relato: c.relato }, ctx)).texto) as { completa: boolean; pergunta_sugerida: string | null };
  if (!analise.completa) return analise.pergunta_sugerida;
  await executar('pedir_confirmacao', {}, ctx);
  return null;
}
