# Saúde das rotas · dashboard (Hackathon ETEG 2026, Equipe 3)

Projeto para construir, como app próprio, o dashboard que nasceu como artifact no Claude
("Saúde das rotas"): um score de 0 a 100 por rota em cada perna da operação logística
(**coleta → transferência → entrega**), o prejuízo com ocorrências, onde ele se concentra,
a ação sugerida a partir de um guia de boas práticas e o acompanhamento dessas ações.

## Rodar

Na raiz do monorepo:

```bash
npm install
docker compose up -d --build                # Postgres (7432) + API (http://localhost:7333) + MCP (7335)
docker compose run --rm api npm run etl     # (uma vez) planilha bronze docs/bronze_planilha.xlsx → Postgres
docker compose restart api                  # a API passa a ler o gold
npm run dev -w app/web                      # painel em http://localhost:5173
npm test                                    # testes do motor do score
npm run build
npm run typecheck
```

Sem configurar nada, o app lê os dados fictícios de `app/web/public/data/`. Para ligar na API,
copie `app/web/.env.example` para `app/web/.env` e preencha `VITE_API_URL=http://localhost:7333`
(contrato em [docs/DADOS.md](docs/DADOS.md)).

Para desenvolver a API fora do Docker: `docker compose up -d db`, copie `app/api/.env.example` para
`app/api/.env` e rode `npm run dev` na raiz (o Turborepo sobe web e API juntos, API na porta 7333).

### API (`app/api`)

Fastify + TypeScript + **PostgreSQL 17** (driver `pg`), empacotada em Docker (`app/api/Dockerfile`, `docker-compose.yml`).

- Serve o contrato de `docs/DADOS.md`. Lê o **gold** gerado da planilha bronze quando `npm run etl` já rodou
  e, se não, os JSON de `app/web/public/data`. `GET /health` diz qual fonte está ativa.
- Guarda as ações validadas (`/acoes`) e as ocorrências confirmadas na demo.
- Roda a IA do recorte: relato vira ficha (`POST /ocorrencias/extrair`) e ação sugerida do guia (`POST /acoes/sugerir`).
  Usa **Claude Haiku 5.5** na extração e **Claude Sonnet 5.5** na ação. Sem `ANTHROPIC_API_KEY` a extração cai no modo simulado,
  mas **a ação sugerida exige a chave** (não existe sugestão sem IA): sem ela a tela mostra o erro com "Tentar de novo".
  A ação parte do guia de boas práticas e consulta os dados da rota no servidor MCP (`MCP_URL`).

### MCP (`app/mcp`)

Servidor MCP só de leitura (porta 7335, `docker compose up -d --build mcp`) com os dados específicos de cada rota (horário, trecho,
clima, veículos, atrasos, comparação, ações anteriores). Conecta ao Postgres com o papel `checkroute_leitura` (acesso mínimo) e
cada conexão traz um token de escopo: o WhatsApp só enxerga as rotas do contato que está conversando.
`npm run mcp:smoke -w app/mcp` chama as ferramentas na T02; `npm test -w app/mcp` roda os testes de escopo.
- Configuração: copie `app/api/.env.example` para `app/api/.env`.

| Comando | O que faz |
|---|---|
| `docker compose run --rm api npm run etl` | lê `docs/bronze_planilha.xlsx` e grava `bronze_*` e `gold_*` no Postgres |
| `docker compose run --rm api npm run etl:check` | compara o gold com os JSON do front, campo a campo |
| `docker compose run --rm api npm run eval` | mede o acerto da IA classificando os relatos reais do SAC (gabarito da bronze) |
| `docker compose run --rm api npm run seguranca` | passa 4 relatos com instrução maliciosa pela extração e confere que a IA não obedeceu |
| `docker compose run --rm api npm test` | testes de privacidade, guardas, ferramentas da ação e cenário de acidentes |

Fora do Docker, os mesmos comandos são `npm run etl -w app/api`, `npm run etl:check -w app/api` e `npm run eval -w app/api`.
Para a IA real, exporte `ANTHROPIC_API_KEY` antes do `docker compose up` (ou ponha em `app/api/.env` fora do Docker).

### Roteiro de chamadas da demo (Transferência)

```bash
# 1. relato incompleto: a IA devolve o que falta perguntar ao motorista
curl -s -XPOST localhost:7333/ocorrencias/extrair -H 'content-type: application/json' \
  -d '{"relato":"Tombou o caminhão, a carga de geladeiras ficou toda espalhada"}'

# 2. relato completo (pode mandar imagemBase64 da foto): ficha pronta para revisar
curl -s -XPOST localhost:7333/ocorrencias/extrair -H 'content-type: application/json' \
  -d '{"relato":"Hoje 03:40 a carreta ABC1D23 indo pro hub de Belo Horizonte tombou na BR-381 km 512, pista molhada, sem feridos. 40 caixas de geladeira, prejuízo uns R$ 38.000"}'

# 3. a pessoa confirma a ficha (campos de "ficha" da resposta anterior) e ela entra na base
curl -s -XPOST localhost:7333/ocorrencias -H 'content-type: application/json' -d '<ficha revisada>'

# 4. ação sugerida para o padrão da rota, com os números que o front calculou
curl -s -XPOST localhost:7333/acoes/sugerir -H 'content-type: application/json' \
  -d '{"rota_id":"T02","foco":"ocorr_100","tipo_mais_caro":"Tombamento","numeros":{"score":58,"n_tipo":3,"tipo":"Tombamento","produto":"Eletrodomésticos"}}'
# (com "contexto":"..." a IA gera outra versão considerando o que a pessoa disse)

# 5. custo e latência de cada chamada de IA
curl -s localhost:7333/ia/uso
```

No front, depois do `POST /ocorrencias`, invalide a query `['fontes']` para o score da rota recalcular.

### Agente de WhatsApp (`app/whatsapp`)

O motorista manda texto e foto pelo WhatsApp; o agente (Claude com ferramentas) usa `POST /ocorrencias/extrair`,
pergunta o que falta e mostra o resumo com os botões Confirmar e Corrigir. Só o botão Confirmar grava
(`POST /ocorrencias`). Webhook na porta 7334: `docker compose up -d --build whatsapp`.
Configuração da Meta, teste sem a Meta (`npm run simular -w app/whatsapp`) e detalhes em [app/whatsapp/README.md](app/whatsapp/README.md).

## Monorepo

```
app/web       painel React (Vite): código, dados fictícios e testes
app/api       API Fastify: contrato, ações, IA do recorte e ETL da planilha bronze
app/whatsapp  agente de WhatsApp (Meta Cloud API + Claude): motorista relata a ocorrência e ela entra na API
docs/         especificação do produto
reference/    artifact original, só para consulta
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
| Identidade CheckRoute (design system v1.0): menu lateral, Visão geral, tokens, Montserrat | ✅ [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md) |
| API com o contrato, ações persistidas e ETL da bronze (gold idêntico aos JSON) | ✅ `app/api` |
| IA: relato → ficha, ação sugerida por IA (guia + dados da rota via MCP, práticas citadas, "Dar detalhes"), registro de custo, eval com gabarito | ✅ `app/api` |
| Servidor MCP só de leitura com escopo por remetente; contatos do WhatsApp cadastrados no painel | ✅ `app/mcp`, `app/api`, `app/whatsapp` |
| Dados pessoais mascarados e guardas contra prompt injection (com testes) | ✅ `app/api` |
| Acidentes plantados na T02 (BR-381) para a demo | ✅ cenário do ETL |
| Mapas (zona da cidade / região do Brasil), gráfico mês a mês, detalhe completo da rota, ações em acompanhamento + modal | ✅ |
| Telas de Ocorrências, Ações (sugestão por IA, dar detalhes, validar, descartar, histórico) e Contatos | ✅ [docs/TELAS.md](docs/TELAS.md) §6–8 |

## Documentação

- [docs/ARQUITETURA.md](docs/ARQUITETURA.md): stack, por que cada escolha, estrutura de pastas e fluxo de dados.
- [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md): cores, tipografia, espaçamento, componentes e regras de gráfico.
- [docs/TELAS.md](docs/TELAS.md): especificação de cada seção da página (com ids e textos), incluindo `#perna-coleta`.
- [docs/DADOS.md](docs/DADOS.md): fontes, campos, regras do score e contrato da API.
- [docs/BACKLOG.md](docs/BACKLOG.md): o que falta, dividido em tarefas para o time.
- `reference/artifact/`: código original do artifact (HTML, cálculos, desenhos, mapa) para consulta. **Não é importado pelo app.**

Todos os números são fictícios, gerados para o protótipo. Nenhum dado real de cliente.
