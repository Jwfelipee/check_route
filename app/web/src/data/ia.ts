/**
 * Funções da API que usam IA: extrair a ficha do relato, registrar a ocorrência
 * confirmada, listar as recentes e sugerir a ação de uma rota (tool use).
 * Só existem com VITE_API_URL: sem API, as telas explicam e não quebram.
 */
import type { Ocorrencia } from '@/lib/types';

export const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || '';
export const temApi = Boolean(API_BASE);

async function chamar<T>(metodo: 'GET' | 'POST', caminho: string, corpo?: unknown): Promise<T> {
  if (!API_BASE) throw new Error('Configure VITE_API_URL para usar esta função.');
  const r = await fetch(`${API_BASE}${caminho}`, {
    method: metodo,
    headers: corpo ? { 'content-type': 'application/json' } : undefined,
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((json as { erro?: string }).erro ?? `HTTP ${r.status}`);
  return json as T;
}

export const TIPOS_TRANSFERENCIA = [
  'Colisão', 'Tombamento', 'Saída de pista', 'Avaria por frenagem', 'Avaria no manuseio', 'Erro de triagem', 'Extravio', 'Roubo de carga',
] as const;
export const PRODUTOS = ['Eletrônicos', 'Eletrodomésticos', 'Moda', 'Saúde e beleza', 'Casa'] as const;
export const GRAVIDADES = ['leve', 'moderada', 'grave'] as const;

export interface Ficha {
  tipo: (typeof TIPOS_TRANSFERENCIA)[number] | null;
  rota_id: string | null;
  data_hora: string | null;
  trecho: string | null;
  placa: string | null;
  tipo_veiculo: string | null;
  produto: (typeof PRODUTOS)[number] | null;
  embalagem: string | null;
  condicao_via_clima: string | null;
  gravidade: (typeof GRAVIDADES)[number] | null;
  volumes_afetados: number | null;
  custo_estimado: number | null;
  houve_vitima: boolean | null;
  resumo: string;
  pergunta_ao_motorista: string | null;
}

export interface MetaIa {
  modo: 'claude' | 'simulado';
  modelo: string;
  ms: number;
  input_tokens: number;
  output_tokens: number;
  custo_usd: number;
  aviso?: string;
  processado_em?: string;
}

export interface Guardas {
  instrucao_suspeita: boolean;
  motivos: string[];
}

export interface RespostaExtracao {
  ok: boolean;
  ficha: Ficha;
  faltando: string[];
  pergunta: string | null;
  revisar: string[];
  relato_mascarado: string;
  privacidade: { mascarados: string[] };
  guardas: Guardas;
  meta: MetaIa;
}

export interface ChamadaFerramenta {
  nome: string;
  entrada: Record<string, unknown>;
}

export interface Sugestao {
  pratica_id: string;
  acao: string;
  justificativa: string;
  numeros_usados: string[];
  ferramentas_chamadas: ChamadaFerramenta[];
  pratica: { id: string; titulo: string; prazo_dias: number; esforco: string };
  numeros_fora: string[];
  meta: MetaIa;
}

export const iaApi = {
  extrair: (relato: string, imagem?: { base64: string; tipo: string }) =>
    chamar<RespostaExtracao>('POST', '/ocorrencias/extrair', {
      relato,
      ...(imagem ? { imagemBase64: imagem.base64, imagemTipo: imagem.tipo } : {}),
    }),
  registrar: (ficha: Record<string, unknown>) => chamar<Ocorrencia>('POST', '/ocorrencias', ficha),
  recentes: () => chamar<Ocorrencia[]>('GET', '/ocorrencias/recentes?limite=50'),
  sugerir: (corpo: { rota_id: string; numeros: Record<string, number | string | null>; foco?: string | null; tipo_mais_caro?: string | null }) =>
    chamar<Sugestao>('POST', '/acoes/sugerir', corpo),
};

/** Nome legível da ferramenta que a IA chamou (para a tela). */
export const NOME_FERRAMENTA: Record<string, string> = {
  consultar_rota: 'dados da rota',
  ocorrencias_da_rota: 'ocorrências do mês',
  listar_praticas: 'guia de boas práticas',
  propor_acao: 'registro da sugestão',
};

export const NOME_DADO_PESSOAL: Record<string, string> = {
  telefone: 'telefone', cpf: 'CPF', email: 'e-mail', motorista: 'nome do motorista', placa: 'placa',
};
