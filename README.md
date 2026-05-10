# FLASHSTOCK

Estrutura inicial do projeto baseada no Master SDD, usando Next.js (App Router) e organização de domínio para a Fase 1.

## Stack

- Next.js 16 + React 19
- TypeScript
- ESLint
- Supabase (schema SQL inicial em `supabase/migrations`)

## Rodando localmente

1. Instale dependências:
```bash
npm install
```
2. Copie `.env.example` para `.env.local` e preencha as chaves.
3. Rode:
```bash
npm run dev
```

## Estrutura inicial criada

- `src/core/domain`: entidades e regras de negócio (PVPS e status de lote)
- `src/core/application/use-cases`: casos de uso de entrada e saída
- `src/core/ports`: contratos de repositório para infraestrutura
- `src/infra/repositories`: implementação dos repositórios com Supabase
- `src/app/api`: endpoints HTTP da Fase 1
- `supabase/migrations/0001_initial_schema.sql`: schema base multi-tenant

## Endpoints iniciais

- `POST /api/organizations`
- `POST /api/establishments`
- `POST /api/categories`
- `POST /api/products`
- `POST /api/batches/inbound`
- `POST /api/batches/outbound`
- `PATCH /api/batches/<batchId>` (quarentena e correção de validade com auditoria)
- `GET /api/products/list?organizationId=<uuid>`
- `GET /api/batches/list?establishmentId=<uuid>&productId=<uuid>&status=alert`
- `GET /api/dashboard/summary?establishmentId=<uuid>`
- `GET /api/inventory-movements?establishmentId=<uuid>&page=1&pageSize=20&movementType=exit_loss&from=2026-01-01&to=2026-01-31`
- `GET /api/audit-logs?establishmentId=<uuid>&page=1&pageSize=20&entityType=batch&entityId=<uuid>`

## RBAC básico (API)

- Header obrigatório nas rotas protegidas: `x-user-id: <uuid>`
- Permissões implementadas:
  - `inventory.read`
  - `inventory.write`
  - `movements.read`
  - `movements.write`
  - `audit.read`
  - `admin.manage`
- Rotas com proteção por `establishmentId`:
  - `GET /api/dashboard/summary`
  - `GET /api/batches/list`
  - `GET /api/inventory-movements`
  - `GET /api/audit-logs`
  - `POST /api/batches/inbound`
  - `POST /api/batches/outbound`
  - `PATCH /api/batches/<batchId>`

## Seed RBAC de exemplo

- Arquivo: `supabase/seeds/0001_rbac_seed.sql`
- Cria/garante roles `admin` e `operador`
- Mapeia permissões:
  - `admin`: todas
  - `operador`: `inventory.read`, `inventory.write`, `movements.read`, `movements.write`
- Vincula usuários exemplo em `user_roles`
- Antes de rodar, substitua os UUIDs placeholder no topo do arquivo

## Seed de dados de inventário (teste rápido)

- Arquivo: `supabase/seeds/0002_sample_inventory.sql`
- Cria dados mínimos:
  - Categoria `Laticinios`
  - Produto `Leite Integral 1L`
  - Lote `L2026A` com validade próxima (janela de alerta)
  - Movimento `entry_purchase`
- Use os mesmos UUIDs do seed RBAC para manter consistência

## Ordem sugerida de execução

1. Migrations `0001` até `0007`
2. `supabase/seeds/0001_rbac_seed.sql`
3. `supabase/seeds/0002_sample_inventory.sql`

## Checklist de validação da API

1. `GET /api/dashboard/summary?establishmentId=<uuid>` com header `x-user-id`
2. `GET /api/batches/list?establishmentId=<uuid>&status=alert`
3. `GET /api/inventory-movements?establishmentId=<uuid>`
4. `GET /api/audit-logs?establishmentId=<uuid>`

## Coleção HTTP pronta

- Arquivo: `docs/api.http`
- Compatível com REST Client (VS Code) e IDEs JetBrains.
- Ajuste as variáveis no topo (`baseUrl`, UUIDs) antes de executar.

## Próximos passos

1. Implementar repositórios Supabase para os `ports`.
2. Criar endpoints (`/api`) para entrada/saída e cadastro.
3. Adicionar autenticação e RBAC.

## CI/CD (deploy automatizado)

Foi adicionado o workflow `/.github/workflows/deploy.yml` com este fluxo:

1. Em `pull_request` para `main`:
- roda `npm ci`
- roda `npm run lint`
- roda `npm run test`
- roda `npm run build`
- publica deploy de preview na Vercel

2. Em `push` para `main`:
- roda as mesmas validacoes
- publica deploy de producao na Vercel

3. Em `workflow_dispatch`:
- permite disparo manual no GitHub Actions

Secrets necessarios no repositorio GitHub:

1. `VERCEL_TOKEN`
2. `VERCEL_ORG_ID`
3. `VERCEL_PROJECT_ID`
