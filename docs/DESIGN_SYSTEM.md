# Design system · CheckRoute

Implementação do **CheckRoute Design System v1.0** (pacote `CheckRoute.zip`, enviado no Slack da Equipe 3:
manual da marca, `tokens.json`, README técnico e PDF). Fonte da verdade no código:
`app/web/src/design-system/tokens.css`. Os tokens seguem o `tokens.json` sem alteração de valor.

## Princípios

1. **Marca no produto: símbolo + nome em texto, sem slogan.** O PNG do símbolo não tem versão negativa homologada,
   então no menu escuro ele fica sobre um quadro branco (não aplicar sobre fundo poluído, não recolorir).
2. **Cor de situação sempre com texto.** Chips dizem "Saudável", "Atenção", "Crítica"; alertas têm ícone + texto.
3. **Valores explícitos.** KPI com título, valor, unidade (`/100`), período e base da comparação. Ausência de valor
   aparece como "—" ou "Não informado", nunca zero. Taxa com denominador zero = "Indisponível".
4. **Estimado ≠ comprovado.** "Economia estimada" não usa verde; ação sugerida mostra a fonte do guia e só vale depois
   de validada (nada é aprovado automaticamente).
5. **Base sintética identificada** na Visão geral.

## Cores (tokens.json → CSS)

| tokens.json | Variável CSS | Valor | Uso |
|---|---|---|---|
| `brand.navy` | `--brand-navy` | `#101C3A` | menu lateral |
| `brand.blue` / `action.primary` | `--brand-blue` / `--action-primary` | `#0645F5` | botão primário, item ativo, seleção, barras |
| `action.hover` | `--action-hover` | `#0035C7` | hover do primário |
| `action.focus` | `--action-focus` | `#0645F5` | anel de foco (2 px) |
| `brand.lilac` | `--brand-lilac` | `#B184F5` | só destaque (selo "em breve" no menu); nunca texto pequeno sobre branco |
| `surface.canvas` | `--color-bg` | `#F5F7FB` | fundo da página |
| `surface.card` | `--color-panel` | `#FFFFFF` | cards, cabeçalho |
| `surface.subtle` | `--color-subtle` | `#EAF0FF` | trilho de barra, hover, bloco de ação sugerida |
| `text.primary` | `--color-fg` | `#101C3A` | texto |
| `text.secondary` | `--color-fg-muted` | `#475569` | rótulos, notas |
| `border.default` | `--color-border` | `#CBD5E1` | bordas |
| `status.success` / `successBg` | `--color-ok` / `--color-ok-bg` | `#166534` / `#DCFCE7` | Saudável |
| `status.warning` / `warningBg` | `--color-warn` / `--color-warn-bg` | `#92400E` / `#FEF3C7` | Atenção |
| `status.danger` / `dangerBg` | `--color-bad` / `--color-bad-bg` | `#B91C1C` / `#FEE2E2` | Crítica |
| `status.info` / `infoBg` | `--color-info` / `--color-info-bg` | `#1D4ED8` / `#DBEAFE` | informação |
| `status.neutral` / `neutralBg` | `--color-neutral` / `--color-neutral-bg` | `#475569` / `#E2E8F0` | neutro |
| `chartColors` | `--chart-1` … `--chart-5` | `#0645F5` `#7251C4` `#087E8B` `#B45309` `#64748B` | séries de gráfico |

Componentes usam os nomes `ok | warn | bad | info` via `data-c` ou `tone` (ver `design-system/tone.ts`).
O tema escuro do protótipo anterior foi removido: o design system é só claro e não há versão negativa da marca.

## Tipografia

Montserrat (`@fontsource-variable/montserrat`), pesos 400/500/600/700, fallback Arial.

| Papel | Variável | Tamanho / altura |
|---|---|---|
| Página | `--fs-page` | 28 / 36 |
| Seção | `--fs-section` | 20 / 28 (título do cabeçalho e das etapas) |
| KPI | `--fs-metric` | 32 / 40, peso 700, tabular |
| Corpo | `--fs-body` | 14 / 22 |
| Rótulo | `--fs-label` | 14 / 20 |
| Legenda | `--fs-caption` | 12 / 16 |

Valores monetários alinhados à direita e números tabulares (`.num`).

## Espaço, raio, layout

- Grade de 4 px: `--space-1` (4) … `--space-10` (64); na maior parte, 8, 12, 16, 24 e 32.
- Raio: 8 controles · 12 cards · 16 diálogos · 999 chips.
- Controles com 44 px (`--control-h`): botões, selects, itens do menu.
- Layout: menu lateral 248 px (`--sidebar-w`), cabeçalho 64 px (`--header-h`), margem 24 px (`--gutter`).
  Abaixo de 1024 px o menu vira gaveta (botão no cabeçalho); abaixo de 768 px, coluna única e margem 16 px;
  tabelas com rolagem horizontal.
- Bordas discretas, sem gradientes decorativos.

## Navegação

| Item do menu | Tela | Estado |
|---|---|---|
| Visão geral (`#visao`) | `features/visao/VisaoGeral.tsx`: ocorrências únicas, perdas registradas, taxa por mil operações, score geral, perdas por etapa, ação prioritária, ranking financeiro | pronto |
| Saúde das rotas (`#perna-<etapa>`) | seletor de etapa + `features/perna/PernaView.tsx` | pronto |
| Ocorrências | captura do relato → ficha revisável (BACKLOG 10) | "em breve" no menu |
| Ações | ações sugeridas, validadas e acompanhamento (BACKLOG 6 e 11) | "em breve" no menu |
| Guia de boas práticas (`#guia`) | `features/guia/Guia.tsx` | pronto |

## Componentes

| Componente | Arquivo | Notas |
|---|---|---|
| `Button` | `components/Button.tsx` | `primary` (azul), `secondary` (borda azul), `tertiary` (texto), `danger` (só exclusão confirmada); `loading` |
| `Alert` | `components/Alert.tsx` | `ok`, `warn`, `bad`, `info`, `neutral`, sempre com ícone + texto |
| `Icon` | `components/Icon.tsx` | ícones de traço inline (sem dependência) |
| `Kpi` | `components/Kpi.tsx` | título, valor, `unit`, nota com período/comparação |
| `Card` | `components/Card.tsx` | seção com título, nota e ações |
| `Chip` / `Pill` | `components/Chip.tsx` | situação (texto) e variação |
| `Segmented` | `components/Segmented.tsx` | filtros; opção ativa em azul |
| `BarList` | `components/BarList.tsx` | perdas por etapa, padrões de prejuízo |
| `ScoreGauge` | `components/ScoreGauge.tsx` | meio contagiro do score |

## Acessibilidade

- Contraste alvo 4,5:1 para texto comum; o nome "CheckRoute" no menu fica em branco (o azul elétrico sobre o navy
  não atinge o mínimo).
- Foco visível (anel azul de 2 px) em tudo que é interativo; link "Pular para o conteúdo".
- Cor nunca sozinha: situação com texto, alertas com ícone.
- `prefers-reduced-motion` desliga o skeleton animado e a animação da gaveta.

## Decisões abertas (do próprio design system)

- **Faixa de atenção:** o design system propõe 70; o painel continua lendo `faixa_atencao` das premissas da base
  (hoje 65), sem número fixo no código. Mudar é alterar a premissa, não o front.
- Versão negativa/vetorial da marca, pesos do score, perfis de acesso e custo real ainda precisam de validação.
