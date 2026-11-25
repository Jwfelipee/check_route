# Saúde das rotas · dashboard (Hackathon ETEG 2026, Equipe 3)

Projeto para construir, como app próprio, o dashboard que nasceu como artifact no Claude
("Saúde das rotas"): um score de 0 a 100 por rota em cada perna da operação logística
(**coleta → transferência → entrega**), o prejuízo com ocorrências, onde ele se concentra,
a ação sugerida a partir de um guia de boas práticas e o acompanhamento dessas ações.

## Rodar

Na raiz do monorepo:

```bash
npm install
npm run dev        # app web em http://localhost:5173  (abre direto numa perna: /#perna-coleta)
npm test           # testes do motor do score
npm run build
npm run typecheck
```

O Turborepo roda cada script só no pacote que o define. `dev`, `test` e `preview` existem em `app/web`. `build` e `typecheck` também passam por `app/api`.

Sem configurar nada, o app lê os dados fictícios de `app/web/public/data/`. Para ligar numa API,
copie `app/web/.env.example` para `app/web/.env` e preencha `VITE_API_URL` (contrato em [docs/DADOS.md](docs/DADOS.md)).

## Monorepo

```
app/web     painel React (Vite): código, dados fictícios e testes
app/api     pacote reservado, ainda sem servidor. Com um script `dev`, `npm run dev` sobe os dois
docs/       especificação do produto
reference/  artifact original, só para consulta
```

## O que já está pronto e o que falta

| Bloco | Situação |
|---|---|
| Motor do score (8 cálculos portados do artifact) + testes | ✅ `app/web/src/lib/score.ts` |
| Camada de dados (JSON local ou API, validação zod) | ✅ `app/web/src/data/` |
| Design system: tokens, base, componentes | ✅ `app/web/src/design-system/` |
| Cabeçalho, abas, resumo, seletor de pernas com contagiro | ✅ |
| Por perna: filtros, 5 KPIs, lista de rotas com ação sugerida, padrões de prejuízo, ranking, premissas | ✅ (versão inicial) |
| Aba Guia de boas práticas | ✅ |
| Mapas (zona da cidade / região do Brasil), gráfico mês a mês, detalhe completo da rota, ações em acompanhamento + modal | ⏳ ver [docs/BACKLOG.md](docs/BACKLOG.md) |

## Documentação

- [docs/ARQUITETURA.md](docs/ARQUITETURA.md): stack, por que cada escolha, estrutura de pastas e fluxo de dados.
- [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md): cores, tipografia, espaçamento, componentes e regras de gráfico.
- [docs/TELAS.md](docs/TELAS.md): especificação de cada seção da página (com ids e textos), incluindo `#perna-coleta`.
- [docs/DADOS.md](docs/DADOS.md): fontes, campos, regras do score e contrato da API.
- [docs/BACKLOG.md](docs/BACKLOG.md): o que falta, dividido em tarefas para o time.
- `reference/artifact/`: código original do artifact (HTML, cálculos, desenhos, mapa) para consulta. **Não é importado pelo app.**

Todos os números são fictícios, gerados para o protótipo. Nenhum dado real de cliente.
