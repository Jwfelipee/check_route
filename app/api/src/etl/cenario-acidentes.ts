/**
 * Cenário da demo: acidentes de estrada plantados na rota T02 (CD Cajamar → Hub Belo Horizonte),
 * pela BR-381 (Fernão Dias), entre junho e novembro de 2026.
 *
 * Por que existe: a planilha bronze não tem nenhum tipo de acidente na transferência, e a tese
 * do pitch é que 62% das perdas vêm de acidente. O cenário entra na camada bronze, como se o SAC,
 * o financeiro e o TMS tivessem registrado os casos, e o gold sai pelo mesmo ETL de sempre.
 *
 * O padrão plantado (o que a análise tem de "descobrir"):
 *  - concentrado na Serra/Fernão Dias, BR-381 km 480–560, em saídas noturnas (22h–5h);
 *  - carga de eletrodomésticos na maioria (air fryer, micro-ondas, aspirador); pista molhada ou neblina;
 *  - cresce mês a mês: a rota sai de saudável em junho para crítica em outubro/novembro;
 *  - a viagem acidentada chega atrasada ao hub (o atraso entra em "chegada no prazo").
 *
 * Determinístico (semente fixa): rodar de novo gera exatamente os mesmos registros.
 * Tudo plantado é rastreável: protocolos SACDEMO…, lançamentos LC-DEMO…, eventos EV-DEMO….
 */
import { inserirEmLote, sql, transacao } from '../db.js';

export const ROTA_CENARIO = 'T02';
export const PREFIXO = 'SACDEMO';

/** Acidentes por mês (calibrado para a T02 cair para crítica em out/nov). */
const POR_MES: Record<string, number> = {
  '2026-06': 2, '2026-07': 3, '2026-08': 4, '2026-09': 6, '2026-10': 9, '2026-11': 11,
};

const TIPOS = [
  { codigo: 'TRF-COLIS', legado: 'T05', descricao: 'Colisão', peso: 35, custo: [9000, 32000] },
  { codigo: 'TRF-TOMB', legado: 'T06', descricao: 'Tombamento', peso: 25, custo: [28000, 68000] },
  { codigo: 'TRF-SAIDA', legado: 'T07', descricao: 'Saída de pista', peso: 20, custo: [14000, 41000] },
  { codigo: 'TRF-FREN', legado: 'T08', descricao: 'Avaria por frenagem', peso: 20, custo: [3500, 12000] },
] as const;

const TRECHOS = [
  'BR-381 km 487, descida da Serra de Igarapé', 'BR-381 km 498, curva perto de Mateus Leme',
  'BR-381 km 512, perto de Itaguara', 'BR-381 km 529, Serra da Fernão Dias', 'BR-381 km 546, chegada em Betim',
  'BR-381 km 553, pista simples perto de Betim',
];
const CLIMA = ['pista molhada', 'neblina forte', 'chuva fina', 'pista molhada', 'noite sem iluminação', 'tempo seco'];
const CARGAS = [
  { sku: 'ELD-011', nome: 'air fryers' }, { sku: 'ELD-012', nome: 'air fryers' }, { sku: 'ELD-021', nome: 'micro-ondas' },
  { sku: 'ELD-022', nome: 'micro-ondas' }, { sku: 'ELD-041', nome: 'aspiradores' }, { sku: 'ELT-041', nome: 'smart TVs' },
];

/** PRNG determinístico (mulberry32). */
function aleatorio(semente: number) {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const dois = (n: number) => String(n).padStart(2, '0');
/** Data/hora local (-03:00) a partir de ms: "dd/mm/aaaa hh:mm" (formato do SAC e do FIN). */
const br = (ms: number) => {
  const d = new Date(ms - 3 * 3600_000);
  return `${dois(d.getUTCDate())}/${dois(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${dois(d.getUTCHours())}:${dois(d.getUTCMinutes())}`;
};
/** ISO com fuso -03:00 (formato do TMS). */
const isoBr = (ms: number) => {
  const d = new Date(ms - 3 * 3600_000);
  return `${d.toISOString().slice(0, 19)}-03:00`;
};
const isoUtc = (ms: number) => new Date(ms).toISOString().replace('.000Z', 'Z');

const relatoDe = (tipo: string, trecho: string, hora: string, clima: string, carga: string, volumes: number) => {
  const base: Record<string, string> = {
    Colisão: `Bati na traseira de um caminhão que freou de repente na ${trecho}, ${hora}, ${clima}. Carreta com ${carga}, ${volumes} volumes avariados. Ninguém se feriu.`,
    Tombamento: `Carreta tombou na curva da ${trecho} por volta de ${hora}, ${clima}. Carga de ${carga} espalhada, ${volumes} volumes perdidos. Motorista bem, guincho a caminho.`,
    'Saída de pista': `Perdi o controle e saí da pista na ${trecho}, ${hora}, ${clima}. Caminhão no acostamento, ${volumes} caixas de ${carga} amassadas.`,
    'Avaria por frenagem': `Freada brusca na ${trecho} às ${hora} (${clima}), carga de ${carga} deslocou no baú e ${volumes} volumes chegaram amassados.`,
  };
  return base[tipo];
};

export async function plantarCenarioAcidentes() {
  const r = aleatorio(381);
  const sorteia = <T>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)];
  const entre = (a: number, b: number) => a + r() * (b - a);
  const tipoSorteado = () => {
    let x = r() * 100;
    for (const t of TIPOS) if ((x -= t.peso) < 0) return t;
    return TIPOS[0];
  };

  const viagens = await sql<{ viagem_id: string; saida_cd: string; previsao_chegada_hub: string }>(
    `SELECT viagem_id, saida_cd, previsao_chegada_hub FROM bronze_tms_viagens WHERE rota_id = $1 ORDER BY viagem_id`,
    [ROTA_CENARIO],
  );

  const ocorrencias: unknown[][] = [];
  const lancamentos: unknown[][] = [];
  const eventos: unknown[][] = [];
  const atrasos: { viagem_id: string; chegada: string }[] = [];
  const LOTE = ['CENARIO', '2026-11-28T05:00:00Z', 'cenario-demo-t02'];

  for (const [mes, n] of Object.entries(POR_MES)) {
    // Prefere saídas noturnas (o padrão a ser descoberto); completa com as demais se faltar.
    const doMes = viagens.filter((v) => v.saida_cd.startsWith(mes));
    const hora = (v: { saida_cd: string }) => Number(v.saida_cd.slice(11, 13));
    const noturnas = doMes.filter((v) => hora(v) >= 20 || hora(v) <= 3);
    const escolhidas = [...noturnas, ...doMes.filter((v) => !noturnas.includes(v))].slice(0, n);

    escolhidas.forEach((v, i) => {
      const tipo = tipoSorteado();
      const saida = Date.parse(v.saida_cd);
      const quando = saida + entre(2, 6) * 3600_000; // na serra, algumas horas depois de sair do CD
      const trecho = sorteia(TRECHOS);
      const clima = sorteia(CLIMA);
      const carga = r() < 0.8 ? sorteia(CARGAS.slice(0, 5)) : CARGAS[5];
      const volumes = Math.round(entre(6, 48));
      const custo = Math.round(entre(tipo.custo[0], tipo.custo[1]) * 100) / 100;
      const protocolo = `${PREFIXO}${mes.replace('-', '')}${dois(i + 1)}`;
      const aberta = quando + entre(0.3, 1.5) * 3600_000;
      const horaTxt = br(quando).slice(11);
      const resolvida = mes < '2026-11'; // os de novembro ainda aguardam a seguradora

      ocorrencias.push([
        protocolo, br(aberta), 'WHATSAPP_MOTORISTA', tipo.codigo, 'VIAGEM', v.viagem_id, carga.sku, String(volumes),
        relatoDe(tipo.descricao, trecho, horaTxt, clima, carga.nome, volumes), `atendente_${dois(1 + Math.floor(r() * 25))}`,
        `${protocolo}_0.jpg`, 'SAC', ...LOTE.slice(1),
      ]);
      const franquia = Math.round(Math.min(custo * 0.15, 6000) * 100) / 100;
      const brl = (x: number) => x.toFixed(2).replace('.', ',');
      lancamentos.push(
        [`LC-DEMO-${protocolo}-1`, protocolo, 'INDENIZACAO', brl(custo - franquia), resolvida ? 'EFETIVADO' : 'PROVISIONADO', br(aberta + 86_400_000), 'LOG-TRF', 'FIN', ...LOTE.slice(1)],
        [`LC-DEMO-${protocolo}-2`, protocolo, 'SEGURO_FRANQUIA', brl(franquia), 'EFETIVADO', br(aberta + 2 * 86_400_000), 'LOG-TRF', 'FIN', ...LOTE.slice(1)],
      );
      const ev = (k: number, status: string, ms: number, acao: string | null, usuario: string) =>
        eventos.push([`EV-DEMO-${protocolo}-${k}`, protocolo, status, isoUtc(ms), acao, usuario, 'SAC', ...LOTE.slice(1)]);
      ev(1, 'ABERTA', aberta, null, 'sistema');
      ev(2, 'EM_TRATATIVA', aberta + 3 * 3600_000, 'Acionar seguro', 'atendente_07');
      ev(3, 'AGUARDANDO_SEGURADORA', aberta + 2 * 86_400_000, null, 'atendente_07');
      if (resolvida) ev(4, 'RESOLVIDA', aberta + entre(9, 24) * 86_400_000, null, 'atendente_12');

      // A viagem acidentada chega ao hub com atraso (guincho, transbordo).
      atrasos.push({ viagem_id: v.viagem_id, chegada: isoBr(Date.parse(v.previsao_chegada_hub) + entre(5, 18) * 3600_000) });
    });
  }

  await transacao(async (c) => {
    // Idempotente: limpa um cenário anterior (útil no `etl -- --gold`).
    await c.query(`DELETE FROM bronze_sac_ocorrencias WHERE protocolo LIKE '${PREFIXO}%'`);
    await c.query(`DELETE FROM bronze_fin_lancamentos_ocorrencia WHERE protocolo_sac LIKE '${PREFIXO}%'`);
    await c.query(`DELETE FROM bronze_sac_ocorrencia_eventos WHERE protocolo LIKE '${PREFIXO}%'`);
    await c.query(`DELETE FROM bronze_sac_tipos_ocorrencia WHERE codigo = ANY($1)`, [TIPOS.map((t) => t.codigo)]);

    await inserirEmLote(
      c,
      'bronze_sac_tipos_ocorrencia',
      ['codigo', 'codigo_legado', 'descricao', 'tipo_perna', 'natureza_custo_padrao', '_source_system', '_ingested_at', '_batch_id'],
      TIPOS.map((t) => [t.codigo, t.legado, t.descricao, 'TRF', 'INDENIZACAO', ...LOTE]),
    );
    const colunasSac = ['protocolo', 'aberta_em', 'canal', 'codigo_tipo', 'ref_tipo', 'ref_id', 'sku_afetado', 'qtd_afetada',
      'relato', 'registrado_por', 'anexos', '_source_system', '_ingested_at', '_batch_id'];
    await inserirEmLote(c, 'bronze_sac_ocorrencias', colunasSac, ocorrencias);
    await inserirEmLote(c, 'bronze_fin_lancamentos_ocorrencia',
      ['lancamento_id', 'protocolo_sac', 'natureza', 'valor', 'situacao', 'dt_lancamento', 'centro_custo', '_source_system', '_ingested_at', '_batch_id'],
      lancamentos);
    await inserirEmLote(c, 'bronze_sac_ocorrencia_eventos',
      ['evento_id', 'protocolo', 'status_novo', 'evento_em', 'acao', 'usuario', '_source_system', '_ingested_at', '_batch_id'],
      eventos);
    for (const a of atrasos) {
      await c.query('UPDATE bronze_tms_viagens SET chegada_hub = $2 WHERE viagem_id = $1', [a.viagem_id, a.chegada]);
    }
    await c.query('CREATE TABLE IF NOT EXISTS bronze_meta (chave TEXT PRIMARY KEY, valor TEXT)');
    await c.query(
      `INSERT INTO bronze_meta VALUES ('cenario', $1) ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor`,
      [JSON.stringify({ rota: ROTA_CENARIO, acidentes: ocorrencias.length, viagens_atrasadas: atrasos.map((a) => a.viagem_id) })],
    );
  });

  console.log(`Cenário: ${ocorrencias.length} acidentes plantados na ${ROTA_CENARIO} (BR-381), ${atrasos.length} viagens com chegada atrasada`);
  return { acidentes: ocorrencias.length, viagens: atrasos.map((a) => a.viagem_id) };
}
