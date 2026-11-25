/**
 * Escopo da conexão com o MCP: token assinado (HMAC-SHA256) que diz quem está falando e por quais rotas.
 * Mesmo formato de app/mcp/src/escopo.ts (a API emite, o MCP confere). Formato: base64url(JSON).base64url(assinatura)
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export type Papel = 'motorista' | 'transportadora' | 'gestor' | 'painel';

export interface Escopo {
  /** Id do contato (CT-0001) ou "painel". */
  sub: string;
  papel: Papel;
  /** "*" = todas as rotas (painel e gestor). */
  rotas: string[] | '*';
  /** Expira em (epoch segundos). */
  exp: number;
}

const b64 = (b: Buffer | string) => Buffer.from(b).toString('base64url');
const assinar = (corpo: string, segredo: string) => createHmac('sha256', segredo).update(corpo).digest();

export function emitirToken(e: Omit<Escopo, 'exp'>, segredo: string, validadeSeg = 900, agora = Date.now()): string {
  const corpo = b64(JSON.stringify({ ...e, exp: Math.floor(agora / 1000) + validadeSeg }));
  return `${corpo}.${b64(assinar(corpo, segredo))}`;
}

/** Devolve o escopo ou null (ausente, adulterado, expirado ou malformado). */
export function lerToken(token: string | undefined, segredo: string, agora = Date.now()): Escopo | null {
  if (!token || !segredo) return null;
  const [corpo, sig, resto] = token.split('.');
  if (!corpo || !sig || resto !== undefined) return null;
  const esperado = assinar(corpo, segredo);
  const recebido = Buffer.from(sig, 'base64url');
  if (recebido.length !== esperado.length || !timingSafeEqual(recebido, esperado)) return null;
  try {
    const e = JSON.parse(Buffer.from(corpo, 'base64url').toString('utf8')) as Escopo;
    if (!['motorista', 'transportadora', 'gestor', 'painel'].includes(e.papel)) return null;
    if (e.rotas !== '*' && !Array.isArray(e.rotas)) return null;
    if (typeof e.exp !== 'number' || e.exp * 1000 < agora) return null;
    return e;
  } catch {
    return null;
  }
}

export const veTudo = (e: Escopo) => e.papel === 'painel' || e.papel === 'gestor';

export function noEscopo(e: Escopo, rotaId: string): boolean {
  return e.rotas === '*' || e.rotas.includes(rotaId);
}
