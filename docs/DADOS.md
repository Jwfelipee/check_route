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
| POST | `/ocorrencias/extrair` | `{relato, imagemBase64?, imagemTipo?, rota_id?}` → `{ok, ficha, faltando[], pergunta, revisar[], relato_mascarado, privacidade, guardas, meta}`. Não grava |
| POST | `/ocorrencias` | ficha revisada pela pessoa (`tipo`, `rota_id`, `data_hora`, `trecho`, `produto`, `custo_estimado` obrigatórios; `canal`: `whatsapp` \| `formulario`; `com_foto`) → `Ocorrencia` gravada (só dados mascarados), status Aberta |
| GET | `/ocorrencias/recentes?limite=50` | ocorrências registradas pelo relato, mais novas primeiro, com `canal` e `detalhes` (ficha, relato mascarado, privacidade, guardas) |
| POST | `/acoes/sugerir` | `{rota_id, numeros, foco?, tipo_mais_caro?, contexto?}` → `{acao, praticas[{id, papel, como_usou, titulo, prazo_dias, esforco}], justificativa, considerou_contexto, numeros_usados, numeros_fora, ferramentas_chamadas, versao, contexto, cache, criada_em, privacidade, guardas, meta}`. Sempre por IA; `503 {erro, motivo}` (`sem_chave` \| `mcp_indisponivel` \| `falha_ia`) se ela não responder |
| GET | `/acoes/sugestoes/:rota_id` | histórico de versões da sugestão da rota |
| GET | `/contatos` | contatos cadastrados, com o telefone **mascarado** |
| POST, PATCH | `/contatos`, `/contatos/:id` | cadastrar (`telefone`, `nome`, `papel`, `transportadora?`, `rotas[]`) e editar/ativar/desativar |
| GET | `/rotas/:id/responsaveis` | quem responde pela rota (sem telefone): sugestão no "Validar e acompanhar" |
| GET | `/contatos/por-telefone/:tel` | **interno** (`x-internal-token`): cadastro de quem escreveu no WhatsApp, com as rotas dele. 404 = não cadastrado |
| POST | `/contatos/:id/escopo` | **interno**: token curto (15 min) do MCP com as rotas desse contato |
| POST | `/acoes` | também aceita `status: 'Descartada'` (sem responsável/prazo): a sugestão recusada fica no histórico |
| GET | `/ia/uso` | chamadas de IA por operação: tokens, custo em US$ e latência |
| GET | `/health` | `{ok, banco, fonte}` |

`meta.modo` diz se respondeu o Claude (`claude`) ou o modo simulado (`simulado`). Na **extração** o simulado entra sem chave ou com falha; na **ação sugerida** não existe sugestão sem IA: sem chave, sem MCP ou com falha a API responde 503, e o simulado só roda com `AI_PROVIDER=fake` explícito (testes e desenvolvimento).

`POST /ocorrencias` aceita `reportado_por` (id do contato). Pelo WhatsApp (`canal: 'whatsapp'`) ele é obrigatório e a chamada exige `x-internal-token`; a API confere se o contato está ativo e se a rota é dele (403 se não). `detalhes.reportado_por` guarda quem registrou (nome, papel, transportadora; nunca o telefone).

**Ação sugerida: guia + dados da rota (MCP).** A IA (Claude Sonnet 5.5, `toolRunner` do SDK) parte do guia de boas práticas
(`listar_praticas`) e consulta os dados da rota no servidor MCP (`app/mcp`): resumo e tendência, ocorrências por tipo, padrão de
horário, trecho (km) e clima, veículos e cargas, atrasos no hub, comparação com a mediana da etapa e ações anteriores. Só responde
por `propor_acao`, que exige de 1 a 3 práticas do guia (exatamente uma principal) e o id de cada uma citado no texto
("... (TRF-08, TRF-05)"). `ferramentas_chamadas` mostra o que ela consultou; `numeros_fora` lista número citado que não veio do
front nem das ferramentas (deve ficar vazio).

A sugestão fica guardada por rota e versão (`sugestoes_acao`). Sem `contexto`, a API reaproveita a última versão enquanto a
`assinatura` dos dados (números da rota, ocorrências novas, ações) for a mesma; com `contexto` ("Dar detalhes", até 600
caracteres, mascarado e tratado como dado) gera uma versão nova. Descartar uma ação muda a assinatura: a IA prepara outra sabendo
do que não serviu.

**MCP e acesso mínimo** (`app/mcp`, porta 7335, Streamable HTTP, só leitura). Conecta ao Postgres com o papel `checkroute_leitura`:
só `SELECT` em `gold_rotas`, `gold_operacao_mes`, `gold_referencia`, `acoes` e nas views `v_ocorrencias` (sem relato) e
`v_sac_trecho` (do relato sai só km, hora e clima), e nas colunas de `bronze_tms_viagens` sem placa. Não vê `contatos`, `wa_*`,
`ia_uso` nem o texto dos relatos. Smoke: `npm run mcp:smoke -w app/mcp`.

**Escopo por remetente.** Cada conexão traz um token assinado (HMAC, 15 min) emitido pela API com `papel` e `rotas`. O MCP só
confia nele: ferramenta com rota fora do escopo responde o mesmo erro neutro de rota inexistente. Motorista tem 6 ferramentas;
transportadora, gestor e painel têm 8 (com `atrasos` e `historico_acoes`); `comparar_rotas` com escopo restrito devolve só "acima ou
abaixo da mediana", sem id, nome ou número de outra rota. Evidência: `npm test -w app/mcp` (matriz ferramenta × papel × rota de
fora, token adulterado e expirado) e `npm run escopo -w app/whatsapp` (conecta como o motorista da T02 e tenta ver as outras rotas).

**Contatos.** Só quem o painel cadastra registra pelo WhatsApp. O ETL e o start da API criam um motorista e um responsável por rota
(fictícios); `WA_CONTATOS_DEMO="telefone:nome:papel:T02,T05;..."` cadastra o número de quem for testar.

**Dados pessoais** (`app/api/src/privacidade.ts`). Telefone, CPF, e-mail, nome do motorista e placa são mascarados antes de
o relato ir ao Claude e antes de gravar. Placa e motorista viram pseudônimos estáveis (`VEIC-xxxx`, `Motorista #xxxx`), o que
ainda permite cruzar o mesmo veículo. O app de WhatsApp não anexa mais telefone e nome ao relato (vão em `reportado_por`); a máscara cobre também registros antigos com o cabeçalho `[via WhatsApp <telefone>, <nome>]`.

**Prompt injection** (`app/api/src/guardas.ts`). O relato não fecha a tag `<relato>` (`<` e `>` viram `‹ ›`); frases que tentam
mandar na IA são sinalizadas para quem revisa; a saída passa por schema e regras do código (rota existente, enum, custo
plausível, prática do guia); extrair não grava. Evidência: `npm run seguranca -w app/api` (4 relatos adversariais pela extração
real) e `npm test -w app/api`.

## Base real: planilha bronze → gold

A base real é a planilha `bronze_planilha` (22 abas de ERP, TMS, WMS, e-commerce, FIN, SAC e
configuração; posição 2026-11-24). O ETL de `app/api` transforma essa planilha nos recursos acima:

```bash
docker compose run --rm api npm run etl        # lê docs/bronze_planilha.xlsx → Postgres (bronze_* e gold_*)
docker compose run --rm api npm run etl:check  # compara o gold com os JSON de public/data, campo a campo
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

### Cenário da demo: acidentes na T02 (`app/api/src/etl/cenario-acidentes.ts`)
A bronze não tem tipo de acidente na transferência. O ETL planta, na camada bronze, **35 acidentes na T02
(CD Cajamar → Hub Belo Horizonte, BR-381 Fernão Dias)** de junho a novembro: 4 tipos novos (Colisão, Tombamento,
Saída de pista, Avaria por frenagem), ligados a viagens reais, concentrados em saídas noturnas e na serra (km 487–553),
com relato, foto, custos (FIN) e eventos (SAC); a viagem acidentada chega atrasada ao hub. A T02 cai de 85 (junho)
para 54, crítica (novembro). Determinístico e idempotente (protocolos `SACDEMO…`); `npm run etl -w app/api -- --sem-cenario`
gera o gold só com a planilha. O `etl:check` deixa o cenário fora da comparação e o lista à parte.

Para trocar a base de novo (outro banco, outra planilha), basta uma função que devolva esses recursos
em `app/api/src/store.ts` e escolher por `DATA_SOURCE`.

## Ligação com o projeto `hackatown` (Radar de Ocorrências)

As ocorrências classificadas pelo pipeline Python (`data/radar.db`) podem alimentar `/ocorrencias`
mapeando `tipo`, `produto`, `transportadora`, `custo` e `rota_id`. Rotas, operação mensal e premissas
continuam vindo de cadastro/TMS (no protótipo, dos JSON fictícios).
