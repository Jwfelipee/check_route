# app/whatsapp · agente de ocorrências pelo WhatsApp

O motorista conta a ocorrência pelo WhatsApp (texto e foto), o agente pergunta o que falta,
mostra um resumo com os botões **Confirmar** e **Corrigir**, e só depois de "Confirmar"
a ocorrência entra na API (`app/api`). Ninguém precisa instalar aplicativo.

```
Motorista ──WhatsApp──► Meta Cloud API ──webhook──► app/whatsapp (7334) ──► app/api (7333) ──► Postgres
                                 ◄──── respostas / botões ────┘     │
                                                         Claude (agente com ferramentas)
```

## Como o fluxo funciona

1. A mensagem chega em `POST /webhook`. A assinatura `X-Hub-Signature-256` é conferida com o app secret,
   o servidor responde 200 na hora e processa depois (mensagens repetidas pela Meta são ignoradas pelo id).
2. O agente (Claude, `WA_MODELO`, padrão `claude-opus-5-5` com esforço baixo) conversa e usa três ferramentas:
   - `analisar_relato` → `POST /ocorrencias/extrair` da API (a mesma IA de extração do painel, com a última foto);
   - `pedir_confirmacao` → o **código** confere se a ficha está completa e envia o resumo com botões;
   - `listar_hubs` → `GET /rotas` (destinos da transferência).
3. **Não existe ferramenta de registrar.** Quando o motorista aperta *Confirmar* (ou responde "sim"), o código
   grava exatamente a ficha que ele viu em `POST /ocorrencias` e devolve o protocolo. O modelo não consegue
   gravar nada sozinho.
4. Obrigatórios para gravar: tipo, rota (hub), data/hora, trecho, produto e prejuízo estimado
   (os quatro primeiros vêm da API; produto e custo são exigidos por `POST /ocorrencias`).

Detalhes:
- Conversa parada por 6 h recomeça do zero. Estado no Postgres da API, em tabelas `wa_conversa`, `wa_mensagem`, `wa_registro`
  (esta última é a trilha de quem registrou o quê).
- O fallback de servidor do Claude (`fallbacks: "default"`) está ligado: se o modelo recusar uma mensagem,
  a API tenta outro modelo na mesma chamada. Para desligar, tire `betas`/`fallbacks` de `src/agente/claude.ts`.
- Sem `ANTHROPIC_API_KEY` o agente roda em **modo simulado** (regras fixas, mesmo fluxo).
- `WA_NUMEROS_PERMITIDOS` restringe quem pode registrar. Em produção, preencha.
- Áudio ainda não é entendido: o agente pede para escrever (transcrição está no backlog).
- Hoje a API só aceita ocorrências da **transferência** (`POST /ocorrencias`). Para coleta e entrega,
  a API precisa ganhar o mesmo endpoint para essas pernas.

## Reiniciar e atender pelo painel

- **O motorista** pode mandar `reiniciar` (ou `recomeçar`, `novo atendimento`, `#novo`, `cancelar`) a qualquer
  momento: a ficha em andamento é descartada e o agente começa de novo.
- A conversa também recomeça sozinha depois de registrar a ocorrência e depois de 6 h parada (só com o bot;
  conversa com atendente não expira).
- **A aba Atendimentos do painel** (`app/web`) mostra as conversas dos últimos 7 dias, atualizando sozinha, com
  a transcrição, a ficha em andamento e o que falta. Nela dá para:
  - **Assumir conversa**: o agente para de responder e o atendente escreve pelo painel (opcional: avisar o motorista);
  - **Devolver ao bot**: o agente volta, e o que foi conversado com o atendente entra como nota no histórico dele;
  - **Reiniciar conversa**: descarta a ficha e volta para o bot.
- Os endpoints ficam em `/atendimento/*` e exigem `Authorization: Bearer <WA_ADMIN_TOKEN>`.
  Sem `WA_ADMIN_TOKEN`, respondem 503. O painel pede o token na tela e guarda só no navegador.
  No build do painel, `VITE_WA_URL` aponta para este app (ex.: `https://checkroute-whatsapp.wfelipe.com.br`).
- A transcrição fica na tabela `wa_evento` (motorista, bot, atendente e eventos do sistema).
- Atenção à janela de 24 h da Meta: o atendente só consegue mandar texto livre se o motorista escreveu nas últimas 24 h
  (o painel avisa).

## Configurar a Meta (uma vez)

No [developers.facebook.com](https://developers.facebook.com), no seu app com o produto **WhatsApp**:

1. **WhatsApp → API Setup**: copie o **Phone number ID** → `META_PHONE_NUMBER_ID`.
2. **Token**: crie um *System User* no Business Manager com permissões `whatsapp_business_messaging` e
   `whatsapp_business_management` e gere um token permanente → `META_ACCESS_TOKEN`.
   (O token temporário da tela de API Setup vence em 24 h; serve só para testar.)
3. **App settings → Basic → App secret** → `META_APP_SECRET`.
4. Invente um texto para `META_VERIFY_TOKEN`.
5. Exponha o webhook com HTTPS (a Meta não aceita `localhost`), por exemplo:
   ```bash
   ngrok http 7334
   ```
6. **WhatsApp → Configuration → Webhook**: *Callback URL* = `https://<seu-túnel>/webhook`,
   *Verify token* = o mesmo `META_VERIFY_TOKEN`. Clique em *Verify and save* e assine o campo **messages**.
7. Em modo de desenvolvimento, cadastre o celular de teste em *API Setup → To* (só números cadastrados recebem).
8. Use em `META_GRAPH_VERSION` a mesma versão da sua collection do Postman.

> A janela de atendimento é de 24 h: o agente só responde texto livre a quem escreveu nas últimas 24 h.
> Mensagens ativas (o sistema chamar o motorista primeiro) exigem templates aprovados; não fazem parte deste app.

## Rodar

Com Docker (raiz do monorepo), com as variáveis da Meta exportadas ou num `.env` na raiz:
```bash
docker compose up -d --build whatsapp
```

Fora do Docker:
```bash
cp app/whatsapp/.env.example app/whatsapp/.env   # preencha
npm run dev -w app/whatsapp
```

## Testar sem a Meta

Sem `META_ACCESS_TOKEN` (ou com `META_DRY_RUN=1`), nada é enviado: as respostas aparecem no log.
```bash
META_DRY_RUN=1 npm run dev -w app/whatsapp        # terminal 1 (API rodando em 7333)
npm run simular -w app/whatsapp                   # terminal 2: relato incompleto → completa → confirma
npm run simular -w app/whatsapp -- "Bati o caminhão na Dutra"
npm run simular -w app/whatsapp -- --confirmar
npm test -w app/whatsapp
```

## Arquivos

| Arquivo | O que faz |
|---|---|
| `src/server.ts` | Fastify: verificação e recebimento do webhook |
| `src/meta/webhook.ts` | assinatura HMAC e leitura do payload da Meta |
| `src/meta/client.ts` | envio de texto/botões, "lida + digitando", download de mídia |
| `src/agente/index.ts` | orquestra cada mensagem; confirmação e registro (código, não modelo) |
| `src/agente/claude.ts` | loop do agente com Claude (tool use) |
| `src/agente/ferramentas.ts` | ferramentas e o que cada uma pode fazer |
| `src/agente/ficha.ts` | obrigatórios e resumo para o motorista conferir |
| `src/agente/simulado.ts` | agente sem IA |
| `src/estado.ts` | conversas, transcrição, deduplicação e trilha no Postgres |
| `src/atendimento.ts` | endpoints do painel de atendimentos (token) |
| `src/api.ts` | cliente da `app/api` |
| `scripts/simular.ts` | motorista de mentira para teste local |
