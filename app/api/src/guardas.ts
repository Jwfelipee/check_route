/**
 * Guardas contra prompt injection (critério "Resiste a ataques?").
 *
 * 1. Entrada: o relato é sempre dado. Os sinais de < e > viram ‹ › para que nenhum
 *    texto feche a tag <relato> e vire instrução; frases que tentam mandar na IA são
 *    detectadas e sinalizadas para quem revisa (o relato não é descartado: pode ser
 *    um motorista legítimo escrevendo de um jeito estranho).
 * 2. Saída: o que o modelo devolve passa pelo schema e por regras do código (rota
 *    existente, tipo e produto do enum, custo plausível, prática do guia). Uma
 *    instrução escondida no relato não consegue aprovar, apagar nem gravar nada:
 *    a extração não grava, e a gravação só acontece com confirmação humana.
 */

/** Teto de custo de uma ocorrência acima do qual o valor fica "a revisar". */
export const CUSTO_MAXIMO_PLAUSIVEL = 2_000_000;

const PADROES: [RegExp, string][] = [
  [/ignor[ae]\w*\s+(?:as\s+|todas\s+as\s+|suas\s+)?(?:instru|regras|orienta|ordens)/i, 'pede para ignorar as instruções'],
  [/ignore\s+(?:all\s+|the\s+)?(?:previous|above|prior)/i, 'pede para ignorar as instruções'],
  [/esque[çc]a\s+(?:tudo|as\s+instru)/i, 'pede para esquecer as instruções'],
  [/voc[êe]\s+(?:agora\s+)?(?:é|e|ser[áa])\s+(?:um|uma|o|a)\b/i, 'tenta mudar o papel da IA'],
  [/(?:system|sistema)\s*prompt|prompt\s+do\s+sistema/i, 'menciona o prompt do sistema'],
  [/<\/?\s*(?:relato|system|instru)/i, 'tenta fechar ou abrir tags'],
  [/\b(?:aprov[ea]|valid[ea])\w*\s+(?:a\s+|essa\s+|esta\s+)?a[çc][ãa]o/i, 'manda aprovar uma ação'],
  [/\b(?:apag|delet|exclu|remov)\w*\s+(?:(?:a|as|o|os|todas?|todos?)\s+){0,2}(?:ocorr|registr|a[çc][õo]es|dados|banco)/i, 'manda apagar registros'],
  [/(?:registr|preench|coloqu|ponh)\w*\s+(?:o\s+)?(?:custo|preju[íi]zo|valor)\s+(?:como\s+|de\s+|igual\s+a\s+)?(?:zero|0\b)/i, 'manda zerar o custo'],
  [/\b(?:responda|retorne|devolva)\s+(?:apenas|somente|s[óo])\b/i, 'tenta ditar a resposta'],
];

export interface Guarda {
  instrucao_suspeita: boolean;
  motivos: string[];
}

export function detectarInstrucao(texto: string): Guarda {
  const motivos = [...new Set(PADROES.filter(([re]) => re.test(texto)).map(([, m]) => m))];
  return { instrucao_suspeita: motivos.length > 0, motivos };
}

/** O relato nunca fecha a tag que o delimita: < e > viram aspas angulares tipográficas. */
export const neutralizarDelimitadores = (texto: string) => texto.replace(/</g, '‹').replace(/>/g, '›');

/** Avisos sobre a ficha extraída que a pessoa precisa revisar antes de confirmar. */
export function revisarSaida(ficha: { custo_estimado: number | null }): string[] {
  const avisos: string[] = [];
  if (ficha.custo_estimado != null && ficha.custo_estimado > CUSTO_MAXIMO_PLAUSIVEL) avisos.push('custo_estimado');
  if (ficha.custo_estimado != null && ficha.custo_estimado < 0) avisos.push('custo_estimado');
  return avisos;
}
