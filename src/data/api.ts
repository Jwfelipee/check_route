/**
 * Camada de dados. Hoje lê os JSON fictícios de public/data; com VITE_API_URL
 * definido, lê os mesmos recursos da API (contrato em docs/DADOS.md).
 * Tudo passa pelo zod: se a API mudar o formato, a tela avisa em vez de mostrar número errado.
 */
import { z } from 'zod';
import {
  OcorrenciaSchema, OperacaoMesSchema, PraticaSchema, PremissaSchema, ReferenciaSchema, RotaSchema,
  type Fontes,
} from '@/lib/types';

const BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || '';
const url = (recurso: string) => (BASE ? `${BASE}/${recurso}` : `/data/${recurso}.json`);

async function busca<T>(recurso: string, schema: z.ZodType<T>): Promise<T> {
  const r = await fetch(url(recurso));
  if (!r.ok) throw new Error(`Falha ao carregar ${recurso}: HTTP ${r.status}`);
  return schema.parse(await r.json());
}

export async function carregaFontes(): Promise<Fontes> {
  const [rotas, operacao_mes, ocorrencias, premissas, praticas, referencia] = await Promise.all([
    busca('rotas', z.array(RotaSchema)),
    busca('operacao_mes', z.array(OperacaoMesSchema)),
    busca('ocorrencias', z.array(OcorrenciaSchema)),
    busca('premissas', z.array(PremissaSchema)),
    busca('praticas', z.array(PraticaSchema)),
    busca('referencia', z.array(ReferenciaSchema)),
  ]);
  return { rotas, operacao_mes, ocorrencias, premissas, praticas, referencia: referencia[0] };
}

/** Geometria dos mapas (regiões do Brasil e zonas de cada cidade), em SVG path num viewBox 400x400. */
export interface Mapa {
  w: number; h: number;
  regioes: Record<string, { d: string; [k: string]: unknown }>;
  cidades: Record<string, { zonas: Record<string, { d: string; [k: string]: unknown }> }>;
}
export async function carregaMapa(): Promise<Mapa> {
  const r = await fetch('/data/mapa.json');
  if (!r.ok) throw new Error('Falha ao carregar o mapa');
  return r.json();
}
