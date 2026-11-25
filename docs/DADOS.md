# Dados

## Fontes (`app/web/public/data/`)

| Arquivo | Linhas | Grão | Campos principais |
|---|---|---|---|
| `rotas.json` | 72 | rota | `rota_id`, `perna`, `rota`, `cidade`, `uf`, `zona`, `regiao`, `origem`, `destino`, `transportadora`, `km`, `frete_orcado` |
| `operacao_mes.json` | 432 | rota × mês (jun–nov/2026) | `unidades`, `no_prazo`, `primeira_tentativa`, `frete_total`, `horas_ate_cd` (coleta), `ocupacao` e `horas_crossdock` (transferência) |
| `ocorrencias.json` | 1.599 | ocorrência | `data`, `mes`, `perna`, `rota_id`, `transportadora`, `tipo`, `produto`, `custo`, `acao`, `status` (Aberta/Resolvida), `dias_resolucao` |
| `premissas.json` | 17 | premissa | por perna: `chave`, `premissa`, `descricao`, `peso`, `nota_zero`, `nota_cem`, `formato`; parâmetros `faixa_saudavel` (85) e `faixa_atencao` (65) |
| `praticas.json` | 20 | boa prática | `id`, `perna`, `gatilho` (chaves/tipos separados por `|`), `titulo`, `quando_usar`, `acao` (modelo com `{placeholders}`), `como_fazer`, `melhora`, `esforco`, `prazo_dias`, `origem` |
| `referencia.json` | 1 | — | `data` (posição), `mes`, `mes_anterior` |
| `mapa.json` | — | — | paths SVG (viewBox 400×400) das 5 regiões do Brasil e das 5 zonas de 9 cidades |

Rotas: coleta = 5 cidades × 5 zonas; entrega = 8 cidades × 5 zonas; transferência = CD Cajamar → 7 hubs.
Tudo fictício (gerado no artifact). Mapa: regiões simplificadas do Datamaps (MIT); cidades da malha municipal do IBGE.

## Premissas por perna (peso · nota 0 → nota 100)

| Coleta | Transferência | Entrega |
|---|---|---|
| Coleta na janela · 25% · 80% → 97% | Chegada no hub no prazo · 25% · 80% → 97% | Entrega no prazo · 25% · 80% → 96% |
| 1ª tentativa · 20% · 85% → 97% | Ocupação do caminhão · 20% · 60% → 90% | 1ª tentativa · 20% · 80% → 95% |
| Ocorr./100 coletas · 20% · 8 → 2 | Ocorr./100 viagens · 20% · 40 → 8 | Ocorr./100 entregas · 20% · 6 → 1,5 |
| Frete/orçado · 20% · 125% → 100% | Frete/orçado · 20% · 125% → 100% | Frete/orçado · 20% · 125% → 100% |
| Horas até o CD · 15% · 24 → 6 | Horas no cross-docking · 15% · 16 → 4 | Dias p/ resolver · 15% · 15 → 3 |

## Regras (implementadas em `app/web/src/lib/score.ts`)

- **Nota** da premissa = `clamp((valor − nota_zero) / (nota_cem − nota_zero), 0, 1) × 100`.
- **Score** da rota = média das notas ponderada pelos pesos (ignora nota nula).
- **Situação:** Saudável ≥ 85, Atenção ≥ 65, Crítica abaixo.
- **Score da perna/mês:** média dos scores das rotas ponderada pelas unidades.
- **Economia possível** = (ocorrências acima da meta × custo médio da ocorrência na rota) + frete pago acima do orçado + (transferência) frete do espaço vazio abaixo da ocupação meta.
- **Premissa que mais tira pontos** = maior `peso × (100 − nota)`.
- **Ação sugerida:** prática da perna cujo `gatilho` contém a premissa foco; se o foco é `ocorr_100`, usa o tipo de ocorrência que mais custou. Placeholders `{transportadora}`, `{pct_fora}`, `{n_frustradas}`… são preenchidos com os números da rota. Rota saudável: "Nenhuma ação necessária".
- **Combo** (achado do card de padrões): combinação mais cara de tipo + rota (na entrega, tipo + produto + rota).

## Contrato da API (quando houver backend)

Com `VITE_API_URL=https://api.exemplo`, o app faz:

| Método | Caminho | Resposta |
|---|---|---|
| GET | `/rotas` | `Rota[]` |
| GET | `/operacao_mes` | `OperacaoMes[]` |
| GET | `/ocorrencias` | `Ocorrencia[]` (pode filtrar `?desde=AAAA-MM`) |
| GET | `/premissas` | `Premissa[]` |
| GET | `/praticas` | `Pratica[]` |
| GET | `/referencia` | `[{data, mes, mes_anterior}]` |
| GET | `/acoes` | `Acao[]` |
| POST | `/acoes` | cria; corpo `Acao` sem `id`; devolve com `id` |
| PATCH | `/acoes/:id` | `{status: 'Concluída' | 'Cancelada'}` |

Formatos exatos: schemas zod em `app/web/src/lib/types.ts`. O cálculo fica no front (igual ao artifact);
se o volume crescer, mover `calcRotaMes` para o backend/SQL e expor `/rota_mes` pronto.

A API (`app/api`) já serve esse contrato. Ocorrências vindas da bronze trazem também `protocolo` e
`canal` (rastreabilidade até o SAC); as criadas pela demo trazem `detalhes` (ficha do acidente). O zod do
front ignora esses campos extras.

### Endpoints de IA (recorte da demo: Transferência)

| Método | Caminho | Corpo → resposta |
|---|---|---|
| POST | `/ocorrencias/extrair` | `{relato, imagemBase64?, imagemTipo?, rota_id?}` → `{ok, ficha, faltando[], pergunta, meta}`. Não grava. `ok=false` quando falta tipo, rota, data/hora ou trecho, e `pergunta` diz o que pedir ao motorista |
| POST | `/ocorrencias` | ficha revisada pela pessoa (`tipo`, `rota_id`, `data_hora`, `trecho`, `produto`, `custo_estimado` obrigatórios) → `Ocorrencia` gravada, status Aberta |
| POST | `/acoes/sugerir` | `{rota_id, numeros: {chave: valor}, foco?, tipo_mais_caro?}` com os números que o front já calculou → `{pratica_id, acao, justificativa, numeros_usados, numeros_fora, pratica, meta}` |
| GET | `/ia/uso` | chamadas de IA por operação: tokens, custo em US$ e latência |
| GET | `/health` | `{ok, fonte}` (`gold` ou `json`) |

`meta.modo` diz se respondeu o Claude (`claude`) ou o modo simulado (`simulado`, sem chave ou com falha).
`numeros_fora` lista números citados na ação que não vieram do código (deve ficar vazio).

## Base real: planilha bronze → gold

A base real é a planilha `bronze_planilha` (22 abas de ERP, TMS, WMS, e-commerce, FIN, SAC e
configuração; posição 2026-11-24). O ETL de `app/api` transforma essa planilha nos recursos acima:

```bash
npm run etl -w app/api        # lê docs/bronze_planilha.xlsx (ou app/api/data/bronze/) → SQLite
npm run etl:check -w app/api  # compara o gold com os JSON de public/data, campo a campo
```

Hoje o gold sai **idêntico** aos JSON do front nos 5 recursos. Regras aplicadas:

| Recurso | Regra |
|---|---|
| `rotas` | `tms_rotas` + `tms_locais` (coleta pela zona de origem, transferência/entrega pelo destino; região pela UF) + `erp_transportadoras` (CNPJ sem máscara) + `fin_tabela_frete` vigente (sem data de fim) |
| `operacao_mes` coleta | mês da janela; coletas únicas (reenvio duplicado: vale a última ingestão); na janela = veículo chegou (1ª tentativa) até o fim da janela; 1ª tentativa = nenhuma tentativa frustrada; horas até o CD = entrada no WMS (UTC) − coletado_em |
| `operacao_mes` transferência | mês da saída do CD; no prazo = chegada ≤ previsão; ocupação = `carga_m3` (vírgula) ÷ capacidade do veículo; horas no cross-docking = SAIDA − ENTRADA |
| `operacao_mes` entrega | mês da saída para entrega; no prazo = data local da entrega ≤ data prometida; 1ª tentativa = entregue na tentativa 1 |
| frete pago | soma dos CT-e não cancelados (normal + complementar) por operação |
| `ocorrencias` | `sac_ocorrencias` por protocolo; código com espaço/minúscula/legado traduzido por `sac_tipos_ocorrencia`; rota pela operação ligada; produto pela categoria do SKU; custo = lançamentos efetivados + provisionados; ação e status pelo último evento (eventos duplicados removidos) |
| `premissas` | `cfg_premissas` |
| `referencia` | posição da aba Índice |

O guia de boas práticas (`praticas.json`) não está na bronze e continua vindo do JSON.

Para trocar a base de novo (outro banco, outra planilha), basta uma função que devolva esses recursos
em `app/api/src/store.ts` e escolher por `DATA_SOURCE`.

## Ligação com o projeto `hackatown` (Radar de Ocorrências)

As ocorrências classificadas pelo pipeline Python (`data/radar.db`) podem alimentar `/ocorrencias`
mapeando `tipo`, `produto`, `transportadora`, `custo` e `rota_id`. Rotas, operação mensal e premissas
continuam vindo de cadastro/TMS (no protótipo, dos JSON fictícios).
