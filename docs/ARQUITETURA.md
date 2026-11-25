# Arquitetura

## Stack

| Camada | Escolha | Por quê |
|---|---|---|
| Monorepo | **npm workspaces + Turborepo** | `app/web` e `app/api` no mesmo repositório; `turbo` roda dev, build, teste e typecheck. |
| Build / dev server | **Vite 5** | Sobe em segundos, HMR, zero config. |
| UI | **React 18 + TypeScript** (strict) | Time conhece; tipos pegam erro de campo nos cálculos. |
| Gráficos e mapas | **D3 v7** | O artifact já desenha tudo em D3 (contagiro, barras + linha, mapas por path SVG). Portar é direto; libs prontas (Recharts etc.) não fazem o mapa por zona nem o contagiro. |
| Dados remotos / cache | **TanStack Query 5** | Loading/erro/cache sem código manual; facilita trocar JSON local por API. |
| Estado de tela | **Zustand** | Filtros e perna aberta, em ~30 linhas (`app/web/src/app/store.ts`). |
| Validação | **Zod** | Valida o JSON/API na entrada: formato errado vira erro visível, não número errado. |
| Estilo | **CSS com tokens** (custom properties) | Igual ao artifact; sem dependência de framework CSS. Componentes usam só `var(--…)`. |
| Fontes | **Inter** + **Source Serif 4** (`@fontsource-variable`) | Substitutos abertos das fontes Anthropic Sans/Serif usadas no artifact. |
| Testes | **Vitest** | Testa o motor do score com os dados reais do protótipo. |

Backend: **não é obrigatório para a demo**. O app roda só com os JSON em `app/web/public/data`.
O pacote `app/api` já entra no workspace e nos tasks `build` e `typecheck`, mas ainda não sobe servidor
e não tem script `dev`. Quando houver API (por exemplo FastAPI sobre o `radar.db` do projeto `hackatown`),
basta servir os recursos descritos em [DADOS.md](DADOS.md) a partir de `app/api` e definir `VITE_API_URL`.
As ações validadas hoje ficam no `localStorage` (um navegador); com API passam para `POST/PATCH /acoes`.

## Estrutura

```
app/web/                painel (Vite + React)
  public/data/          dados fictícios + mapa.json (geometria das regiões e zonas)
  src/
    main.tsx            providers + imports de CSS
    app/
      App.tsx           cabeçalho, abas, resumo, perna aberta
      store.ts          estado de tela (perna, aba, filtros, filtro de situação)
      app.css           layout específico do painel
    design-system/
      tokens.css        cores, tipografia, espaço, raio, sombra (claro + escuro opcional)
      base.css          reset, tabela, tooltip, skeleton, utilitários ds-*
      components.css    estilos dos componentes
      components/*.tsx  Card, Kpi, Chip/Pill, Segmented, Button, BarList, ScoreGauge
      tone.ts           score/situação/variação → tom (ok | warn | bad)
    data/
      api.ts            carrega fontes (JSON local ou API) e valida com zod
      acoes.ts          repositório das ações (localStorage | HTTP)
      hooks.ts          useFontes, useMapa, useAcoes, usePainel (tudo derivado)
    lib/
      types.ts          tipos e schemas zod das fontes
      score.ts          motor do score (porta dos dash.calc do artifact)
      format.ts         formatos pt-BR (R$, %, p.p., datas)
      score.test.ts
    features/
      painel/PernaSelector.tsx
      perna/PernaView.tsx, config.ts
      guia/Guia.tsx
app/api/                pacote reservado (src/index.ts). Sem servidor até ganhar script `dev`
docs/                   especificação do produto
reference/artifact/     código original do artifact, só para consulta
turbo.json              tasks do monorepo
```

## Fluxo de dados

```
app/web/public/data/*.json ──(api.ts + zod)──► Fontes
                                         │
                       calcRotaMes ──────┤  (por rota e mês: indicadores, notas, score, economia)
                                         ├─► calcSaudeRotas   (mês atual, foco, ação do guia)   ┐
                                         ├─► calcKpisTotal     (cartões das pernas, resumo)      │ independem
                                         ├─► calcRegioes / calcZonas (mapas)                     ┘ dos filtros
                       + filtros ────────├─► calcRedeMes       (série mensal por perna)          ┐ recalculam
                                         ├─► calcKpis          (KPIs da perna)                   │ quando o
                                         └─► calcPadroes       (onde se concentra o prejuízo)    ┘ filtro muda
```

`usePainel()` (em `app/web/src/data/hooks.ts`) entrega tudo isso memoizado. Componentes só leem e desenham.

## Convenções

- Texto da interface em português, com os mesmos rótulos do artifact (ver [TELAS.md](TELAS.md)).
- Toda seção tem `id` estável (`perna-coleta`, `kpi-score-coleta`, `rotas-coleta`…) para link direto e testes.
- Número sempre com `font-variant-numeric: tabular-nums` e formato de `lib/format.ts`.
- Cor de situação só por `data-c="ok|warn|bad"` ou `tone`; nunca hex no componente.
- Regra de negócio fica em `lib/score.ts` (função pura e testada), não no componente.
