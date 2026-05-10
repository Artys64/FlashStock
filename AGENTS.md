# AGENTS

## Missao do Projeto
Este repositorio implementa o VIGIA-ESTOQUE, um gerenciador de estoque de produtos com foco em reduzir perdas por vencimento, manter rastreabilidade de movimentacoes e alertar vencimentos iminentes.

O objetivo principal de toda mudanca e:
1. Preservar a integridade do estoque (sem saldo negativo).
2. Priorizar consumo por validade (PVPS).
3. Tornar alertas de vencimento confiaveis e acionaveis.
4. Manter trilha de auditoria para operacoes sensiveis.

## Contexto Funcional Obrigatorio
- Modelo multi-tenant por organizacao/estabelecimento.
- Controle de acesso por RBAC.
- Isolamento de dados com RLS no Supabase.
- Lotes sao a unidade operacional para validade e custo.
- Movimentacoes de estoque compoem um ledger (historico transacional).

Toda implementacao deve respeitar essas bases antes de otimizar UX ou performance.

## Stack e Ferramentas
- Next.js App Router (`src/app`)
- React + TypeScript
- Supabase (`supabase/migrations`, `supabase/seeds`)
- ESLint
- Testes com Node test runner (`npm run test`)

## Estrutura de Codigo (Referencia Rapida)
- API HTTP: `src/app/api/**/route.ts`
- Dominio (regras): `src/core/domain/**`
- Casos de uso: `src/core/application/use-cases/**`
- Ports/interfaces: `src/core/ports/**`
- Repositorios (Supabase): `src/infra/repositories/**`
- Auth, guardas e permissoes: `src/lib/auth/**`
- Regras de alerta/suporte inventario: `src/lib/inventory/**`
- Middleware: `src/middleware.ts`
- Documentacao funcional/tecnica: `src/docs/**`, `docs/**`

## Comandos de Trabalho
- Instalar dependencias: `npm install`
- Ambiente de dev: `npm run dev`
- Lint: `npm run lint`
- Testes: `npm run test`
- Build: `npm run build`

Sempre que possivel, validar localmente com `lint` e `test` antes de concluir mudancas relevantes.

## Regras de Dominio Inegociaveis
1. PVPS (primeiro que vence, primeiro que sai):
- Operacoes de saida devem priorizar lote com menor `expiry_date` valido.
- Desvio de PVPS exige justificativa auditavel quando aplicavel.

2. Status de lote:
- `active`: saldo > 0 e fora da janela de alerta.
- `alert`: saldo > 0 e dentro da janela de `lead_time_alert`.
- `expired`: data atual >= validade.
- `quarantine`: bloqueado manualmente para movimentacao.

3. Estoque:
- Saldo negativo e proibido.
- Ajustes devem manter consistencia entre lotes e movimentacoes.

4. Alertas e soneca:
- Snooze permitido somente para itens nao vencidos.
- Valores aceitos para snooze: 24h ou 48h.
- Item vencido nao pode ser silenciado.

5. Auditoria:
- Alteracoes sensiveis (ex.: validade, quarentena, baixas de perda) devem gerar registro de auditoria.

6. Multi-tenant:
- Toda consulta/mutacao deve respeitar escopo de organizacao/estabelecimento.
- Nunca expor dados de outro tenant.

## Contrato de API e Seguranca
- Rotas protegidas exigem autenticacao/sessao conforme implementacao atual.
- Quando aplicavel, validar `x-user-id` e contexto do estabelecimento.
- Verificar permissoes por acao (read/write/admin/audit).
- Entradas devem ser validadas (ex.: zod) e retornar erros HTTP consistentes.
- Nao vazar detalhes internos de banco em mensagens de erro.

## Padrao de Mudanca por Camada
1. Dominio primeiro:
- Se regra de negocio mudar, atualizar `src/core/domain` ou casos de uso antes da camada HTTP.

2. API depois:
- Refletir regra no endpoint com validacao, tratamento de erro e status code coerente.

3. Persistencia por ultimo:
- Ajustar repositorios Supabase e, se necessario, migrations.

4. Testes:
- Incluir/atualizar testes proximos da regra alterada.
- Cobrir cenarios de borda (vencido, saldo zero, conflito, permissao insuficiente).

## Banco de Dados e Migrations
- Novas mudancas estruturais devem entrar em `supabase/migrations` com arquivo incremental.
- Nunca editar migration antiga ja aplicada em ambiente compartilhado.
- Seeds devem ser idempotentes quando possivel.
- Em mudancas de schema, validar impacto em RLS, RBAC e endpoints existentes.

## Regras de Qualidade para PR/Tarefa
Antes de considerar concluido:
1. Regra de negocio foi mantida (PVPS, alerta, vencido, sem saldo negativo).
2. Tenant isolation e permissao foram verificados.
3. `npm run lint` executou sem erro (quando a mudanca afeta codigo TS/JS).
4. `npm run test` executou sem regressao (quando ha testes cobrindo a area).
5. Documentacao relevante foi atualizada se contrato/fluxo mudou.

## Performance e Confiabilidade
- Evitar N+1 em endpoints de listagem/relatorio.
- Paginar consultas potencialmente grandes.
- Em concorrencia de edicao de lotes, preservar estrategia de optimistic locking.
- Tratar timezone/data com cuidado em calculos de vencimento.

## Diretrizes de UX para Alertas
- Priorizar clareza de acao: vencido (acao imediata), alerta (acao preventiva), reposicao (planejamento).
- Evitar esconder risco real: item vencido deve aparecer com prioridade.
- Snooze deve reduzir ruido sem mascarar urgencias reais.

## O Que Nao Fazer
- Nao bypassar verificacoes de permissao para "facilitar teste".
- Nao aplicar regras de negocio apenas no frontend.
- Nao criar endpoint sem validacao de entrada e escopo tenant.
- Nao remover trilha de auditoria de operacoes sensiveis.
- Nao alterar contratos existentes sem ajustar consumidores e documentacao.

## Convencoes de Entrega do Agente
Ao finalizar uma tarefa tecnica:
1. Informar arquivos alterados.
2. Resumir impacto funcional.
3. Listar validacoes executadas (`lint`, `test`, chamadas de endpoint, etc.).
4. Apontar riscos pendentes ou follow-ups necessarios.

## Fonte de Verdade de Produto
- Documento principal de negocio/arquitetura: `src/docs/sdd.md`.
- Em caso de conflito entre implementacao e SDD, abrir alinhamento e registrar decisao.

## Fluxo Git e Pull Request
1. Branch naming:
- `feat/<resumo-curto>`
- `fix/<resumo-curto>`
- `chore/<resumo-curto>`
- `hotfix/<resumo-curto>`

2. Commit convention:
- Usar Conventional Commits.
- Exemplos: `feat: adicionar filtro de lotes em alerta`, `fix: impedir snooze para lote vencido`.

3. Pull Request:
- Toda mudanca deve passar por PR, exceto ajustes locais exploratorios.
- PR deve conter: contexto, escopo, impacto em regra de negocio e evidencias de validacao.

4. Tamanho de PR:
- Preferir PRs pequenos e focados em um unico objetivo funcional.
- Evitar misturar refatoracao ampla com mudanca de regra critica.

## Definition of Ready (DoR)
Uma tarefa so deve entrar em implementacao quando tiver:
1. Problema de negocio descrito em uma frase objetiva.
2. Regra de dominio afetada (PVPS, status, alerta, auditoria, RBAC ou multi-tenant).
3. Critrios de aceitacao testaveis.
4. Escopo tecnico definido (arquivos/endpoint/camada esperados).
5. Risco principal identificado (ex.: regressao de saida, vazamento tenant, erro de timezone).

Se faltar algum item, alinhar antes de codar.

## Definition of Done (DoD)
Considerar concluido apenas quando:
1. Comportamento implementado atende aos criterios de aceitacao.
2. Regras inegociaveis continuam validas (PVPS, sem saldo negativo, alerta/snooze corretos).
3. Permissoes e isolamento tenant foram verificados.
4. `npm run lint` sem erro.
5. `npm run test` sem regressao relevante.
6. Contratos de API/documentacao foram atualizados se necessario.
7. Resultado e riscos residuais foram reportados no fechamento da tarefa.

## Politica de Migrations e Banco
1. Naming e ordem:
- Criar migration incremental em `supabase/migrations`.
- Nao renomear nem reescrever migrations ja aplicadas.

2. Conteudo minimo de mudanca estrutural:
- Alteracao de schema.
- Ajustes de indice/constraint quando necessarios.
- Revisao de RLS/RBAC impactados.

3. Compatibilidade:
- Preferir mudancas backward-compatible.
- Em mudancas quebradoras, planejar rollout em etapas (schema -> codigo -> limpeza).

4. Rollback e mitigacao:
- Toda migration critica deve ter estrategia de mitigacao documentada no PR.
- Em caso de falha, priorizar restaurar operacao de entrada/saida e alertas de vencimento.

## Politica de Release e Hotfix
1. Release regular:
- Consolidar mudancas validadas em ambiente de homologacao antes de producao.
- Garantir checklist minimo: lint, test, rotas criticas e consultas de dashboard.

2. Hotfix:
- Usar branch `hotfix/*` para incidentes em producao que afetem operacao.
- Escopo minimo necessario para restaurar servico.
- Pos-hotfix: abrir tarefa de correcao estrutural se a causa raiz nao foi resolvida.

3. Aprovacao:
- Mudancas em regras criticas (PVPS, baixa por perda, RLS, RBAC, auditoria) exigem revisao tecnica explicita.

## Observabilidade e Incidentes
1. Logs minimos por endpoint critico:
- Identificador da operacao.
- `organizationId` e `establishmentId` (quando aplicavel).
- Tipo da acao (entrada, saida, ajuste, snooze, baixa por perda).
- Resultado (sucesso/falha) sem expor dados sensiveis.

2. Tratamento de incidente:
- Classificar severidade:
- `SEV-1`: operacao de estoque bloqueada ou dado inconsistente critico.
- `SEV-2`: degradacao relevante em alertas, dashboard ou movimentacoes.
- `SEV-3`: defeito sem impacto imediato no fluxo principal.

3. Resposta:
- Conter primeiro (restaurar operacao segura).
- Corrigir depois (patch/hotfix).
- Registrar analise de causa raiz e acao preventiva.

## Checklist Operacional de PR
Antes de solicitar revisao, responder no PR:
1. Qual regra de negocio foi alterada?
2. Como foi validado PVPS e integridade de saldo?
3. Houve impacto em RLS/RBAC/auditoria?
4. Quais endpoints/queries foram testados?
5. Qual risco residual existe e como monitorar?
