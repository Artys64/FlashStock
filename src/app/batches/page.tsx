"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import styles from "./page.module.css";

type BatchStatus = "active" | "alert" | "expired" | "quarantine";

type Batch = {
  id: string;
  lot_code: string;
  expiry_date: string;
  quarantined: boolean;
  version: number;
  status: BatchStatus;
  products: { id: string; name: string; sku: string } | null;
};

type Establishment = {
  id: string;
  name: string;
  organization_id: string;
};

type Product = {
  id: string;
  name: string;
  sku: string;
};

type DashboardSummary = {
  critical: number;
  warning: number;
  replenishment: number;
};

type PvpsSuggestion = {
  suggestedBatchId: string | null;
  expiryDate: string | null;
  availableQuantity: number;
  alternatives: Array<{ batchId: string; expiryDate: string; quantity: number }>;
};

type LossReport = {
  totalLossValue: number;
  totalMovements: number;
  byProduct: Array<{ productId: string; productName: string; value: number }>;
  byCategory: Array<{ categoryId: string; categoryName: string; value: number }>;
};

type ActivityItem = {
  at: string;
  actorName: string;
  actorRole: string;
  action: string;
  message: string;
  references: {
    movementId: string;
    batchId: string;
    productId: string;
  };
};

type ConflictResponse = {
  code: "OPTIMISTIC_CONFLICT";
  conflict: {
    expectedVersion: number;
    currentVersion: number;
    serverState: { quarantined: boolean; expiryDate: string };
    fieldDiff: Array<{ field: "quarantined" | "expiryDate"; clientValue: unknown; serverValue: unknown }>;
  };
};

function toLocalDateLabel(input: string): string {
  const date = new Date(`${input}T00:00:00`);
  return Number.isNaN(date.getTime()) ? input : date.toLocaleDateString("pt-BR");
}

function toLocalDateTimeLabel(input: string): string {
  const date = new Date(input);
  return Number.isNaN(date.getTime()) ? input : date.toLocaleString("pt-BR");
}

function formatDelta(value: number): string {
  if (value === 0) return "sem mudanca";
  return `${value > 0 ? "+" : ""}${value}`;
}

function deltaTone(value: number): "up" | "down" | "neutral" {
  if (value > 0) return "up";
  if (value < 0) return "down";
  return "neutral";
}

export default function BatchesPage() {
  const [establishments, setEstablishments] = useState<Establishment[]>([]);
  const [establishmentId, setEstablishmentId] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [dashboard, setDashboard] = useState<DashboardSummary>({
    critical: 0,
    warning: 0,
    replenishment: 0,
  });
  const [selectedBatchId, setSelectedBatchId] = useState("");
  const [quarantined, setQuarantined] = useState("false");
  const [expiryDate, setExpiryDate] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [conflict, setConflict] = useState<ConflictResponse["conflict"] | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [expiryFilter, setExpiryFilter] = useState("all");
  const [productFilter, setProductFilter] = useState("all");
  const [quarantineFilter, setQuarantineFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [resolution, setResolution] = useState<{
    quarantined: "server" | "client";
    expiryDate: "server" | "client";
  }>({ quarantined: "server", expiryDate: "server" });
  const [snoozeHours, setSnoozeHours] = useState<"24" | "48">("24");
  const [pvpsSuggestion, setPvpsSuggestion] = useState<PvpsSuggestion | null>(null);
  const [historyCount, setHistoryCount] = useState(0);
  const [lossFrom, setLossFrom] = useState("");
  const [lossTo, setLossTo] = useState("");
  const [lossReport, setLossReport] = useState<LossReport | null>(null);
  const [activityFeed, setActivityFeed] = useState<ActivityItem[]>([]);
  const [dashboardDelta, setDashboardDelta] = useState<DashboardSummary>({
    critical: 0,
    warning: 0,
    replenishment: 0,
  });
  const dashboardSnapshotRef = useRef<DashboardSummary | null>(null);
  const quickSearchRef = useRef<HTMLInputElement | null>(null);

  const selectedEstablishment = useMemo(
    () => establishments.find((item) => item.id === establishmentId) ?? null,
    [establishmentId, establishments],
  );

  const selectedBatch = useMemo(
    () => batches.find((batch) => batch.id === selectedBatchId) ?? null,
    [batches, selectedBatchId],
  );

  const visibleBatches = useMemo(() => {
    const normalized = searchTerm.trim().toLowerCase();
    if (!normalized) return batches;

    return batches.filter((batch) => {
      const byLot = batch.lot_code.toLowerCase().includes(normalized);
      const byProduct = batch.products?.name.toLowerCase().includes(normalized) ?? false;
      const bySku = batch.products?.sku.toLowerCase().includes(normalized) ?? false;
      const byStatus = batch.status.toLowerCase().includes(normalized);
      return byLot || byProduct || bySku || byStatus;
    });
  }, [batches, searchTerm]);

  function resetDashboardTrend() {
    dashboardSnapshotRef.current = null;
    setDashboardDelta({ critical: 0, warning: 0, replenishment: 0 });
  }

  useEffect(() => {
    async function loadEstablishments() {
      setInitialLoading(true);
      setError("");
      try {
        const response = await fetch("/api/establishments", { credentials: "include" });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Falha ao carregar estabelecimentos.");
        const data = (body.data ?? []) as Establishment[];
        setEstablishments(data);
        if (data.length > 0) {
          resetDashboardTrend();
          setEstablishmentId(data[0].id);
        }
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Falha ao carregar estabelecimentos.");
      } finally {
        setInitialLoading(false);
      }
    }
    loadEstablishments();
  }, []);

  useEffect(() => {
    async function loadProducts() {
      if (!selectedEstablishment) return;
      const response = await fetch(
        `/api/products/list?organizationId=${selectedEstablishment.organization_id}`,
        { credentials: "include" },
      );
      const body = await response.json();
      if (!response.ok) return;
      setProducts((body.data ?? []) as Product[]);
    }
    loadProducts();
  }, [selectedEstablishment]);

  useEffect(() => {
    async function loadDashboard() {
      if (!establishmentId) return;
      const response = await fetch(
        `/api/dashboard/summary?establishmentId=${establishmentId}`,
        { credentials: "include" },
      );
      const body = await response.json();
      if (!response.ok) return;
      const nextDashboard = (body.data ?? {
        critical: 0,
        warning: 0,
        replenishment: 0,
      }) as DashboardSummary;
      const previous = dashboardSnapshotRef.current;
      if (previous) {
        setDashboardDelta({
          critical: nextDashboard.critical - previous.critical,
          warning: nextDashboard.warning - previous.warning,
          replenishment: nextDashboard.replenishment - previous.replenishment,
        });
      }
      dashboardSnapshotRef.current = nextDashboard;
      setDashboard(nextDashboard);
    }
    loadDashboard();
  }, [establishmentId]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName.toLowerCase();
      const isTypingField =
        tag === "input" || tag === "textarea" || tag === "select" || target?.isContentEditable;

      if (event.key === "/" && !event.ctrlKey && !event.metaKey && !event.altKey && !isTypingField) {
        event.preventDefault();
        quickSearchRef.current?.focus();
      }

      if (event.key === "Escape" && selectedBatchId) {
        setSelectedBatchId("");
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedBatchId]);

  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    if (!establishmentId || initialLoading) return;
    void loadBatches();
    void loadHistory();
    void loadActivityFeed();
  }, [establishmentId, statusFilter, expiryFilter, productFilter, quarantineFilter, initialLoading]);
  /* eslint-enable react-hooks/exhaustive-deps */

  async function loadBatches() {
    if (!establishmentId) return;
    setError("");
    setSuccess("");
    setLoading(true);
    try {
      const params = new URLSearchParams({ establishmentId });
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (productFilter !== "all") params.set("productId", productFilter);
      if (quarantineFilter !== "all") params.set("quarantined", quarantineFilter);
      if (expiryFilter !== "all") params.set("expiry", expiryFilter);

      const response = await fetch(`/api/batches/list?${params.toString()}`, {
        credentials: "include",
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Erro ao listar lotes.");
      setBatches(body.data ?? []);
      setSelectedBatchId("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Erro ao listar lotes.");
    } finally {
      setLoading(false);
    }
  }

  async function updateBatch(event: FormEvent) {
    event.preventDefault();
    if (!selectedBatch) return;
    setError("");
    setSuccess("");

    const payload = {
      establishmentId,
      expectedVersion: selectedBatch.version,
      quarantined: quarantined === "true",
      expiryDate,
    };

    const response = await fetch(`/api/batches/${selectedBatch.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    });
    const body = await response.json();

    if (response.status === 409 && body.code === "OPTIMISTIC_CONFLICT") {
      const conflictBody = body as ConflictResponse;
      setConflict(conflictBody.conflict);
      return;
    }
    if (!response.ok) {
      setError(body.error ?? "Falha ao atualizar lote.");
      return;
    }

    setSuccess("Lote atualizado com sucesso.");
    setConflict(null);
    await loadBatches();
    const summaryResponse = await fetch(`/api/dashboard/summary?establishmentId=${establishmentId}`, {
      credentials: "include",
    });
    const summaryBody = await summaryResponse.json();
    if (summaryResponse.ok) {
      const nextDashboard = summaryBody.data as DashboardSummary;
      const previous = dashboardSnapshotRef.current;
      if (previous) {
        setDashboardDelta({
          critical: nextDashboard.critical - previous.critical,
          warning: nextDashboard.warning - previous.warning,
          replenishment: nextDashboard.replenishment - previous.replenishment,
        });
      }
      dashboardSnapshotRef.current = nextDashboard;
      setDashboard(nextDashboard);
    }
  }

  async function loadPvpsSuggestion() {
    if (!establishmentId || productFilter === "all") return;
    const response = await fetch(
      `/api/batches/pvps-suggestion?establishmentId=${establishmentId}&productId=${productFilter}`,
      { credentials: "include" },
    );
    const body = await response.json();
    if (!response.ok) return;
    setPvpsSuggestion((body.data ?? null) as PvpsSuggestion | null);
  }

  async function snoozeSelectedBatch() {
    if (!selectedBatch) return;
    setError("");
    setSuccess("");
    const response = await fetch("/api/alerts/snooze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        establishmentId,
        batchId: selectedBatch.id,
        hours: Number(snoozeHours),
      }),
    });
    const body = await response.json();
    if (!response.ok) {
      setError(body.error ?? "Falha ao aplicar snooze.");
      return;
    }
    setSuccess(`Alerta silenciado ate ${new Date(body.data.snoozedUntil).toLocaleString("pt-BR")}.`);
  }

  async function archiveZeroBalance() {
    if (!establishmentId) return;
    const response = await fetch(`/api/batches/archive-zero-balance?establishmentId=${establishmentId}`, {
      method: "POST",
      credentials: "include",
    });
    const body = await response.json();
    if (!response.ok) {
      setError(body.error ?? "Falha no arquivamento.");
      return;
    }
    setSuccess(`${body.data.archivedCount} lotes arquivados.`);
  }

  async function loadHistory() {
    if (!establishmentId) return;
    const response = await fetch(`/api/batches/history?establishmentId=${establishmentId}&page=1&pageSize=20`, {
      credentials: "include",
    });
    const body = await response.json();
    if (!response.ok) return;
    setHistoryCount(Number(body.pagination?.total ?? 0));
  }

  async function loadLossReport() {
    if (!establishmentId || !lossFrom || !lossTo) return;
    const response = await fetch(
      `/api/reports/losses?establishmentId=${establishmentId}&from=${lossFrom}&to=${lossTo}`,
      { credentials: "include" },
    );
    const body = await response.json();
    if (!response.ok) {
      setError(body.error ?? "Falha ao carregar relatorio de perdas.");
      return;
    }
    setLossReport((body.data ?? null) as LossReport | null);
  }

  async function loadActivityFeed() {
    if (!establishmentId) return;
    const response = await fetch(`/api/activity-feed?establishmentId=${establishmentId}&limit=20`, {
      credentials: "include",
    });
    const body = await response.json();
    if (!response.ok) return;
    setActivityFeed((body.data ?? []) as ActivityItem[]);
  }

  function resetFilters() {
    setStatusFilter("all");
    setExpiryFilter("all");
    setProductFilter("all");
    setQuarantineFilter("all");
    setSearchTerm("");
    setPvpsSuggestion(null);
  }

  async function applyMerge(strategy: "client_wins" | "field_level") {
    if (!selectedBatch || !conflict) return;

    const resolved =
      strategy === "field_level"
        ? {
            quarantined:
              resolution.quarantined === "client"
                ? quarantined === "true"
                : conflict.serverState.quarantined,
            expiryDate:
              resolution.expiryDate === "client" ? expiryDate : conflict.serverState.expiryDate,
          }
        : undefined;

    const response = await fetch(`/api/batches/${selectedBatch.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        establishmentId,
        expectedVersion: conflict.expectedVersion,
        quarantined: quarantined === "true",
        expiryDate,
        merge: { strategy, resolved },
      }),
    });
    const body = await response.json();
    if (!response.ok) {
      setError(body.error ?? "Falha ao aplicar merge.");
      return;
    }

    setConflict(null);
    setSuccess("Merge aplicado e lote atualizado.");
    await loadBatches();
    const summaryResponse = await fetch(`/api/dashboard/summary?establishmentId=${establishmentId}`, {
      credentials: "include",
    });
    const summaryBody = await summaryResponse.json();
    if (summaryResponse.ok) {
      const nextDashboard = summaryBody.data as DashboardSummary;
      const previous = dashboardSnapshotRef.current;
      if (previous) {
        setDashboardDelta({
          critical: nextDashboard.critical - previous.critical,
          warning: nextDashboard.warning - previous.warning,
          replenishment: nextDashboard.replenishment - previous.replenishment,
        });
      }
      dashboardSnapshotRef.current = nextDashboard;
      setDashboard(nextDashboard);
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    window.location.href = "/login";
  }

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <section className={`${styles.card} ${styles.commandBar}`}>
          <div className={styles.headerTop}>
            <h1 className={styles.title}>Operacao Diaria de Estoque</h1>
            <p className={styles.subtitle}>Painel de monitoramento e acao rapida por lote</p>
          </div>
          {initialLoading ? <p className={styles.stateInfo}>Carregando estabelecimentos...</p> : null}
          <div className={styles.commandGrid}>
            <label className={styles.field}>
              Estabelecimento
              <select
                className={styles.select}
                value={establishmentId}
                onChange={(e) => {
                  resetDashboardTrend();
                  setEstablishmentId(e.target.value);
                }}
                disabled={initialLoading || establishments.length === 0}
              >
                {establishments.length === 0 ? (
                  <option value="">Nenhum estabelecimento disponivel</option>
                ) : null}
                {establishments.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              Busca rapida
              <input
                className={styles.input}
                ref={quickSearchRef}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Lote, produto, SKU ou status"
              />
            </label>
          </div>
          <div className={styles.actions}>
            <button className={styles.button} onClick={loadBatches} disabled={loading || !establishmentId}>
              {loading ? "Carregando..." : "Atualizar operacao"}
            </button>
            <button className={styles.buttonSecondary} type="button" onClick={resetFilters}>
              Limpar filtros
            </button>
            <button
              className={styles.buttonSecondary}
              type="button"
              onClick={() => {
                window.location.href = "/history";
              }}
            >
              Historico
            </button>
            <button className={styles.buttonSecondary} onClick={logout} type="button">
              Sair
            </button>
          </div>
        </section>

        <section className={styles.card}>
          <h2 className={styles.sectionTitle}>Assistente PVPS</h2>
          <div className={styles.actions}>
            <button
              className={styles.buttonSecondary}
              onClick={loadPvpsSuggestion}
              type="button"
              disabled={productFilter === "all"}
            >
              Sugerir lote PVPS
            </button>
          </div>
          {productFilter === "all" ? (
            <p className={styles.stateInfo}>Selecione um produto no filtro para habilitar a sugestao PVPS.</p>
          ) : null}
          {pvpsSuggestion ? (
            <p className={styles.stateInfo}>
              Sugestao: {pvpsSuggestion.suggestedBatchId ?? "sem lote elegivel"} | validade:{" "}
              {pvpsSuggestion.expiryDate ? toLocalDateLabel(pvpsSuggestion.expiryDate) : "-"} | qtd:{" "}
              {pvpsSuggestion.availableQuantity}
            </p>
          ) : null}
        </section>

        <section className={styles.semaphoreGrid}>
          <article className={`${styles.semaphoreCard} ${styles.critical}`}>
            <p>Critico</p>
            <strong>{dashboard.critical}</strong>
            <small className={styles[`delta_${deltaTone(dashboardDelta.critical)}`]}>
              {formatDelta(dashboardDelta.critical)} desde a ultima leitura
            </small>
          </article>
          <article className={`${styles.semaphoreCard} ${styles.warning}`}>
            <p>Atencao</p>
            <strong>{dashboard.warning}</strong>
            <small className={styles[`delta_${deltaTone(dashboardDelta.warning)}`]}>
              {formatDelta(dashboardDelta.warning)} desde a ultima leitura
            </small>
          </article>
          <article className={`${styles.semaphoreCard} ${styles.replenish}`}>
            <p>Reposicao</p>
            <strong>{dashboard.replenishment}</strong>
            <small className={styles[`delta_${deltaTone(dashboardDelta.replenishment)}`]}>
              {formatDelta(dashboardDelta.replenishment)} desde a ultima leitura
            </small>
          </article>
        </section>

        <section className={styles.card}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Radar de Lotes</h2>
            <p className={styles.sectionHint}>Refine por status, vencimento, produto e quarentena</p>
          </div>
          <div className={styles.row}>
            <label className={styles.field}>
              Status
              <select className={styles.select} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="all">Todos</option>
                <option value="active">Ativo</option>
                <option value="alert">Atencao</option>
                <option value="expired">Vencido</option>
                <option value="quarantine">Quarentena</option>
              </select>
            </label>
            <label className={styles.field}>
              Vencimento
              <select className={styles.select} value={expiryFilter} onChange={(e) => setExpiryFilter(e.target.value)}>
                <option value="all">Todos</option>
                <option value="expired">Vencidos</option>
                <option value="today">Vence hoje</option>
                <option value="next_7_days">Proximos 7 dias</option>
                <option value="next_30_days">Proximos 30 dias</option>
              </select>
            </label>
            <label className={styles.field}>
              Produto
              <select className={styles.select} value={productFilter} onChange={(e) => setProductFilter(e.target.value)}>
                <option value="all">Todos</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name} ({product.sku})
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              Quarentena
              <select className={styles.select} value={quarantineFilter} onChange={(e) => setQuarantineFilter(e.target.value)}>
                <option value="all">Todos</option>
                <option value="true">Em quarentena</option>
                <option value="false">Liberados</option>
              </select>
            </label>
          </div>
        </section>

        <section className={styles.card}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Lotes Encontrados</h2>
            <p className={styles.sectionHint}>{visibleBatches.length} registros</p>
          </div>
          {loading ? <p className={styles.stateInfo}>Carregando lotes...</p> : null}
          {!loading && visibleBatches.length === 0 ? (
            <p className={styles.stateInfo}>Nenhum lote para os filtros selecionados.</p>
          ) : null}
          {visibleBatches.length > 0 ? (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Lote</th>
                    <th>Produto</th>
                    <th>Validade</th>
                    <th>Status</th>
                    <th>Quarentena</th>
                    <th>Versao</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleBatches.map((batch) => (
                    <tr
                      key={batch.id}
                      className={selectedBatchId === batch.id ? styles.rowSelected : undefined}
                      onClick={() => {
                        setSelectedBatchId(batch.id);
                        setQuarantined(String(batch.quarantined));
                        setExpiryDate(batch.expiry_date);
                      }}
                    >
                      <td>{batch.lot_code}</td>
                      <td>{batch.products?.name ?? "Sem produto"}</td>
                      <td>{toLocalDateLabel(batch.expiry_date)}</td>
                      <td>
                        <span className={`${styles.statusBadge} ${styles[`status_${batch.status}`]}`}>
                          {batch.status}
                        </span>
                      </td>
                      <td>{batch.quarantined ? "Sim" : "Nao"}</td>
                      <td>{batch.version}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>

        <section className={styles.card}>
          <h2 className={styles.sectionTitle}>Arquivamento e Perdas</h2>
          <div className={styles.actions}>
            <button className={styles.buttonSecondary} type="button" onClick={archiveZeroBalance}>
              Arquivar lotes zerados (+7 dias)
            </button>
            <button className={styles.buttonSecondary} type="button" onClick={loadHistory}>
              Ver historico
            </button>
          </div>
          <p className={styles.stateInfo}>Total no historico: {historyCount}</p>
          <div className={styles.row}>
            <label className={styles.field}>
              De
              <input className={styles.input} type="date" value={lossFrom} onChange={(e) => setLossFrom(e.target.value)} />
            </label>
            <label className={styles.field}>
              Ate
              <input className={styles.input} type="date" value={lossTo} onChange={(e) => setLossTo(e.target.value)} />
            </label>
          </div>
          <div className={styles.actions}>
            <button className={styles.button} type="button" onClick={loadLossReport} disabled={!lossFrom || !lossTo}>
              Gerar relatorio de perdas
            </button>
          </div>
          {lossReport ? (
            <p className={styles.stateInfo}>
              Movimentos: {lossReport.totalMovements} | Perda total: R${" "}
              {lossReport.totalLossValue.toFixed(2)}
            </p>
          ) : null}
        </section>

        <section className={styles.card}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Atividade Recente</h2>
            <button className={styles.buttonSecondary} type="button" onClick={loadActivityFeed}>
              Atualizar feed
            </button>
          </div>
          {activityFeed.length === 0 ? (
            <p className={styles.stateInfo}>Nenhuma atividade recente.</p>
          ) : (
            <div className={styles.feedList}>
              {activityFeed.map((item) => (
                <article key={item.references.movementId} className={styles.feedItem}>
                  <p className={styles.feedMessage}>{item.message}</p>
                  <p className={styles.feedMeta}>
                    {toLocalDateTimeLabel(item.at)} | Movimento: {item.references.movementId}
                  </p>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      {selectedBatch ? <div className={styles.drawerBackdrop} onClick={() => setSelectedBatchId("")} /> : null}
      <aside className={`${styles.drawer} ${selectedBatch ? styles.drawerOpen : ""}`}>
        <div className={styles.drawerHeader}>
          <h2>Painel de Acao do Lote</h2>
          <button className={styles.iconButton} type="button" onClick={() => setSelectedBatchId("")}>
            Fechar
          </button>
        </div>
        <p className={styles.sectionHint}>Edite quarentena, validade e alerta do lote selecionado.</p>
        <form onSubmit={updateBatch} className={styles.drawerForm}>
          <label className={styles.field}>
            Lote selecionado
            <input className={styles.input} value={selectedBatch?.lot_code ?? ""} readOnly />
          </label>
          <label className={styles.field}>
            Quarentena
            <select className={styles.select} value={quarantined} onChange={(e) => setQuarantined(e.target.value)}>
              <option value="false">Nao</option>
              <option value="true">Sim</option>
            </select>
          </label>
          <label className={styles.field}>
            Validade
            <input
              className={styles.input}
              type="date"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
            />
          </label>
          <label className={styles.field}>
            Snooze de alerta
            <select className={styles.select} value={snoozeHours} onChange={(e) => setSnoozeHours(e.target.value as "24" | "48")}>
              <option value="24">24 horas</option>
              <option value="48">48 horas</option>
            </select>
          </label>
          <div className={styles.drawerActions}>
            <button className={styles.button} type="submit" disabled={!selectedBatch}>
              Salvar alteracoes
            </button>
            <button className={styles.buttonSecondary} type="button" disabled={!selectedBatch} onClick={snoozeSelectedBatch}>
              Silenciar alerta
            </button>
          </div>
          {error ? <p className={styles.stateError}>{error}</p> : null}
          {success ? <p className={styles.stateSuccess}>{success}</p> : null}
        </form>
      </aside>

      {conflict ? (
        <div className={styles.overlay}>
          <div className={styles.modal}>
            <h2>Conflito de versao detectado</h2>
            <p>
              Sua versao: {conflict.expectedVersion} | Versao atual: {conflict.currentVersion}
            </p>
            <table className={styles.diffTable}>
              <thead>
                <tr>
                  <th>Campo</th>
                  <th>Cliente</th>
                  <th>Servidor</th>
                  <th>Resolver com</th>
                </tr>
              </thead>
              <tbody>
                {conflict.fieldDiff.map((item) => (
                  <tr key={item.field}>
                    <td>{item.field}</td>
                    <td>{String(item.clientValue)}</td>
                    <td>{String(item.serverValue)}</td>
                    <td>
                      <label>
                        <input
                          type="radio"
                          checked={resolution[item.field] === "client"}
                          onChange={() =>
                            setResolution((prev) => ({ ...prev, [item.field]: "client" }))
                          }
                        />
                        Cliente
                      </label>{" "}
                      <label>
                        <input
                          type="radio"
                          checked={resolution[item.field] === "server"}
                          onChange={() =>
                            setResolution((prev) => ({ ...prev, [item.field]: "server" }))
                          }
                        />
                        Servidor
                      </label>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className={styles.actions}>
              <button className={styles.buttonSecondary} onClick={() => applyMerge("field_level")}>
                Aplicar merge por campo
              </button>
              <button className={styles.button} onClick={() => applyMerge("client_wins")}>
                Forcar client_wins
              </button>
              <button className={styles.buttonSecondary} onClick={() => setConflict(null)}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
