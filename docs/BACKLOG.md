# Backlog

Tarefas independentes, cada uma pode ir para uma pessoa. Especificação de cada uma em [TELAS.md](TELAS.md);
código de referência em `reference/artifact/sr_view.js` (nome do `dash.draw` entre parênteses).

| # | Tarefa | Onde | Referência | Esforço |
|---|---|---|---|---|
| 4 | Filtro de Região (coleta/entrega) restringindo os estados | `PernaView` filtros | `ufsel` | P |
| 9 | Revisão de acessibilidade com leitor de tela (o layout já foi conferido em 375 px) | todo o app | — | P |
| 12 | Eval da extração com gabarito campo a campo (10 a 20 relatos de acidente) e avaliador automático (LLM-as-judge) das ações sugeridas | `app/api/scripts/` | `pendencias.md` (ponto 5) | M |
| 14 | Usar o MCP também no Claude Desktop (escopo `painel`) e dar ao agente de WhatsApp perguntas mais ricas sobre a rota | `app/mcp`, `app/whatsapp` | — | M |
| 15 | Segunda barreira de acesso: RLS no Postgres com `app.rotas_permitidas` por sessão do MCP | `app/api/src/db.ts` | — | M |
| 13 | Rodar `eval` e `seguranca` com a chave real e registrar os números em `tecnicas-e-criterios.md` | `app/api` | — | P |

**Feitos:** 1 (mês a mês), 2 e 3 (mapas), 5 (detalhe da rota), 6 (ações e modal), 7 (ver no guia), 8 (API + ETL),
10 (tela de ocorrências), 11 (sugerir com IA). Ver [TELAS.md](TELAS.md).

P = até 1 h · M = 1–3 h · G = meio dia.
