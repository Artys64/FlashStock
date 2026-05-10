Este é o **Master SDD (Software Design Document)**. Ele consolida todas as decisões estratégicas, correções de inconsistências e a arquitetura técnica para criar um sistema de gestão de estoque de nível empresarial.

---

# MASTER SDD: Sistema de Gestão de Inventário e Validade (VIGIA-ESTOQUE)

## 1. Visão Geral e Objetivos
O sistema visa eliminar perdas por vencimento e erros de inventário em ambientes colaborativos. O diferencial competitivo é a **Inteligência de Alerta Personalizada** e a **Rastreabilidade Transacional Total**.

*   **Modelo de Operação:** Multi-tenant (várias empresas/filiais).
*   **Abordagem de Saída:** PVPS (Primeiro que Vence, Primeiro que Sai).
*   **Foco de UX:** Redução de fadiga de decisão e poluição visual.

---

## 2. Arquitetura de Dados (Refinada)
A base de dados é estruturada para suportar auditoria e crescimento escalar.

### 2.1. Entidades Principais (Esquema SQL-Like)
*   **`Organizations` & `Establishments`:** Isolamento de dados entre empresas e suas filiais.
*   **`Users` & `Permissions`:** RBAC (Role-Based Access Control) vinculando usuários a papéis e permissões granulares.
*   **`Categories`:** Define o `lead_time_alert` (Ex: Laticínios alertam 5 dias antes, Grãos 30 dias).
*   **`Products`:** O "molde" do item. Contém SKU, nome, unidade de medida (UOM) e estoque mínimo global.
*   **`Batches` (Lotes):** A unidade física. Armazena `expiry_date`, `cost_price`, `location_id` e `quantity_current`.
*   **`Inventory_Movements`:** O livro-razão (ledger). Registra toda entrada, saída, perda ou ajuste. **Imutável.**

---

## 3. Regras de Negócio Core (O Coração do Sistema)

### RN01: O Fluxo PVPS (FIFO de Validade)
Ao realizar uma saída, o sistema **obrigatoriamente** sugere o lote com o vencimento mais próximo. 
*   **Desvio de Regra:** Se o usuário escolher um lote mais novo, o sistema exige um `Reason_Code` (ex: "Lote antigo avariado" ou "Cliente solicitou lote específico").

### RN02: Cálculo de Status de Lote
O status é calculado em tempo real (ou via job agendado):
1.  **Ativo:** Saldo > 0 e Data atual < (Vencimento - Lead_Time_Categoria).
2.  **Alerta:** Saldo > 0 e Data atual está dentro da janela de `lead_time_alert`.
3.  **Vencido:** Data atual >= Data de Vencimento.
4.  **Quarentena:** Bloqueado manualmente para movimentação (ex: suspeita de contaminação).

### RN03: Integridade de Dados e Retroatividade
*   Alterações no cadastro do **Produto** (ex: nome) refletem em todos os lotes.
*   Alterações em **Lotes específicos** (ex: correção de data de validade) geram um log de auditoria automático ligando o usuário à ação.
*   **Saldo Negativo:** Proibido por sistema.

---

## 4. Gestão de Colaboração (Multi-Admin)

### 4.1. Controle de Concorrência
*   **Optimistic Locking:** Se dois admins tentarem editar o mesmo lote simultaneamente, o primeiro a salvar vence, e o segundo recebe um alerta: *"Os dados foram alterados por [Admin A]. Por favor, recarregue."*

### 4.2. Feed de Atividade Recente
Uma barra lateral (ou aba) que exibe as últimas 20 ações no estoque:
*   *"Marcos (Admin) descartou 5kg de Carne Moída (Lote #102) por Vencimento."*

---

## 5. Estratégia de UX e Notificações (Anti-Poluição)

### 5.1. O Dashboard "Semáforo"
A tela inicial não mostra tabelas, mas sim cards de ação:
*   **Crítico (Vermelho):** Itens vencidos hoje ou já vencidos. (Ação: Descarte/Baixa).
*   **Atenção (Amarelo):** Itens em janela de alerta. (Ação: Promoção/Uso Prioritário).
*   **Reposição (Azul):** Saldo total abaixo do estoque mínimo. (Ação: Compras).

### 5.2. O Sistema de "Snooze" (Soneca)
Permite silenciar um alerta de vencimento por 24h ou 48h. 
*   **Regra de Trava:** Itens já vencidos **não** podem ser silenciados. O botão de soneca desaparece, restando apenas o botão de "Dar Baixa".

### 5.3. Arquivamento Automático
Lotes com saldo zero são movidos para a tabela de "Histórico" na interface após 7 dias de inatividade, mantendo a listagem principal limpa.

---

## 6. Especificações Técnicas (Tech Stack Sugerida)

next js com supabase e vercel
---

## 7. Fluxos Principais (User Stories Técnicas)

1.  **Entrada de Mercadoria:**
    *   Usuário lê QR Code/Barcode -> Sistema identifica Produto -> Usuário insere Qtd, Validade e Custo -> Sistema gera ID de Lote único -> Registro de Entrada no Ledger.
2.  **Saída para Venda/Uso:**
    *   Sistema lista Lote PVPS -> Usuário confirma Qtd -> Sistema subtrai do `Batches.quantity_current` -> Registro de Saída no Ledger.
3.  **Auditoria de Perda:**
    *   Proprietário filtra `Inventory_Movements` por `Type = EXIT_LOSS` -> Sistema gera relatório de prejuízo financeiro baseado no `unit_cost` dos lotes baixados.

---

## 8. Roadmap de Implementação
1.  **Fase 1:** Core Engine (Cadastro de produtos, lotes e movimentação básica).
2.  **Fase 2:** Inteligência de Alertas (Notificações, Categorias e Dashboards).
3.  **Fase 3:** Colaboração Pro (RBAC, Convites, Logs de Auditoria e Soneca).
4.  **Fase 4:** Automação (QR Code, Integração com Impressoras de Etiquetas e API de Integração).

---

Este Master SDD serve como a "Bíblia" do projeto. Qualquer funcionalidade nova deve ser validada contra estas regras para garantir que o sistema não se torne caótico com o tempo. 

**Deseja prosseguir para o detalhamento da API (Endpoints) ou para o Protótipo de Baixa Fidelidade das telas?**