# Edge Functions

API serverless baseada em Supabase Edge Functions para gerenciamento de posts.

## Estrutura

- `supabase/functions/`: endpoints (`create_post`, `update_post`, `delete_post`, `load_post`, `load_cards`)
- `supabase/lib/`: utilitarios compartilhados do runtime Deno
- `../shared/`: contratos, tipos e constantes compartilhadas com os frontends

Cada function possui `deno.json` com import map para `@shared/`.

## Variaveis de ambiente

Obrigatorias para execucao das functions:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `REQUEST_PASSWORD`

`REQUEST_PASSWORD` e um segredo operacional usado para operacoes administrativas (create/update/delete). Nao manter senha hardcoded no codigo.

## Comandos uteis

- Validar function:
	- `deno check supabase/functions/create_post/index.ts`
- Servir localmente:
	- `npx supabase functions serve`
- Deploy:
	- `npx supabase functions deploy`

## Convencoes

- Contratos de resposta/request devem ficar em `../shared/contracts`.
- Regras de dominio reutilizaveis devem ficar em `../shared/domain`.
- Constantes de storage devem vir de `../shared/constants/storage.ts`.
- Mensagens de UI nao devem ser usadas como contrato; usar codigos de erro/sucesso compartilhados.
