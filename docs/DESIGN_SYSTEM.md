# Design system · Saúde das rotas

Extraído do artifact original (tema "Fundo branco"). Fonte da verdade: `app/web/src/design-system/tokens.css`.

## Princípios

1. **Fundo branco, tinta escura, cor só para situação.** A interface é neutra; verde, âmbar e vermelho aparecem apenas para dizer se algo está saudável, em atenção ou crítico.
2. **Número é protagonista.** KPIs e scores em serif grande, sempre tabulares.
3. **Explicar antes de mostrar.** Todo card tem uma nota curta dizendo o que é e como ler.
4. **Responsivo até ~400 px.** Grids com `auto-fit`, nada de largura fixa; gráficos medem `clientWidth`.

## Cores

| Token | Claro | Uso |
|---|---|---|
| `--color-bg` / `--color-panel` | `#ffffff` | fundo da página e dos cards |
| `--color-fg` | `#1d2129` | texto, botão primário, linha do gráfico, item selecionado |
| `--color-fg-muted` | `#5f6673` | rótulos, notas, eixos, barras neutras |
| `--color-border` | `#e3e6eb` | bordas, divisores de tabela |
| `--color-ok` | `#1a7f37` | **Saudável** (score ≥ 85), variação boa, economia |
| `--color-warn` | `#9a6700` | **Atenção** (65 ≤ score < 85) |
| `--color-bad` | `#c62828` | **Crítica** (score < 65), variação ruim, premissa com nota crítica |
| `--chart-grid` | `#edf0f3` | linhas de grade |
| `--chart-axis` / `--chart-muted` | `#c7ccd3` | eixos, séries secundárias |
| `--chart-reference` | `#8a919c` | linhas de referência |

Derivados (`color-mix`): `--tint-ok|warn|bad|neutral` (fundo de chip/pílula, 15–18 %),
`--map-ok|warn|bad|empty` (preenchimento de mapa, 55 % sobre o painel).

As faixas 85/65 vêm do arquivo de premissas (`faixa_saudavel`, `faixa_atencao`) e não devem ser fixadas no código.

Tema escuro: pronto em `:root[data-theme='dark']`, mas o protótipo é só claro.

## Tipografia

| Papel | Fonte | Tamanho | Peso |
|---|---|---|---|
| Título da página | Serif | 24 px | 400 |
| Título da perna | Serif | 22 px | 400 |
| Número de KPI / score | Serif, tabular | 30 px | 400 |
| Valor em célula de destaque | Serif, tabular | 23 px | 400 |
| Título de card | Sans | 15 px | 600 |
| Corpo | Sans | 13 px / 1.45 | 400 |
| Auxiliar / nota | Sans | 12 px / 11,5 px | 400–600 |
| Rótulo caixa alta | Sans | 10,5 px, `letter-spacing .4px` | 700 |

Serif = Source Serif 4; Sans = Inter (substituem Anthropic Serif/Sans do artifact).

## Espaço, raio, sombra

- Espaços: 4 · 8 · 12 · 16 · 20 · 24. Gap entre seções 20 px, entre cards 12 px, padding do card 16 px.
- Raios: 8 (botão, input, tooltip) · 12 (card, cartão de rota) · 14 (cartão de perna, modal) · 999 (chip, pílula, trilho).
- Sombras: card `0 1px 3px rgba(16,24,40,.06)`; selecionado/popover `0 6px 18px rgba(16,24,40,.12)`; modal `0 18px 48px rgba(16,24,40,.25)`.
- Largura máxima do conteúdo: 1180 px.

## Componentes

| Componente | Arquivo | Onde aparece |
|---|---|---|
| `Card` | `components/Card.tsx` | toda seção (título + nota + ações à direita) |
| `Kpi` | `components/Kpi.tsx` | grade de 6 indicadores por perna |
| `Chip` | `components/Chip.tsx` | situação da rota (CRÍTICA / ATENÇÃO / SAUDÁVEL), id da prática |
| `Pill` | `components/Chip.tsx` | variação do score (+3 / −2) |
| `Segmented` | `components/Segmented.tsx` | abas, filtro de situação, filtro do guia |
| `Button` | `components/Button.tsx` | primário (tinta cheia) e secundário (contorno) |
| `BarList` | `components/BarList.tsx` | prejuízo por tipo/produto/transportadora |
| `ScoreGauge` | `components/ScoreGauge.tsx` | meio contagiro do score (cartões de perna, detalhe da rota) |
| A criar | | `ComboChart` (barras + linha, 2 eixos), `MiniLine` (score 6 meses), `MapaCidade`, `MapaBrasil`, `Modal`, `Tooltip` |

### Padrões visuais recorrentes

- **Cartão de rota:** borda esquerda de 4 px na cor da situação; `<details>` que expande.
- **Cartão de perna selecionado:** borda `--color-fg` + anel de 1 px + sombra; o número do passo inverte (fundo escuro).
- **Célula com borda superior colorida** (3 px) para os indicadores do detalhe da rota.
- **Skeleton** (`.ds-skeleton`) enquanto carrega; erro em vermelho com texto curto ("Não foi possível carregar…").
- **Mês parcial** marcado com `*` e barra com opacidade menor.

## Regras de gráfico

- Grade horizontal só nos ticks (4 no eixo principal); sem grade vertical.
- Eixos: texto 11 px `--color-fg-muted`; R$ em formato compacto (`R$ 12,3 mil`).
- Linha de referência do score saudável: tracejada `4 4`, `--color-fg-muted`.
- Linha da série principal: 2–2,25 px, `--color-fg`; pontos coloridos pela situação, com borda do painel e rótulo do valor acima.
- Barras: `--color-fg-muted`, raio 3, mês parcial mais claro.
- Todo gráfico com valores tem **tooltip** (`.ds-tip`, 230 px) que fica dentro do card; ativar por coluna inteira (área transparente).
- `role="img"` + `aria-label` descrevendo o gráfico; elementos clicáveis (zonas do mapa) com `role="button"`, `tabindex=0`, Enter/Espaço.
