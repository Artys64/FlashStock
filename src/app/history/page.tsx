"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./page.module.css";

type Establishment = {
  id: string;
  name: string;
};

type HistoryBatch = {
  id: string;
  product_id: string;
  lot_code: string;
  expiry_date: string;
  quantity_current: number;
  cost_price: number;
  updated_at: string;
  archived_at: string | null;
  products: { name: string; sku: string } | null;
};

type Movement = {
  id: string;
  movement_type: string;
  quantity: number;
  unit_cost: number;
  reason_code: string | null;
  created_at: string;
};

type AuditLog = {
  id: string;
  action: string;
  payload: Record<string, unknown>;
  created_at: string;
};

function formatDateTime(input: string | null): string {
  if (!input) return "-";
  const date = new Date(input);
  return Number.isNaN(date.getTime()) ? input : date.toLocaleString("pt-BR");
}

function formatDate(input: string): string {
  const date = new Date(`${input}T00:00:00`);
  return Number.isNaN(date.getTime()) ? input : date.toLocaleDateString("pt-BR");
}

function formatMoney(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function describeAudit(log: AuditLog): string {
  if (log.action === "quarantine_updated") {
    const after = log.payload.after as Record<string, unknown> | undefined;
    return `Quarentena alterada para ${after?.quarantined ? "Sim" : "Nao"}.`;
  }
  if (log.action === "expiry_date_corrected") {
    const after = log.payload.after as Record<string, unknown> | undefined;
    return `Validade corrigida para ${String(after?.expiryDate ?? "-")}.`;
  }
  if (log.action === "alert_snoozed") {
    return `Alerta silenciado ate ${String(log.payload.snoozedUntil ?? "-")}.`;
  }
  return `Acao registrada: ${log.action}.`;
}

export default function HistoryPage() {
  const [establishments, setEstablishments] = useState<Establishment[]>([]);
  const [establishmentId, setEstablishmentId] = useState("");
  const [rows, setRows] = useState<HistoryBatch[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRows, setTotalRows] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [selectedBatchId, setSelectedBatchId] = useState("");
  const [movements, setMovements] = useState<Movement[]>([]);
  const [audits, setAudits] = useState<AuditLog[]>([]);
  const [movementPage, setMovementPage] = useState(1);
  const [movementTotalPages, setMovementTotalPages] = useState(1);
  const [auditPage, setAuditPage] = useState(1);
  const [auditTotalPages, setAuditTotalPages] = useState(1);

  const selectedBatch = useMemo(
    () => rows.find((row) => row.id === selectedBatchId) ?? null,
    [rows, selectedBatchId],
  );

  useEffect(() => {
    async function loadEstablishments() {
      setError("");
      const response = await fetch("/api/establishments", { credentials: "include" });
      const body = await response.json();
      if (!response.ok) {
        setError(body.error ?? "Falha ao carregar estabelecimentos.");
        return;
      }
      const data = (body.data ?? []) as Establishment[];
      setEstablishments(data);
      if (data.length > 0) {
        setEstablishmentId(data[0].id);
      }
    }

    void loadEstablishments();
  }, []);

  useEffect(() => {
    async function loadHistory() {
      if (!establishmentId) return;
      setLoading(true);
      setError("");

      const response = await fetch(
        `/api/batches/history?establishmentId=${establishmentId}&page=${page}&pageSize=${pageSize}`,
        { credentials: "include" },
      );
      const body = await response.json();
      if (!response.ok) {
        setError(body.error ?? "Falha ao carregar historico.");
        setLoading(false);
        return;
      }

      setRows((body.data ?? []) as HistoryBatch[]);
      setTotalPages(Number(body.pagination?.totalPages ?? 1));
      setTotalRows(Number(body.pagination?.total ?? 0));
      setLoading(false);
    }

    void loadHistory();
  }, [establishmentId, page, pageSize]);

  useEffect(() => {
    async function loadDrilldown() {
      if (!establishmentId || !selectedBatchId) return;

      const [movementResponse, auditResponse] = await Promise.all([
        fetch(
          `/api/inventory-movements?establishmentId=${establishmentId}&batchId=${selectedBatchId}&page=${movementPage}&pageSize=10`,
          { credentials: "include" },
        ),
        fetch(
          `/api/audit-logs?establishmentId=${establishmentId}&entityType=batch&entityId=${selectedBatchId}&page=${auditPage}&pageSize=10`,
          { credentials: "include" },
        ),
      ]);

      const movementBody = await movementResponse.json();
      const auditBody = await auditResponse.json();

      if (movementResponse.ok) {
        setMovements((movementBody.data ?? []) as Movement[]);
        setMovementTotalPages(Number(movementBody.pagination?.totalPages ?? 1));
      }

      if (auditResponse.ok) {
        setAudits((auditBody.data ?? []) as AuditLog[]);
        setAuditTotalPages(Number(auditBody.pagination?.totalPages ?? 1));
      }
    }

    void loadDrilldown();
  }, [establishmentId, selectedBatchId, movementPage, auditPage]);

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <section className={styles.card}>
          <div className={styles.topBar}>
            <div>
              <h1 className={styles.title}>Historico de Lotes Arquivados</h1>
              <p className={styles.subtitle}>Paginacao real e rastreabilidade por lote</p>
            </div>
            <div className={styles.actions}>
              <button className={styles.buttonSecondary} type="button" onClick={() => { window.location.href = "/batches"; }}>
                Voltar para operacao
              </button>
            </div>
          </div>

          <div className={styles.row}>
            <label className={styles.field}>
              Estabelecimento
              <select
                className={styles.select}
                value={establishmentId}
                onChange={(e) => {
                  setEstablishmentId(e.target.value);
                  setPage(1);
                  setSelectedBatchId("");
                }}
                disabled={establishments.length === 0}
              >
                {establishments.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              Itens por pagina
              <select
                className={styles.select}
                value={String(pageSize)}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
              >
                <option value="10">10</option>
                <option value="20">20</option>
                <option value="50">50</option>
              </select>
            </label>
          </div>

          <p className={styles.meta}>Total de lotes no historico: {totalRows}</p>
          {error ? <p className={styles.error}>{error}</p> : null}
        </section>

        <section className={styles.card}>
          {loading ? <p className={styles.meta}>Carregando historico...</p> : null}
          {!loading && rows.length === 0 ? <p className={styles.meta}>Nenhum lote arquivado encontrado.</p> : null}

          {rows.length > 0 ? (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Lote</th>
                    <th>Produto</th>
                    <th>Validade</th>
                    <th>Custo</th>
                    <th>Atualizado</th>
                    <th>Arquivado em</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.id}
                      className={selectedBatchId === row.id ? styles.rowSelected : undefined}
                      onClick={() => {
                        setSelectedBatchId(row.id);
                        setMovementPage(1);
                        setAuditPage(1);
                      }}
                    >
                      <td>{row.lot_code}</td>
                      <td>{row.products?.name ?? row.product_id}</td>
                      <td>{formatDate(row.expiry_date)}</td>
                      <td>{formatMoney(Number(row.cost_price))}</td>
                      <td>{formatDateTime(row.updated_at)}</td>
                      <td>{formatDateTime(row.archived_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          <div className={styles.pagination}>
            <button className={styles.buttonSecondary} type="button" disabled={page <= 1} onClick={() => setPage((prev) => prev - 1)}>
              Pagina anterior
            </button>
            <span>Pagina {page} de {Math.max(totalPages, 1)}</span>
            <button className={styles.buttonSecondary} type="button" disabled={page >= totalPages} onClick={() => setPage((prev) => prev + 1)}>
              Proxima pagina
            </button>
          </div>
        </section>

        <section className={styles.card}>
          <h2 className={styles.sectionTitle}>Drill-down do Lote</h2>
          {!selectedBatch ? <p className={styles.meta}>Selecione um lote na tabela para ver detalhes.</p> : null}
          {selectedBatch ? (
            <>
              <p className={styles.meta}>
                Lote {selectedBatch.lot_code} | Produto: {selectedBatch.products?.name ?? selectedBatch.product_id}
              </p>

              <div className={styles.split}>
                <div>
                  <h3 className={styles.subsection}>Movimentacoes</h3>
                  {movements.length === 0 ? <p className={styles.meta}>Sem movimentacoes para este lote.</p> : null}
                  <div className={styles.feedList}>
                    {movements.map((movement) => (
                      <article key={movement.id} className={styles.feedItem}>
                        <p className={styles.feedTitle}>{movement.movement_type}</p>
                        <p className={styles.feedMeta}>
                          Qtd: {movement.quantity} | Custo unitario: {formatMoney(Number(movement.unit_cost))}
                        </p>
                        {movement.reason_code ? <p className={styles.feedMeta}>Motivo: {movement.reason_code}</p> : null}
                        <p className={styles.feedMeta}>{formatDateTime(movement.created_at)}</p>
                      </article>
                    ))}
                  </div>
                  <div className={styles.paginationSmall}>
                    <button className={styles.buttonSecondary} type="button" disabled={movementPage <= 1} onClick={() => setMovementPage((prev) => prev - 1)}>
                      Anterior
                    </button>
                    <span>{movementPage}/{Math.max(movementTotalPages, 1)}</span>
                    <button className={styles.buttonSecondary} type="button" disabled={movementPage >= movementTotalPages} onClick={() => setMovementPage((prev) => prev + 1)}>
                      Proxima
                    </button>
                  </div>
                </div>

                <div>
                  <h3 className={styles.subsection}>Auditoria</h3>
                  {audits.length === 0 ? <p className={styles.meta}>Sem logs de auditoria para este lote.</p> : null}
                  <div className={styles.feedList}>
                    {audits.map((audit) => (
                      <article key={audit.id} className={styles.feedItem}>
                        <p className={styles.feedTitle}>{audit.action}</p>
                        <p className={styles.feedMeta}>{describeAudit(audit)}</p>
                        <p className={styles.feedMeta}>{formatDateTime(audit.created_at)}</p>
                      </article>
                    ))}
                  </div>
                  <div className={styles.paginationSmall}>
                    <button className={styles.buttonSecondary} type="button" disabled={auditPage <= 1} onClick={() => setAuditPage((prev) => prev - 1)}>
                      Anterior
                    </button>
                    <span>{auditPage}/{Math.max(auditTotalPages, 1)}</span>
                    <button className={styles.buttonSecondary} type="button" disabled={auditPage >= auditTotalPages} onClick={() => setAuditPage((prev) => prev + 1)}>
                      Proxima
                    </button>
                  </div>
                </div>
              </div>
            </>
          ) : null}
        </section>
      </div>
    </div>
  );
}
