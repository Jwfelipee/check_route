# Saúde das rotas · dashboard (Hackathon ETEG 2026, Equipe 3)

Projeto para construir, como app próprio, o dashboard que nasceu como artifact no Claude
("Saúde das rotas"): um score de 0 a 100 por rota em cada perna da operação logística
(**coleta → transferência → entrega**), o prejuízo com ocorrências, onde ele se concentra,
a ação sugerida a partir de um guia de boas práticas e o acompanhamento dessas ações.

## Rodar

Na raiz do monorepo:

```bash
npm install
npm run etl -w app/api   # (uma vez) planilha bronze → banco SQLite da API
npm run dev              # web em http://localhost:5173 e API em http://localhost:3333
npm test                 # testes do motor do score
npm run build
npm run typecheck
```

O Turborepo roda cada script só no pacote que o define. `dev` sobe web e API juntos.

Sem configurar nada, o app lê os dados fictícios de `app/web/public/data/`. Para ligar na API,
copie `app/web/.env.example` para `app/web/.env` e preencha `VITE_API_URL=http://localhost:3333`
(contrato em [docs/DADOS.md](docs/DADOS.md)).

### API (`app/api`)

Fastify + TypeScript + SQLite nativo do Node 24 (`node:sqlite`).

- Serve o contrato de `docs/DADOS.md`. Lê o **gold** gerado da planilha bronze quando `npm run etl` já rodou
  e, se não, os JSON de `app/web/public/data`. `GET /health` diz qual fonte está ativa.
- Guarda as ações validadas (`/acoes`) e as ocorrências confirmadas na demo.
- Roda a IA do recorte: relato vira ficha (`POST /ocorrencias/extrair`) e ação sugerida do guia (`POST /acoes/sugerir`).
  Usa **Claude Haiku 5.5** na extração e **Claude Sonnet 5.5** na ação. Sem `ANTHROPIC_API_KEY`, entra o modo simulado.
- Configuração: copie `app/api/.env.example` para `app/api/.env`.

| Comando | O que faz |
|---|---|
| `npm run etl -w app/api` | lê `docs/bronze_planilha.xlsx` (ou `app/api/data/bronze/`), grava `bronze_*` e `gold_*` em `app/api/data/app.db` |
| `npm run etl:check -w app/api` | compara o gold com os JSON do front, campo a campo |
| `npm run eval -w app/api` | mede o acerto da IA classificando os relatos reais do SAC (gabarito da bronze) |

### Roteiro de chamadas da demo (Transferência)

```bash
# 1. relato incompleto: a IA devolve o que falta perguntar ao motorista
curl -s -XPOST localhost:3333/ocorrencias/extrair -H 'content-type: application/json' \
  -d '{"relato":"Tombou o caminhão, a carga de geladeiras ficou toda espalhada"}'

# 2. relato completo (pode mandar imagemBase64 da foto): ficha pronta para revisar
curl -s -XPOST localhost:3333/ocorrencias/extrair -H 'content-type: application/json' \
  -d '{"relato":"Hoje 03:40 a carreta ABC1D23 indo pro hub de Belo Horizonte tombou na BR-381 km 512, pista molhada, sem feridos. 40 caixas de geladeira, prejuízo uns R$ 38.000"}'

# 3. a pessoa confirma a ficha (campos de "ficha" da resposta anterior) e ela entra na base
curl -s -XPOST localhost:3333/ocorrencias -H 'content-type: application/json' -d '<ficha revisada>'

# 4. ação sugerida para o padrão da rota, com os números que o front calculou
curl -s -XPOST localhost:3333/acoes/sugerir -H 'content-type: application/json' \
  -d '{"rota_id":"T02","foco":"ocorr_100","tipo_mais_caro":"Tombamento","numeros":{"score":58,"n_tipo":3,"tipo":"Tombamento","produto":"Eletrodomésticos"}}'

# 5. custo e latência de cada chamada de IA
curl -s localhost:3333/ia/uso
```

No front, depois do `POST /ocorrencias`, invalide a query `['fontes']` para o score da rota recalcular.

## Monorepo

```
app/web     painel React (Vite): código, dados fictícios e testes
app/api     API Fastify: contrato, ações, IA do recorte e ETL da planilha bronze
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
| API com o contrato, ações persistidas e ETL da bronze (gold idêntico aos JSON) | ✅ `app/api` |
| IA: relato → ficha, ação sugerida do guia, registro de custo, eval com gabarito | ✅ `app/api` (falta a tela no front) |
| Mapas (zona da cidade / região do Brasil), gráfico mês a mês, detalhe completo da rota, ações em acompanhamento + modal | ⏳ ver [docs/BACKLOG.md](docs/BACKLOG.md) |

## Documentação

- [docs/ARQUITETURA.md](docs/ARQUITETURA.md): stack, por que cada escolha, estrutura de pastas e fluxo de dados.
- [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md): cores, tipografia, espaçamento, componentes e regras de gráfico.
- [docs/TELAS.md](docs/TELAS.md): especificação de cada seção da página (com ids e textos), incluindo `#perna-coleta`.
- [docs/DADOS.md](docs/DADOS.md): fontes, campos, regras do score e contrato da API.
- [docs/BACKLOG.md](docs/BACKLOG.md): o que falta, dividido em tarefas para o time.
- `reference/artifact/`: código original do artifact (HTML, cálculos, desenhos, mapa) para consulta. **Não é importado pelo app.**

Todos os números são fictícios, gerados para o protótipo. Nenhum dado real de cliente.
