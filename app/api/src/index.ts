/**
 * Lugar reservado para a API do painel.
 *
 * O app em `app/web` funciona lendo os JSON de `public/data`.
 * O contrato (rotas, operação, ocorrências, premissas, práticas, referência e ações)
 * está em `docs/DADOS.md`. Quando este pacote passar a servir esse contrato,
 * acrescente um script `dev` aqui: o `npm run dev` da raiz sobe web e API juntos.
 *
 * O front já lê `VITE_API_URL` de `app/web/.env`.
 */
export const api = {
  pronta: false,
  contrato: 'docs/DADOS.md',
} as const;
