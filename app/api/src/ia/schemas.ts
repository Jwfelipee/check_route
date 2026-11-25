/**
 * Contratos da IA. Tudo que o modelo devolve passa por estes schemas
 * (critério de qualidade "saídas validadas por schema").
 */
import { z } from 'zod/v4';

/** Tipos de ocorrência da Transferência: os que já existem na base + os de acidente (Bya). */
export const TIPOS_TRANSFERENCIA = [
  'Colisão',
  'Tombamento',
  'Saída de pista',
  'Avaria por frenagem',
  'Avaria no manuseio',
  'Erro de triagem',
  'Extravio',
  'Roubo de carga',
] as const;

export const TIPOS_ACIDENTE: readonly string[] = ['Colisão', 'Tombamento', 'Saída de pista', 'Avaria por frenagem'];

export const PRODUTOS = ['Eletrônicos', 'Eletrodomésticos', 'Moda', 'Saúde e beleza', 'Casa'] as const;

/** Ficha que o modelo preenche a partir do relato. Campo que o relato não traz vem null. */
export const FichaIa = z.object({
  tipo: z.enum(TIPOS_TRANSFERENCIA).nullable().describe('Tipo da ocorrência'),
  rota_id: z.string().nullable().describe('rota_id da lista de rotas, pelo hub de destino citado'),
  data_hora: z.string().nullable().describe('Data e hora do fato no formato AAAA-MM-DDTHH:MM'),
  trecho: z.string().nullable().describe('Rodovia e km ou referência do local, ex.: "BR-116 km 512"'),
  placa: z.string().nullable(),
  tipo_veiculo: z.string().nullable().describe('Ex.: TRUCK, CARRETA, VAN'),
  produto: z.enum(PRODUTOS).nullable().describe('Categoria da carga afetada'),
  embalagem: z.string().nullable().describe('Como a carga estava acondicionada'),
  condicao_via_clima: z.string().nullable(),
  gravidade: z.enum(['leve', 'moderada', 'grave']).nullable(),
  volumes_afetados: z.number().nullable(),
  custo_estimado: z.number().nullable().describe('Prejuízo em reais, só se o relato informar valor'),
  houve_vitima: z.boolean().nullable(),
  resumo: z.string().describe('Uma frase objetiva do que aconteceu'),
  pergunta_ao_motorista: z
    .string()
    .nullable()
    .describe('Se faltar tipo, rota, data/hora ou trecho: uma pergunta curta pedindo só o que falta'),
});
export type FichaIa = z.infer<typeof FichaIa>;

/** Campos sem os quais a ocorrência não entra na base (regra do código, não do modelo). */
export const CAMPOS_OBRIGATORIOS = ['tipo', 'rota_id', 'data_hora', 'trecho'] as const;

export const PedidoExtracao = z.object({
  relato: z.string().min(5).max(8000),
  imagemBase64: z.string().optional(),
  imagemTipo: z.enum(['image/jpeg', 'image/png', 'image/webp']).optional(),
  rota_id: z.string().optional(),
});

/** Ficha revisada pela pessoa, pronta para gravar. */
export const FichaConfirmada = FichaIa.omit({ pergunta_ao_motorista: true }).extend({
  tipo: z.enum(TIPOS_TRANSFERENCIA),
  rota_id: z.string().min(1),
  data_hora: z.string().min(10),
  trecho: z.string().min(1),
  produto: z.enum(PRODUTOS),
  custo_estimado: z.number().nonnegative(),
  relato: z.string().optional(),
  /** Por onde a ocorrência chegou: app de WhatsApp ou formulário do painel (SAC). */
  canal: z.enum(['whatsapp', 'formulario']).default('formulario'),
  /** Só a indicação de que o relato veio com foto (a imagem não é guardada). */
  com_foto: z.boolean().optional(),
  /** Contato cadastrado que registrou (obrigatório pelo WhatsApp). A API confere se a rota é dele. */
  reportado_por: z.string().optional(),
});
export type FichaConfirmada = z.infer<typeof FichaConfirmada>;

// ---------- ação sugerida ----------

export const PedidoSugestao = z.object({
  rota_id: z.string().min(1),
  /** Números da rota já calculados pelo front (lib/score.ts). A IA só pode usar estes e os das ferramentas. */
  numeros: z.record(z.string(), z.union([z.number(), z.string(), z.null()])),
  foco: z.string().nullable().optional(),
  tipo_mais_caro: z.string().nullable().optional(),
  /** "Dar detalhes": o que a pessoa sabe e a IA não vê nos dados. Gera uma sugestão nova. */
  contexto: z.string().trim().max(600).optional(),
});

/** Prática do guia usada na decisão. Exatamente uma é a principal; as demais apoiam. */
export const PraticaUsada = z.object({
  id: z.string().describe('id de uma prática da lista do guia, exatamente como veio'),
  papel: z.enum(['principal', 'apoio']),
  como_usou: z.string().describe('Em uma frase: o que desta prática entrou na ação'),
});

export const SugestaoIa = z.object({
  acao: z.string().describe('A ação em uma ou duas frases, citando os números das ferramentas e o id de cada prática usada entre parênteses, ex.: (TRF-08, TRF-05)'),
  praticas: z.array(PraticaUsada).describe('De 1 a 3 práticas do guia: exatamente uma principal'),
  justificativa: z.string().describe('Por que esta ação: liga os padrões que as ferramentas mostraram (horário, trecho, tipo, veículo, atraso, histórico) à prática'),
  numeros_usados: z.array(z.string()).describe('Os números citados, como aparecem no texto'),
  considerou_contexto: z.string().nullable().describe('Se a pessoa deu detalhes: como eles mudaram a ação. Sem detalhes: null'),
});
export type SugestaoIa = z.infer<typeof SugestaoIa>;

// ---------- classificação em lote (evals) ----------

export const ClassificacaoIa = z.object({
  codigo: z.string().describe('Código do tipo de ocorrência, da lista recebida'),
  confianca: z.enum(['alta', 'media', 'baixa']),
});
export type ClassificacaoIa = z.infer<typeof ClassificacaoIa>;
