# API SDD v1 - VIGIA-ESTOQUE

## 1) Padrões de API
- Base: `app/api/**/route.ts` (Next.js Route Handlers).
- Auth: sessão obrigatória; autorização por `establishmentId` e permissão granular.
- Formato de resposta:
  - Sucesso: `{ data: ... }` ou `{ ok: true }`
  - Erro de domínio/validação: `4xx` com `error` e, quando aplicável, `code`.
- Multi-tenant:
  - Escopo principal por `establishment_id`.
  - Catálogo (`products`, `categories`) escopado por `organization_id`.

## 2) Endpoints já existentes (estado atual)

## 2.1 Auth
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/session`

## 2.2 Estrutura organizacional
- `POST /api/organizations`
  - Body: `{ name }`
- `POST /api/establishments`
  - Body: `{ organizationId, name }`

## 2.3 Catálogo
- `POST /api/categories`
  - Body: `{ establishmentId, organizationId, name, leadTimeAlertDays }`
- `GET /api/categories/list?organizationId=...&establishmentId=...`
- `POST /api/products`
  - Body: `{ establishmentId, organizationId, categoryId, sku, name, uom, minimumStock }`
- `GET /api/products/list?organizationId=...&establishmentId=...`

## 2.4 Lotes e movimentação
- `POST /api/batches/inbound`
  - Body: `{ establishmentId, productId, lotCode, expiryDate, quantity, locationId?, actorUserId? }`
  - `costPrice` opcional para compatibilidade legada; quando ausente, o backend persiste `0`.
- `POST /api/batches/outbound`
  - Body: `{ establishmentId, productId, quantity, selectedBatchId, reasonCode?, actorUserId?, movementType }`
  - `movementType`: `exit_sale | exit_loss | adjustment`
- `GET /api/batches/list?establishmentId=...&productId?=...&status?=...`
  - `status`: `active | alert | expired | quarantine`
- `PATCH /api/batches/[batchId]`
  - Body: `{ establishmentId, expectedVersion?, quarantined?, expiryDate?, merge? }`
  - Retorna `409 OPTIMISTIC_CONFLICT` quando há concorrência otimista.

## 2.5 Auditoria e painel
- `GET /api/inventory-movements?establishmentId=...&page?=...&pageSize?=...&movementType?=...&from?=...&to?=...`
- `GET /api/audit-logs?establishmentId=...&page?=...&pageSize?=...&entityType?=...&entityId?=...`
- `GET /api/dashboard/summary?establishmentId=...`
  - Retorna: `{ critical, warning, replenishment }`

## 2.6 Administração (RBAC e governança)
- `GET /api/admin/users?establishmentId=...`
- `PATCH /api/admin/users`
  - Body: `{ establishmentId, userId, roleId }`
  - `roleId = null` remove vínculo do usuário no estabelecimento.
- `GET /api/admin/invitations?establishmentId=...`
- `POST /api/admin/invitations`
  - Body: `{ establishmentId, email, roleId, expiresAt? }`
- `PATCH /api/admin/invitations`
  - Body: `{ establishmentId, invitationId }` (revoga convite)
- `POST /api/admin/invitations/accept`
  - Body: `{ invitationId }`
  - Sessao autenticada obrigatoria; o email da sessao deve coincidir com o email do convite.
  - Efeito: vincula/atualiza `user_roles` para o usuario autenticado no estabelecimento e marca convite como `accepted`.

## 3) Aderência ao Master SDD
- RN01 PVPS: implementado no fluxo de saída, com exigência de `reasonCode` fora do lote sugerido.
- RN02 Status de lote: implementado em `computeBatchStatus` e usado em listagem.
- RN03 Integridade:
  - Saldo negativo bloqueado em saída.
  - Alterações de `expiryDate` e `quarantine` geram `audit_logs`.
- Concorrência multi-admin:
  - `expectedVersion` + `version` em `PATCH /batches/[batchId]`.

## 4) Lacunas para fechar 100% do SDD
- Snooze de alerta (24h/48h) com trava para lote vencido.
- Feed de atividade recente (últimas 20 ações em linguagem de negócio).
- Arquivamento automático de lotes zerados após 7 dias.
- Endpoint de sugestão PVPS explícito para UI de saída assistida.

## 5) Proposta de endpoints (próximas fases)

## 5.1 PVPS assistido
- `GET /api/batches/pvps-suggestion?establishmentId=...&productId=...`
- Resposta:
```json
{
  "data": {
    "suggestedBatchId": "uuid",
    "expiryDate": "2026-05-20",
    "availableQuantity": 12,
    "alternatives": [{ "batchId": "uuid", "expiryDate": "2026-06-01", "quantity": 8 }]
  }
}
```

## 5.2 Snooze
- `POST /api/alerts/snooze`
- Body: `{ establishmentId, batchId, hours: 24 | 48, reason? }`
- Regras:
  - Se lote `expired`, retornar `422` (`SNOOZE_NOT_ALLOWED_FOR_EXPIRED`).
  - Registrar em `audit_logs`.

## 5.3 Feed recente
- `GET /api/activity-feed?establishmentId=...&limit=20`
- Resposta:
```json
{
  "data": [
    {
      "at": "2026-05-09T22:10:00.000Z",
      "actorName": "Marcos",
      "actorRole": "Admin",
      "action": "discarded",
      "message": "Marcos descartou 5kg de Carne Moida (Lote #102) por vencimento.",
      "references": { "batchId": "uuid", "productId": "uuid", "movementId": "uuid" }
    }
  ]
}
```

## 5.4 Histórico (arquivamento)
- `GET /api/batches/history?establishmentId=...&page?=...`
- Job diário:
  - Marca como arquivado lote com `quantity_current = 0` e `updated_at <= now() - 7 dias`.

## 5.5 Relatório de perdas
- `GET /api/reports/losses?establishmentId=...&from=YYYY-MM-DD&to=YYYY-MM-DD`
- Retorno:
  - total de perdas, custo acumulado e quebra por produto/categoria.

## 6) Contratos de erro recomendados
- `400 BAD_REQUEST` - payload/query inválido.
- `401 UNAUTHORIZED` - sessão ausente/inválida.
- `403 FORBIDDEN` - sem permissão no estabelecimento.
- `404 NOT_FOUND` - entidade não encontrada no tenant.
- `409 OPTIMISTIC_CONFLICT` - concorrência.
- `422 BUSINESS_RULE_VIOLATION` - regra de domínio (ex.: PVPS sem reason, snooze em vencido, saldo insuficiente).
- `422 INVITATION_EXPIRED` - convite expirado no momento do aceite.

## 7) Ordem de implementação recomendada
1. `GET /batches/pvps-suggestion` (acelera UX de saída).
2. `POST /alerts/snooze` + query de alertas já filtrada.
3. `GET /activity-feed`.
4. Job de arquivamento + `/batches/history`.
5. `/reports/losses` com agregações financeiras.


## 8) Atualizacao 2026-05-10 - Onboarding e Convites
- `POST /api/onboarding/bootstrap`
  - Body: `{ organizationName, establishmentName }`
  - Efeito: cria organizacao + estabelecimento + roles `admin`/`operador` + permissao das roles + vinculo do usuario autenticado como `admin`.
- `GET /api/admin/roles?establishmentId=...`
  - Lista roles da organizacao do estabelecimento (requer `admin.manage`).
- `POST /api/admin/invitations`
  - `roleId` pode ser omitido; fallback automatico para role `operador`.
- `GET /api/invitations/pending`
  - Lista convites pendentes para o email do usuario autenticado.

## 9) Atualizacao 2026-05-10 - Job interno de notificacao por email
- `POST /api/internal/jobs/alert-emails`
  - Protecao: header `x-cron-secret` (ou `Authorization: Bearer <CRON_SECRET>`).
  - Query opcional: `establishmentId=<uuid>` para executar em apenas 1 estabelecimento.
  - Dependencias de ambiente:
    - `SUPABASE_SERVICE_ROLE_KEY`
    - `CRON_SECRET`
    - `RESEND_API_KEY`
    - `ALERT_EMAIL_FROM`

### Regras automaticas de aviso (sem formulario manual)
- O marco de alerta e calculado por lote conforme prazo total (`created_at` -> `expiry_date`):
  - `>= 180 dias`: avisos em `30, 15, 7, 1` dias.
  - `61 a 179 dias`: avisos em `15, 7, 3, 1` dias.
  - `<= 60 dias`: avisos em `7, 3, 1` dias.
- `expired` e `quarantine` geram notificacao critica diaria por lote.
- Snooze ativo (`batch_alert_snoozes`) bloqueia apenas aviso nao vencido.

### Deduplicacao e trilha
- Tabela: `alert_email_notifications`.
- Deduplicacao:
  - `alert_milestone`: unica por `establishment + user + batch + milestone`.
  - `expired_daily` e `quarantine_daily`: unica por `establishment + user + batch + data operacional`.
- Auditoria:
  - `alert_email_sent`
  - `alert_email_failed`

### Retry com backoff
- Falhas entram em retentativa automatica com escada:
  - tentativa 1 falhou -> +15 min
  - tentativa 2 falhou -> +1h
  - tentativa 3 falhou -> +6h
  - tentativa 4 falhou -> +24h
  - tentativa 5 falhou -> encerra sem novo agendamento
- Campos de controle:
  - `attempts`
  - `last_attempt_at`
  - `next_retry_at`

## 10) Operacao Admin de notificacoes
- `GET /api/admin/alert-email-notifications?establishmentId=...&status?=failed&page?=1&pageSize?=30`
  - Requer `admin.manage`.
  - Lista notificacoes com status/tentativas/erros.
- `POST /api/admin/alert-email-notifications/retry`
  - Body: `{ establishmentId, notificationIds?: uuid[] }`
  - Requer `admin.manage`.
  - Reagenda notificacoes `failed` para `pending` com `next_retry_at = now`.
