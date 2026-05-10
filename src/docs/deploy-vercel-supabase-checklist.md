# Deploy Checklist - Vercel + Supabase

## 1) Variaveis de ambiente obrigatorias

Configure as variaveis abaixo em **Vercel Project Settings > Environment Variables** para `Production`, `Preview` e `Development`:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Estas duas variaveis sao obrigatorias porque o app valida ambas em `src/lib/env.ts` no boot.

## 2) Coerencia de ambientes

- `NEXT_PUBLIC_SUPABASE_URL` deve apontar para o projeto Supabase correto de cada ambiente.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` deve ser a chave anon do mesmo projeto.
- Nunca usar `service_role` no frontend ou em variavel `NEXT_PUBLIC_*`.

## 3) Supabase Auth e cookies

- O login define cookies HTTP-only (`ve_access_token`, `ve_refresh_token`).
- Em producao, os cookies sao `secure` automaticamente quando `NODE_ENV=production`.
- Verifique no Supabase Auth a URL publica do app em:
  - `Site URL`
  - `Additional Redirect URLs` (quando houver fluxos adicionais)

## 4) Passos de deploy

1. Conectar repositorio no Vercel.
2. Definir Root Directory do projeto (raiz onde esta `package.json`).
3. Adicionar variaveis de ambiente.
4. Fazer deploy e validar:
   - Login
   - Carregamento de estabelecimentos
   - Dashboard semaforo
   - Filtros e atualizacao de lotes
