# Backlog

Tarefas independentes, cada uma pode ir para uma pessoa. Especificação de cada uma em [TELAS.md](TELAS.md);
código de referência em `reference/artifact/sr_view.js` (nome do `dash.draw` entre parênteses).

| # | Tarefa | Onde | Referência | Esforço |
|---|---|---|---|---|
| 1 | `ComboChart` barras + linha (mês a mês) com tooltip | `design-system/components/`, usar em `PernaView` §3.9 | `rede` | M |
| 2 | `MapaCidade` (zonas) com clique que filtra `zona_*` | `features/perna/` + `useMapa()` | `mapacidade` | M |
| 3 | `MapaBrasil` (regiões) com clique que filtra `regiao` | `features/perna/` | `mapa` | P |
| 4 | Filtro de Região (coleta/entrega) restringindo os estados | `PernaView` filtros | `ufsel` | P |
| 5 | Detalhe da rota: hero (gauge + barras das premissas + células), `MiniLine` 6 meses, ocorrências por tipo | `features/perna/RotaCard.tsx` | `rotas`, `cartao`, `miniScore` | G |
| 6 | Ações: tabela, modal de validação, concluir/cancelar (usar `acoesRepo` + `useAcoes`, invalidar a query ao salvar) | `features/acoes/` | `acoes`, `blocoAcao` | M |
| 7 | Link "ver no guia" que abre a aba e destaca a prática | `Guia.tsx`, `store.ts` | `guia` | P |
| 8 | Backend opcional servindo os recursos de [DADOS.md](DADOS.md). O `radar.db` do projeto `hackatown` pode alimentar `/ocorrencias` | `app/api` (já no workspace; ainda sem servidor nem script `dev`) | — | M |
| 9 | Teste visual rápido em 400 px de largura e revisão de acessibilidade (foco, aria) | todo o app | — | P |

P = até 1 h · M = 1–3 h · G = meio dia.
