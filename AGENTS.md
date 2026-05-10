# AGENTS

## 1) Missao Do Projeto
Este repositorio implementa o **Flash Stock**, um sistema de gestao de estoque orientado a validade.
O foco nao e apenas "ter saldo", mas garantir **decisao operacional segura**:
1. Reduzir perdas por vencimento.
2. Priorizar consumo por lote com validade mais proxima (PVPS/FEFO).
3. Aumentar confiabilidade de alertas e acoes preventivas.
4. Preservar rastreabilidade completa de movimentacoes e ajustes.

Toda mudanca de codigo deve responder: "isso melhora previsao, controle de risco de vencimento e integridade do estoque?"

## 2) Norte Inegociavel
As seguintes regras sao invariantes do produto e valem para backend, frontend, jobs e migrations:
1. **Sem saldo negativo** em qualquer lote e no agregado por item.
2. **PVPS obrigatorio** em toda baixa de consumo, venda, perda ou transferencia de saida.
3. **Vencido e prioridade maxima** de alerta e nunca pode ser silenciado.
4. **Auditoria obrigatoria** para operacoes sensiveis.
5. **Isolamento tenant** absoluto (organizacao/estabelecimento).
6. **Permissao explicita** por acao (read/write/admin/audit).
7. **Consistencia temporal** (timezone e corte de data) para calculo de vencimento.

## 3) Escopo Funcional Obrigatorio
1. Modelo multi-tenant por `organizationId` e `establishmentId`.
2. Lote como unidade operacional para:
- validade
- custo
- disponibilidade real
3. Ledger transacional para movimentacoes:
- entrada
- saida
- ajuste
- perda
- transferencia
4. Motor de alertas com estado reproduzivel:
- `active`
- `alert`
- `expired`
- `quarantine`
5. Suporte a snooze com regra restritiva:
- somente 24h ou 48h
- apenas itens nao vencidos

## 4) Fonte De Verdade
1. Documento primario de produto/arquitetura: `src/docs/sdd.md`.
2. Contratos de API em `src/app/api/**/route.ts` + validacao de schema.
3. Regras de dominio em `src/core/domain/**` e `src/core/application/use-cases/**`.
4. Estrutura de dados e seguranca no banco em `supabase/migrations/**`.

Se implementacao e documentacao divergirem:
1. Nao assumir comportamento implicitamente.
2. Abrir alinhamento tecnico.
3. Registrar decisao e impacto.

## 5) Arquitetura E Ownership
1. API HTTP: `src/app/api/**/route.ts`
2. Dominio (entidades, regras, invariantes): `src/core/domain/**`
3. Casos de uso (orquestracao): `src/core/application/use-cases/**`
4. Ports/interfaces: `src/core/ports/**`
5. Repositorios e acesso Supabase: `src/infra/repositories/**`
6. Auth/guards/permissoes: `src/lib/auth/**`
7. Regras de inventario/alerta: `src/lib/inventory/**`
8. Middleware: `src/middleware.ts`
9. Documentacao funcional e tecnica: `src/docs/**`, `docs/**`

Regra de ownership:
1. Mudou regra de negocio -> altera dominio/use case primeiro.
2. Mudou contrato externo -> atualiza API + docs + testes.
3. Mudou persistencia -> migration incremental + revisao de RLS/RBAC.

## 6) Glossario Operacional
1. **Produto**: item comercializavel/consumivel.
2. **Lote**: particao de estoque com validade e custo especificos.
3. **PVPS/FEFO**: primeiro que vence, primeiro que sai.
4. **Ledger**: historico imutavel de movimentacoes.
5. **Snooze**: adiamento temporario de alerta nao vencido.
6. **Quarantine**: bloqueio manual de lote para impedir saida.
7. **Lead time de alerta**: janela de antecedencia para acao preventiva.

## 7) Regras De Dominio Detalhadas

### 7.1 Integridade De Estoque
1. Nenhuma operacao pode produzir saldo negativo:
- por lote
- por produto agregado no estabelecimento
2. Ajustes devem deixar trilha no ledger.
3. "Correcao manual" sem evento de movimentacao e proibida.

### 7.2 PVPS Obrigatorio
1. Toda saida deve ordenar lotes por:
- `expiry_date` ascendente
- critico: ignorar lotes `quarantine`
- critico: considerar vencido como nao elegivel para consumo regular (exceto fluxo explicito de descarte/perda)
2. Em empate de `expiry_date`, desempatar por:
- `created_at` ascendente
- `id` ascendente (determinismo)
3. Se houver desvio de PVPS (caso excepcional):
- exigir justificativa textual
- registrar auditoria com usuario, data e motivo

### 7.3 Status De Lote
Assumindo `today` no timezone da operacao:
1. `quarantine`: prevalece sobre outros estados enquanto bloqueio ativo.
2. `expired`: `today >= expiry_date`.
3. `alert`: `today < expiry_date` e dentro da janela `lead_time_alert`.
4. `active`: saldo > 0 e fora da janela de alerta.
5. Lote com saldo 0 nao deve aparecer como estoque disponivel.

### 7.4 Alertas E Snooze
1. Alertas devem ser acionaveis e priorizados por severidade.
2. Snooze permitido somente para lotes nao vencidos.
3. Valores permitidos: 24h ou 48h.
4. Se `expired`, qualquer snooze deve ser rejeitado com erro de regra.
5. Ao fim do snooze, alerta retorna automaticamente sem alterar estado de validade.

### 7.5 Quarantine
1. Quarantine bloqueia saida operacional do lote.
2. Entrada/ajuste de regularizacao depende de regra do caso de uso, mas precisa auditar.
3. Mudanca de quarantine exige auditoria obrigatoria.

### 7.6 Auditoria
Devem gerar evento de auditoria no minimo:
1. alteracao de validade
2. entrada/saida manual sensivel
3. baixa por perda
4. ativar/desativar quarantine
5. desvio de PVPS
6. alteracao de parametros de alerta

Evento de auditoria minimo:
1. `operationId`
2. `organizationId`
3. `establishmentId`
4. `userId`
5. `action`
6. `targetType`
7. `targetId`
8. `before` e `after` (quando aplicavel)
9. timestamp

## 8) Multi-Tenant, RBAC E RLS
1. Toda query/mutacao precisa escopo explicito de tenant.
2. Nunca confiar em filtro apenas no frontend.
3. RLS no Supabase e parte do contrato de seguranca, nao opcional.
4. Endpoint sem verificacao de permissao por acao nao pode ser mergeado.

Checklist de seguranca por rota:
1. autenticacao valida?
2. usuario pertence ao tenant?
3. permissao minima necessaria validada?
4. filtros por `organizationId` e `establishmentId` aplicados?
5. resposta sem dados cruzados de outro tenant?

## 9) Contrato De API
1. Entrada validada com schema (ex.: zod).
2. Erros com HTTP status consistente e sem detalhes internos de banco.
3. Idempotencia quando aplicavel (especialmente operacoes suscetiveis a retry).
4. Campos de data com formato e timezone definidos.
5. Rotas criticas devem registrar identificador de operacao para troubleshooting.

Padrao minimo de erro:
1. `code` estavel para consumidor
2. `message` orientado a acao
3. sem stack trace em producao

## 10) Banco De Dados E Migrations
1. Toda mudanca estrutural em `supabase/migrations` com arquivo incremental.
2. Nunca editar migration antiga aplicada em ambiente compartilhado.
3. Seeds devem ser idempotentes sempre que possivel.
4. Mudanca de schema deve revisar:
- constraints de integridade
- indices para consultas de alerta/listagem
- RLS/RBAC impactados
- compatibilidade com endpoints existentes

Politica de compatibilidade:
1. preferir rollout backward-compatible
2. em mudanca quebradora: schema -> codigo -> cleanup posterior
3. documentar estrategia de mitigacao/rollback no PR

## 11) Confiabilidade, Concurrency E Tempo
1. Evitar N+1 em endpoints de dashboard/listagem.
2. Paginar consultas grandes.
3. Preservar estrategia de optimistic locking quando existir disputa de edicao.
4. Calculo de vencimento deve respeitar timezone oficial da operacao.
5. Operacoes concorrentes de saida nao podem resultar em saldo negativo.

## 12) Observabilidade E Incidentes
Logs minimos em endpoint critico:
1. `operationId`
2. `organizationId`
3. `establishmentId` (quando aplicavel)
4. tipo de acao (`entry`, `exit`, `adjust`, `snooze`, `loss`)
5. resultado (`success` ou `failure`)

Severidade:
1. `SEV-1`: operacao bloqueada ou inconsistencias criticas de estoque.
2. `SEV-2`: degradacao relevante de alertas, dashboard ou movimentacoes.
3. `SEV-3`: defeito sem impacto imediato no fluxo principal.

Resposta a incidente:
1. conter (restaurar operacao segura)
2. corrigir (patch/hotfix)
3. prevenir (causa raiz + acao preventiva)

## 13) Fluxo De Mudanca Tecnica
1. **Dominio primeiro**
- atualizar regra em `src/core/domain`/use cases
2. **API depois**
- refletir validacao, erros, status code e autorizacao
3. **Persistencia por ultimo**
- ajustar repositorio e migrations
4. **Testes**
- cobrir happy path + bordas + seguranca

Cenarios minimos de teste por regra critica:
1. lote vencido
2. lote em alerta
3. saldo zero
4. tentativa de saldo negativo
5. usuario sem permissao
6. tenant incorreto
7. conflito de concorrencia

## 14) Matriz De Testes Recomendados
1. Unitario de dominio:
- ordenacao PVPS
- transicao de status de lote
- validacao de snooze
2. Integracao de caso de uso:
- baixa multi-lote
- baixa por perda com auditoria
- bloqueio por quarantine
3. API:
- autenticacao e autorizacao
- validacao de payload
- codigos HTTP
4. Persistencia:
- filtros tenant
- comportamento RLS
- consistencia de ledger

Sempre que possivel executar:
1. `npm run lint`
2. `npm run test`
3. testes manuais de endpoint critico alterado

## 15) Diretrizes De UX Para Vencimento
1. Vencido deve ter destaque maximo e acao imediata.
2. Alerta preventivo deve indicar prazo restante e proxima acao.
3. Snooze deve reduzir ruido, nunca ocultar urgencia real.
4. Dashboard deve priorizar risco de perda antes de metricas cosmeticas.

## 16) O Que Nao Fazer
1. Nao bypassar permissao para facilitar teste.
2. Nao aplicar regra de negocio apenas no frontend.
3. Nao criar endpoint sem validacao de entrada e escopo tenant.
4. Nao remover auditoria de operacao sensivel.
5. Nao mudar contrato sem atualizar consumidor e documentacao.
6. Nao editar migration historica.

## 17) Fluxo Git E Pull Request
Branch naming:
1. `feat/<resumo-curto>`
2. `fix/<resumo-curto>`
3. `chore/<resumo-curto>`
4. `hotfix/<resumo-curto>`

Commit convention:
1. usar Conventional Commits
2. exemplos:
- `feat: adicionar classificacao de risco por validade`
- `fix: impedir snooze para lote vencido`

PR deve conter:
1. contexto e problema de negocio
2. escopo tecnico alterado
3. impacto em regras criticas (PVPS/saldo/alerta/RLS/RBAC/auditoria)
4. evidencias de validacao (`lint`, `test`, testes de rota)
5. risco residual e plano de monitoramento

Preferir PR pequeno e focado em unico objetivo funcional.

## 18) DoR (Definition Of Ready)
Implementacao so inicia quando existir:
1. problema de negocio em frase objetiva
2. regra de dominio afetada identificada
3. criterios de aceitacao testaveis
4. escopo tecnico esperado (camadas/arquivos/rotas)
5. risco principal mapeado

Sem isso, alinhar antes de codar.

## 19) DoD (Definition Of Done)
Concluir somente quando:
1. comportamento atende criterios de aceitacao
2. invariantes seguem validas (PVPS, sem saldo negativo, alerta/snooze corretos)
3. permissao e isolamento tenant verificados
4. `npm run lint` sem erro (quando aplicavel)
5. `npm run test` sem regressao relevante (quando aplicavel)
6. contrato/API/docs atualizados se houve mudanca
7. resultado e risco residual reportados no fechamento

## 20) Checklist Operacional Para PR
Responder no PR, objetivamente:
1. Qual regra de negocio mudou?
2. Como PVPS foi validado?
3. Como integridade de saldo foi validada?
4. Houve impacto em RLS/RBAC/auditoria?
5. Quais endpoints/queries foram testados?
6. Qual risco residual existe?
7. Qual sinal/monitoramento detecta regressao dessa mudanca?

## 21) Convencao De Entrega Do Agente
Ao finalizar tarefa tecnica, sempre informar:
1. arquivos alterados
2. impacto funcional
3. validacoes executadas
4. riscos pendentes e follow-ups

Formato recomendado de fechamento:
1. **Arquivos**: lista objetiva
2. **Impacto**: regra de negocio afetada e resultado esperado
3. **Validacao**: lint/test/endpoint/manual
4. **Risco residual**: o que ainda precisa monitorar

## 22) Politica De Release E Hotfix
Release regular:
1. homologar mudancas antes de producao
2. validar rotas criticas de estoque e alertas
3. garantir checklist minimo (`lint`, `test`, consultas principais)

Hotfix:
1. usar branch `hotfix/*`
2. escopo minimo para restaurar operacao
3. apos estabilizar, abrir tarefa da causa raiz se pendente

Aprovacao tecnica explicita obrigatoria para mudancas em:
1. PVPS
2. baixa por perda
3. RLS
4. RBAC
5. auditoria

## 23) Mandamento Final
Se houver trade-off entre velocidade de entrega e integridade de estoque:
1. escolher integridade de estoque
2. documentar decisao
3. manter rastreabilidade completa
