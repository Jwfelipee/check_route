# Telas e seções

Página única, duas abas (**Painel** e **Guia de boas práticas**). Ordem e textos iguais ao artifact
(`reference/artifact/index.html`). Link direto para uma perna: `/#perna-coleta`, `/#perna-transferencia`, `/#perna-entrega`.

## 1. Cabeçalho `#cabecalho`
Logo "e." (quadrado escuro 40 px), título "Saúde das rotas", subtítulo
"Protótipo do Hackathon Eteg · Equipe 3 · dados fictícios · posição de DD/MM/AAAA" (da `referencia.data`),
e à direita o `Segmented` com as abas.

## 2. Resumo `#resumo`
"Em **novembro (até 24/11)**, a operação tem **N** rotas críticas de **72** e **R$ X mil** de prejuízo com ocorrências.
A perna com o menor score é a **Y**, com **Z**." Fonte: `kpisTotal` linha `geral`.

## 3. Seletor de pernas `#pernas`
Três cartões ligados por setas (empilham abaixo de 760 px): número do passo, nome, nome em inglês
(First / Middle / Last mile), descrição curta, `ScoreGauge` + score (cor pela situação), "N de M rotas críticas",
"Prejuízo R$ X". Fonte: `kpisTotal` (sem filtros). Clique abre a perna e atualiza o hash.

Abaixo, a dica: "Clique em uma perna para ver as rotas, o prejuízo e as premissas dela…".

## Seções de cada perna (`#perna-coleta` como exemplo)

As três pernas têm a mesma estrutura; o que muda está em `src/features/perna/config.ts`.

### 3.1 Cabeçalho da perna
"Coleta · first mile" (serif 22 px) e descrição do que mais pesa na perna.

### 3.2 Filtros `#filtros-coleta`
- Coleta e entrega: **Região** (N, NE, CO, SE, S; restringe os estados), **Estado** (UFs com rotas nessa perna; padrão SP) e a **zona** escolhida clicando no mapa da cidade (mostrar "Zona X · limpar").
- Transferência: **região do hub**, escolhida clicando no mapa do Brasil.
- Os filtros afetam KPIs, lista de rotas, padrões, ranking e gráfico mensal; **não** afetam os cartões do seletor de pernas.

### 3.3 KPIs (grade de 3 colunas → 2 → 1)
| id | Rótulo (coleta) | Valor | Nota |
|---|---|---|---|
| `kpi-score-coleta` | Score médio da coleta | `kpis.score` (cor pela situação) | "+N pontos sobre o mês anterior · saudável a partir de 85" |
| `kpi-prazo-coleta` | Coletas na janela agendada | `pct_prazo` | "+x p.p. sobre o mês anterior · meta 97%" |
| `kpi-chave-coleta` | Coletas na 1ª tentativa (transf.: Ocupação média do caminhão) | `pct_primeira` / `ocupacao` | variação + meta |
| `kpi-prejuizo-coleta` | Prejuízo com ocorrências no mês | `prejuizo` | "N ocorrências, M ainda em aberto" |
| `kpi-economia-coleta` | Economia possível no mês | `economia` (verde) | "se cada rota chegasse na meta de ocorrências e no frete orçado" |
| `mapa-coleta` | Score por zona da cidade | mapa | legenda + filtro ativo |

Variação: verde quando melhora, vermelho quando piora.

### 3.4 Mapa (⏳)
- **MapaCidade** (coleta, entrega): `mapa.json → cidades[UF].zonas[zona].d`, viewBox 400×400. Cada zona pintada com `--map-ok|warn|bad` pelo score da rota da zona (`zonas`), ou `--map-empty` sem rota. Clique/Enter alterna o filtro de zona; a escolhida tem borda 4 px escura e as outras ficam com opacidade 0,4. Tooltip: "São Paulo · zona Norte · Atenção / Score 72 · 1.234 coletas no mês / 18 ocorrências · prejuízo R$ 9.870". Código de referência: `reference/artifact/sr_view.js`, `dash.draw('mapacidade')`.
- **MapaBrasil** (transferência): `mapa.json → regioes[N|NE|CO|SE|S].d`, mesma lógica com `regioes` e o rótulo da região + score no centro. Referência: `dash.draw('mapa')`.

### 3.5 Rotas `#rotas-coleta`
Card com `Segmented` (Todas / Críticas / Atenção / Saudáveis). Lista de `<details>`, piores primeiro:
- **Resumo:** nome da rota, chip da situação, transportadora, score + pílula da variação, prejuízo.
- **Detalhe (⏳ completar):**
  1. Bloco "hero": `ScoreGauge` da rota com score, mês anterior e variação; barras das 5 premissas (nota 0–100, cor pela nota, valor do indicador ao lado); células com os indicadores-chave (borda superior colorida).
  2. Mini gráfico de linha do score nos 6 meses (`rotaMes` da rota), com linha tracejada do score saudável.
  3. Ocorrências do mês da rota por tipo (`padroes` com `dim = rota_tipo`).
  4. **Ação sugerida** (texto do guia, id e título da prática, link para o guia) e botão **Validar e acompanhar**. Se já houver ação em acompanhamento, mostrar responsável, prazo (vermelho se atrasada), score na validação → hoje, e os botões "Marcar como concluída" / "Cancelar acompanhamento".

### 3.6 Ações em acompanhamento `#acoes-coleta` (⏳)
Tabela: Rota · Ação · Responsável · Prazo · Validada em · Score na validação · Score hoje · Situação.
Fonte: `acoesRepo.listar()` filtrado pela perna. Vazio: "Nenhuma ação validada ainda…".

**Modal "Validar ação e acompanhar"** `#validar-acao`: Rota (somente leitura), Ação (textarea editável, vem da sugestão),
Responsável, Prazo (padrão hoje + 14 dias). Validação: os três obrigatórios ("Preencha a ação, o responsável e o prazo.").
Ao salvar grava `{rota_id, perna, rota, acao, acao_sugerida, foco, responsavel, prazo, status: 'Em acompanhamento', score_inicial, validada_em, pratica_id}`. Esc fecha.

### 3.7 Onde se concentra o prejuízo `#padroes-coleta`
Frase de achado: "**X%** do prejuízo da coleta no mês vem de **coleta frustrada na rota São Paulo · Norte**" (`padroes`, `dim = combo`).
Três `BarList`: por tipo de ocorrência, por produto, por transportadora. Barra vermelha se ≥ 30 % do prejuízo, âmbar se ≥ 15 %.

### 3.8 Ranking `#ranking-coleta`
Tabela do pior score para o melhor: Rota, Transportadora, Score, as 5 premissas da perna, Prejuízo, Economia possível, Situação.
Premissa com nota abaixo da faixa de atenção em vermelho.

### 3.9 Mês a mês `#mes-coleta` (⏳)
`ComboChart`: barras = prejuízo (eixo esquerdo, R$ compacto), linha = score médio ponderado (eixo direito 0–100), linha tracejada no score saudável, mês atual com `*`.
Altura 250, margens `{t:22, r:40, b:26, l:62}`. Tooltip por mês: score, % no prazo, unidades, prejuízo, ocorrências, rotas por situação.
Fonte: `redeMes` da perna. Referência: `dash.draw('rede')`.

### 3.10 Como o score é calculado `#premissas-coleta`
`<details>` com a explicação da régua, tabela das premissas (Premissa, O que mede, Peso, Nota 0 em, Nota 100 em)
e o rodapé sobre a economia possível.

## 4. Aba Guia `#guia`
Texto de abertura, `Segmented` por perna, e por perna uma grade de cartões de prática
(id, título, quando usar, como fazer em lista, melhora, esforço, prazo típico, origem).
Um link "ver no guia" vindo de uma rota deve abrir a aba e destacar o cartão (`#pratica-COL-02`).

## 5. Rodapé
"Todos os números são fictícios… zonas são uma divisão aproximada da cidade em cinco partes… (IBGE)."
