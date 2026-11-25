/** Limpeza dos formatos que a bronze mistura. */

/** "1.235,01" → 1235.01 · "0.25" → 0.25 · vazio → null */
export function numero(s: string | null | undefined): number | null {
  if (s === null || s === undefined || s.trim() === '') return null;
  const t = s.trim();
  const br = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t;
  const n = Number(br);
  return Number.isFinite(n) ? n : null;
}

/** Só dígitos (CNPJ com ou sem máscara). */
export const digitos = (s: string) => s.replace(/\D/g, '');

/** Instante em ms. Aceita ISO com fuso (-03:00 ou Z) e "dd/mm/aaaa hh:mm" (hora local, -03:00). */
export function instante(s: string): number {
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?$/);
  if (br) return Date.parse(`${br[3]}-${br[2]}-${br[1]}T${br[4] ?? '00'}:${br[5] ?? '00'}:00-03:00`);
  return Date.parse(s);
}

/** Data local (America/Sao_Paulo, UTC-3 fixo) no formato AAAA-MM-DD. */
export function dataLocal(s: string): string {
  return new Date(instante(s) - 3 * 3600_000).toISOString().slice(0, 10);
}

/** "30/06/2026" ou "2026-06-30" → "2026-06-30" */
export function dataSimples(s: string): string {
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  return br ? `${br[3]}-${br[2]}-${br[1]}` : s.slice(0, 10);
}

export const horasEntre = (inicio: string, fim: string) => (instante(fim) - instante(inicio)) / 3600_000;

export const arred = (n: number, casas: number) => Math.round(n * 10 ** casas) / 10 ** casas;

export const media = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** Código do SAC: tira espaço, põe em maiúscula. O de-para do legado fica em build-gold. */
export const codigo = (s: string) => s.trim().toUpperCase();

export const PERNA: Record<string, 'coleta' | 'transferencia' | 'entrega'> = {
  COL: 'coleta',
  TRF: 'transferencia',
  ENT: 'entrega',
};

export const REGIAO_DA_UF: Record<string, 'N' | 'NE' | 'CO' | 'SE' | 'S'> = {
  AC: 'N', AP: 'N', AM: 'N', PA: 'N', RO: 'N', RR: 'N', TO: 'N',
  AL: 'NE', BA: 'NE', CE: 'NE', MA: 'NE', PB: 'NE', PE: 'NE', PI: 'NE', RN: 'NE', SE: 'NE',
  DF: 'CO', GO: 'CO', MT: 'CO', MS: 'CO',
  ES: 'SE', MG: 'SE', RJ: 'SE', SP: 'SE',
  PR: 'S', RS: 'S', SC: 'S',
};
