"use client";

import { FormEvent, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
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

type Category = {
  id: string;
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

type AlertItem = {
  id: string;
  lotCode: string;
  expiryDate: string;
  quarantined: boolean;
  version: number;
  createdAt: string;
  product: { id: string; name: string; sku: string } | null;
  status: BatchStatus;
  leadTimeAlertDays: number;
  snoozedUntil: string | null;
  snoozed: boolean;
};

type AlertSummary = {
  expired: number;
  alert: number;
  quarantine: number;
  total: number;
  snoozed: number;
};

type AlertPagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

type AlertPreferences = {
  criticalOnly: boolean;
  dailyDigest: boolean;
  muteNonExpired: boolean;
};

type RoleOption = {
  id: string;
  name: string;
};

type InvitationRecord = {
  id: string;
  email: string;
  role_id: string;
  status: "pending" | "accepted" | "revoked" | "expired";
  created_at: string;
  expires_at: string | null;
};

type PendingInvitation = {
  invitation_id: string;
  establishment_id: string;
  establishment_name: string;
  role_id: string;
  role_name: string;
  email: string;
  expires_at: string | null;
  created_at: string;
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

type WorkspaceView = "operation" | "alerts" | "catalog" | "history" | "access";
type AlertScope = "all" | "expired" | "alert" | "quarantine";

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

function maskQuantityInput(value: string): string {
  const normalized = value.replace(/[^\d,]/g, "");
  if (!normalized) return "";

  const [integerRaw, ...decimalParts] = normalized.split(",");
  const integer = (integerRaw || "0").replace(/^0+(?=\d)/, "");
  const decimal = decimalParts.join("").slice(0, 4);
  const groupedInteger = (integer || "0").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return decimal ? `${groupedInteger},${decimal}` : groupedInteger;
}

function parsePtBrNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function statusLabel(status: BatchStatus): string {
  switch (status) {
    case "active":
      return "Ativo";
    case "alert":
      return "Atencao";
    case "expired":
      return "Vencido";
    case "quarantine":
      return "Quarentena";
    default:
      return status;
  }
}

function priorityWeight(status: BatchStatus): number {
  if (status === "expired") return 0;
  if (status === "quarantine") return 1;
  if (status === "alert") return 2;
  return 3;
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
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>("operation");
  const [alertScope, setAlertScope] = useState<AlertScope>("all");
  const [alertItems, setAlertItems] = useState<AlertItem[]>([]);
  const [alertLoading, setAlertLoading] = useState(false);
  const [alertPage, setAlertPage] = useState(1);
  const [alertSummary, setAlertSummary] = useState<AlertSummary>({
    expired: 0,
    alert: 0,
    quarantine: 0,
    total: 0,
    snoozed: 0,
  });
  const [alertPagination, setAlertPagination] = useState<AlertPagination>({
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 0,
  });
  const [alertPreferences, setAlertPreferences] = useState<AlertPreferences>({
    criticalOnly: false,
    dailyDigest: true,
    muteNonExpired: false,
  });
  const [alertPreferencesLoading, setAlertPreferencesLoading] = useState(false);
  const [alertPreferencesSaving, setAlertPreferencesSaving] = useState(false);
  const [alertPreferencesMessage, setAlertPreferencesMessage] = useState("");
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
  const [organizationName, setOrganizationName] = useState("");
  const [newEstablishmentName, setNewEstablishmentName] = useState("");
  const [bootstrapLoading, setBootstrapLoading] = useState(false);
  const [bootstrapError, setBootstrapError] = useState("");
  const [bootstrapSuccess, setBootstrapSuccess] = useState("");
  const [invitationCode, setInvitationCode] = useState("");
  const [pendingInvitations, setPendingInvitations] = useState<PendingInvitation[]>([]);
  const [pendingInviteError, setPendingInviteError] = useState("");
  const [pendingInviteSuccess, setPendingInviteSuccess] = useState("");
  const [acceptingInvitationId, setAcceptingInvitationId] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRoleId, setInviteRoleId] = useState("");
  const [creatingInvitation, setCreatingInvitation] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [inviteSuccess, setInviteSuccess] = useState("");
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [invitations, setInvitations] = useState<InvitationRecord[]>([]);
  const [productName, setProductName] = useState("");
  const [productSku, setProductSku] = useState("");
  const [productUom, setProductUom] = useState("un");
  const [productMinimumStock, setProductMinimumStock] = useState("0");
  const [productCategoryId, setProductCategoryId] = useState("");
  const [inboundProductId, setInboundProductId] = useState("");
  const [inboundLotCode, setInboundLotCode] = useState("");
  const [inboundExpiryDate, setInboundExpiryDate] = useState("");
  const [inboundQuantity, setInboundQuantity] = useState("");
  const [inboundLocationId, setInboundLocationId] = useState("");
  const [catalogError, setCatalogError] = useState("");
  const [catalogSuccess, setCatalogSuccess] = useState("");
  const [creatingProduct, setCreatingProduct] = useState(false);
  const [creatingInboundBatch, setCreatingInboundBatch] = useState(false);
  const dashboardSnapshotRef = useRef<DashboardSummary | null>(null);
  const quickSearchRef = useRef<HTMLInputElement | null>(null);
  const alertPreferencesKeyRef = useRef("");
  const deferredSearchTerm = useDeferredValue(searchTerm.trim());
  const inboundQuantityValue = useMemo(() => parsePtBrNumber(inboundQuantity), [inboundQuantity]);
  const inboundQuantityInvalid = inboundQuantity !== "" && (inboundQuantityValue === null || inboundQuantityValue <= 0);

  const selectedEstablishment = useMemo(
    () => establishments.find((item) => item.id === establishmentId) ?? null,
    [establishmentId, establishments],
  );

  const selectedBatch = useMemo(() => {
    const fromBatches = batches.find((batch) => batch.id === selectedBatchId);
    if (fromBatches) return fromBatches;

    const fromAlerts = alertItems.find((item) => item.id === selectedBatchId);
    if (!fromAlerts) return null;

    return {
      id: fromAlerts.id,
      lot_code: fromAlerts.lotCode,
      expiry_date: fromAlerts.expiryDate,
      quarantined: fromAlerts.quarantined,
      version: fromAlerts.version,
      status: fromAlerts.status,
      products: fromAlerts.product,
    } satisfies Batch;
  }, [batches, selectedBatchId, alertItems]);

  const selectedInboundProduct = useMemo(
    () => products.find((product) => product.id === inboundProductId) ?? null,
    [products, inboundProductId],
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

  const prioritizedBatches = useMemo(() => {
    const sorted = [...visibleBatches].sort((left, right) => {
      const byPriority = priorityWeight(left.status) - priorityWeight(right.status);
      if (byPriority !== 0) return byPriority;
      const byExpiry = left.expiry_date.localeCompare(right.expiry_date);
      if (byExpiry !== 0) return byExpiry;
      return left.lot_code.localeCompare(right.lot_code);
    });
    return sorted.slice(0, 8);
  }, [visibleBatches]);

  function resetDashboardTrend() {
    dashboardSnapshotRef.current = null;
    setDashboardDelta({ critical: 0, warning: 0, replenishment: 0 });
  }

  const loadEstablishments = useCallback(async (preferredEstablishmentId?: string) => {
    await Promise.resolve();
    setInitialLoading(true);
    setError("");
    try {
      const response = await fetch("/api/establishments", { credentials: "include" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Falha ao carregar estabelecimentos.");
      const data = (body.data ?? []) as Establishment[];
      setEstablishments(data);

      setEstablishmentId((current) => {
        if (data.length === 0) return "";
        if (preferredEstablishmentId && data.some((item) => item.id === preferredEstablishmentId)) {
          return preferredEstablishmentId;
        }
        if (current && data.some((item) => item.id === current)) {
          return current;
        }
        return data[0].id;
      });
      dashboardSnapshotRef.current = null;
      setDashboardDelta({ critical: 0, warning: 0, replenishment: 0 });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Falha ao carregar estabelecimentos.");
    } finally {
      setInitialLoading(false);
    }
  }, []);

  const loadPendingInvitations = useCallback(async () => {
    setPendingInviteError("");
    try {
      const response = await fetch("/api/invitations/pending", { credentials: "include" });
      const body = await response.json();
      if (!response.ok) {
        setPendingInvitations([]);
        setPendingInviteError(body.error ?? "Falha ao carregar convites pendentes.");
        return;
      }
      setPendingInvitations((body.data ?? []) as PendingInvitation[]);
    } catch {
      setPendingInvitations([]);
      setPendingInviteError("Falha ao carregar convites pendentes.");
    }
  }, []);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    void loadEstablishments();
    void loadPendingInvitations();
  }, [loadEstablishments, loadPendingInvitations]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    async function loadAdminRolesAndInvitations() {
      if (!establishmentId) {
        setRoles([]);
        setInvitations([]);
        return;
      }

      const rolesResponse = await fetch(`/api/admin/roles?establishmentId=${establishmentId}`, {
        credentials: "include",
      });
      const rolesBody = await rolesResponse.json();
      if (!rolesResponse.ok) {
        setRoles([]);
        setInvitations([]);
        setInviteRoleId("");
        return;
      }

      const nextRoles = (rolesBody.data ?? []) as RoleOption[];
      setRoles(nextRoles);
      const operatorRole = nextRoles.find((role) => role.name === "operador");
      const fallbackRoleId = operatorRole?.id ?? nextRoles[0]?.id ?? "";
      setInviteRoleId((current) =>
        current && nextRoles.some((role) => role.id === current) ? current : fallbackRoleId,
      );

      const invitationsResponse = await fetch(`/api/admin/invitations?establishmentId=${establishmentId}`, {
        credentials: "include",
      });
      const invitationsBody = await invitationsResponse.json();
      if (!invitationsResponse.ok) {
        setInvitations([]);
        return;
      }

      setInvitations((invitationsBody.data ?? []) as InvitationRecord[]);
    }

    void loadAdminRolesAndInvitations();
  }, [establishmentId]);

  useEffect(() => {
    async function loadProducts() {
      if (!selectedEstablishment) return;
      const response = await fetch(
        `/api/products/list?organizationId=${selectedEstablishment.organization_id}&establishmentId=${selectedEstablishment.id}`,
        { credentials: "include" },
      );
      const body = await response.json();
      if (!response.ok) return;
      const nextProducts = (body.data ?? []) as Product[];
      setProducts(nextProducts);
      setInboundProductId((current) =>
        current && nextProducts.some((product) => product.id === current)
          ? current
          : (nextProducts[0]?.id ?? ""),
      );
    }
    loadProducts();
  }, [selectedEstablishment]);

  useEffect(() => {
    async function loadCategories() {
      if (!selectedEstablishment) return;
      const response = await fetch(
        `/api/categories/list?organizationId=${selectedEstablishment.organization_id}&establishmentId=${selectedEstablishment.id}`,
        { credentials: "include" },
      );
      const body = await response.json();
      if (!response.ok) return;
      const nextCategories = (body.data ?? []) as Category[];
      setProductCategoryId((current) =>
        current && nextCategories.some((category) => category.id === current)
          ? current
          : (nextCategories[0]?.id ?? ""),
      );
    }
    loadCategories();
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

  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    if (!establishmentId || initialLoading || workspaceView !== "alerts") return;
    void loadAlerts();
  }, [establishmentId, alertScope, deferredSearchTerm, alertPage, workspaceView, initialLoading]);
  /* eslint-enable react-hooks/exhaustive-deps */

  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    if (!establishmentId || initialLoading || workspaceView !== "alerts") return;
    if (alertPreferencesKeyRef.current === establishmentId) return;
    alertPreferencesKeyRef.current = establishmentId;
    void loadAlertPreferences();
  }, [establishmentId, workspaceView, initialLoading]);
  /* eslint-enable react-hooks/exhaustive-deps */

  async function refreshDashboardSummary() {
    if (!establishmentId) return;
    const summaryResponse = await fetch(`/api/dashboard/summary?establishmentId=${establishmentId}`, {
      credentials: "include",
    });
    const summaryBody = await summaryResponse.json();
    if (!summaryResponse.ok) return;
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

  async function bootstrapWorkspace(event: FormEvent) {
    event.preventDefault();
    setBootstrapError("");
    setBootstrapSuccess("");
    setPendingInviteSuccess("");
    setBootstrapLoading(true);
    try {
      const response = await fetch("/api/onboarding/bootstrap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          organizationName,
          establishmentName: newEstablishmentName,
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        setBootstrapError(body.error ?? "Falha ao criar organizacao e estabelecimento.");
        return;
      }

      const createdEstablishmentId = String((body.data as { establishmentId?: string } | null)?.establishmentId ?? "");
      await loadEstablishments(createdEstablishmentId || undefined);
      await loadPendingInvitations();
      setOrganizationName("");
      setNewEstablishmentName("");
      setBootstrapSuccess("Estabelecimento criado. Voce agora tem acesso total para cadastrar produtos e lotes.");
    } catch {
      setBootstrapError("Falha ao criar organizacao e estabelecimento.");
    } finally {
      setBootstrapLoading(false);
    }
  }

  async function createInvitation(event: FormEvent) {
    event.preventDefault();
    if (!establishmentId) return;
    setInviteError("");
    setInviteSuccess("");
    setCreatingInvitation(true);
    try {
      const response = await fetch("/api/admin/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          establishmentId,
          email: inviteEmail,
          roleId: inviteRoleId || undefined,
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        setInviteError(body.error ?? "Falha ao criar convite.");
        return;
      }

      const createdInvitation = (body.data ?? null) as InvitationRecord | null;
      setInvitations((current) => (createdInvitation ? [createdInvitation, ...current] : current));
      setInviteEmail("");
      setInviteSuccess("Convite criado com sucesso.");
      await loadPendingInvitations();
    } catch {
      setInviteError("Falha ao criar convite.");
    } finally {
      setCreatingInvitation(false);
    }
  }

  async function revokeInvitation(invitationId: string) {
    if (!establishmentId) return;
    setInviteError("");
    setInviteSuccess("");
    const response = await fetch("/api/admin/invitations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ establishmentId, invitationId }),
    });
    const body = await response.json();
    if (!response.ok) {
      setInviteError(body.error ?? "Falha ao revogar convite.");
      return;
    }

    setInvitations((current) =>
      current.map((invitation) =>
        invitation.id === invitationId ? { ...invitation, status: "revoked" } : invitation,
      ),
    );
    setInviteSuccess("Convite revogado.");
    await loadPendingInvitations();
  }

  async function acceptInvitation(invitationId: string) {
    setPendingInviteError("");
    setPendingInviteSuccess("");
    setAcceptingInvitationId(invitationId);
    try {
      const response = await fetch("/api/admin/invitations/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ invitationId }),
      });
      const body = await response.json();
      if (!response.ok) {
        setPendingInviteError(body.error ?? "Falha ao aceitar convite.");
        return;
      }

      const acceptedEstablishmentId = String(
        (body.data as { establishmentId?: string } | null)?.establishmentId ?? "",
      );
      await loadEstablishments(acceptedEstablishmentId || undefined);
      await loadPendingInvitations();
      setPendingInviteSuccess("Convite aceito. Estabelecimento liberado no seletor.");
      setInvitationCode("");
    } catch {
      setPendingInviteError("Falha ao aceitar convite.");
    } finally {
      setAcceptingInvitationId("");
    }
  }

  async function acceptInvitationByCode(event: FormEvent) {
    event.preventDefault();
    if (!invitationCode.trim()) {
      setPendingInviteError("Informe o codigo do convite.");
      return;
    }
    await acceptInvitation(invitationCode.trim());
  }

  async function createProduct(event: FormEvent) {
    event.preventDefault();
    if (!selectedEstablishment || !establishmentId) return;
    setCatalogError("");
    setCatalogSuccess("");
    setCreatingProduct(true);
    try {
      let categoryId = productCategoryId;
      if (!categoryId) {
        const categoryResponse = await fetch("/api/categories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            establishmentId,
            organizationId: selectedEstablishment.organization_id,
            name: "Categoria padrao",
            leadTimeAlertDays: 0,
          }),
        });
        const categoryBody = await categoryResponse.json();
        if (!categoryResponse.ok) {
          setCatalogError(categoryBody.error ?? "Falha ao criar categoria padrao.");
          return;
        }

        categoryId = String((categoryBody.data as { id?: string } | null)?.id ?? "");
        if (!categoryId) {
          setCatalogError("Falha ao criar categoria padrao.");
          return;
        }

        setProductCategoryId(categoryId);
      }

      const response = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          establishmentId,
          organizationId: selectedEstablishment.organization_id,
          categoryId,
          sku: productSku,
          name: productName,
          uom: productUom,
          minimumStock: Number(productMinimumStock),
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        setCatalogError(body.error ?? "Falha ao cadastrar produto.");
        return;
      }

      setProductName("");
      setProductSku("");
      setProductUom("un");
      setProductMinimumStock("0");

      const productsResponse = await fetch(
        `/api/products/list?organizationId=${selectedEstablishment.organization_id}&establishmentId=${selectedEstablishment.id}`,
        { credentials: "include" },
      );
      const productsBody = await productsResponse.json();
      if (productsResponse.ok) {
        const nextProducts = (productsBody.data ?? []) as Product[];
        setProducts(nextProducts);
        setInboundProductId((current) =>
          current && nextProducts.some((product) => product.id === current)
            ? current
            : (nextProducts[0]?.id ?? ""),
        );
      }
      setCatalogSuccess("Produto cadastrado com sucesso.");
    } catch {
      setCatalogError("Falha ao cadastrar produto.");
    } finally {
      setCreatingProduct(false);
    }
  }

  async function createInboundBatch(event: FormEvent) {
    event.preventDefault();
    if (!establishmentId || !inboundProductId) return;
    if (inboundQuantityValue === null || inboundQuantityValue <= 0) {
      setCatalogError("Quantidade invalida. Use valor maior que zero.");
      return;
    }
    setCatalogError("");
    setCatalogSuccess("");
    setCreatingInboundBatch(true);
    try {
      const response = await fetch("/api/batches/inbound", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          establishmentId,
          productId: inboundProductId,
          lotCode: inboundLotCode,
          expiryDate: inboundExpiryDate,
          quantity: inboundQuantityValue,
          locationId: inboundLocationId.trim() || undefined,
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        setCatalogError(body.error ?? "Falha ao cadastrar lote.");
        return;
      }

      setCatalogSuccess("Lote de entrada cadastrado com sucesso.");
      setInboundLotCode("");
      setInboundExpiryDate("");
      setInboundQuantity("");
      setInboundLocationId("");
      await Promise.all([loadBatches(), loadHistory(), loadActivityFeed(), refreshDashboardSummary(), loadAlerts()]);
    } catch {
      setCatalogError("Falha ao cadastrar lote.");
    } finally {
      setCreatingInboundBatch(false);
    }
  }

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

  async function loadAlerts() {
    if (!establishmentId) return;
    setAlertLoading(true);
    try {
      const params = new URLSearchParams({
        establishmentId,
        scope: alertScope,
        page: String(alertPage),
        pageSize: String(alertPagination.pageSize),
      });
      if (deferredSearchTerm) params.set("q", deferredSearchTerm);

      const response = await fetch(`/api/alerts/list?${params.toString()}`, {
        credentials: "include",
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body.error ?? "Erro ao listar alertas.");
        setAlertItems([]);
        setAlertSummary({ expired: 0, alert: 0, quarantine: 0, total: 0, snoozed: 0 });
        setAlertPagination((current) => ({ ...current, total: 0, totalPages: 0 }));
        return;
      }
      setAlertItems((body.data ?? []) as AlertItem[]);
      setAlertSummary(
        (body.summary ?? { expired: 0, alert: 0, quarantine: 0, total: 0, snoozed: 0 }) as AlertSummary,
      );
      setAlertPagination(
        (body.pagination ?? {
          page: alertPage,
          pageSize: alertPagination.pageSize,
          total: 0,
          totalPages: 0,
        }) as AlertPagination,
      );
    } catch {
      setError("Erro ao listar alertas.");
      setAlertItems([]);
      setAlertSummary({ expired: 0, alert: 0, quarantine: 0, total: 0, snoozed: 0 });
      setAlertPagination((current) => ({ ...current, total: 0, totalPages: 0 }));
    } finally {
      setAlertLoading(false);
    }
  }

  async function loadAlertPreferences() {
    if (!establishmentId) return;
    setAlertPreferencesLoading(true);
    setAlertPreferencesMessage("");
    try {
      const response = await fetch(`/api/alerts/preferences?establishmentId=${establishmentId}`, {
        credentials: "include",
      });
      const body = await response.json();
      if (!response.ok) {
        setAlertPreferencesMessage(body.error ?? "Falha ao carregar preferencias.");
        return;
      }
      setAlertPreferences((body.data ?? {
        criticalOnly: false,
        dailyDigest: true,
        muteNonExpired: false,
      }) as AlertPreferences);
    } catch {
      setAlertPreferencesMessage("Falha ao carregar preferencias.");
    } finally {
      setAlertPreferencesLoading(false);
    }
  }

  async function saveAlertPreferences() {
    if (!establishmentId) return;
    setAlertPreferencesSaving(true);
    setAlertPreferencesMessage("");
    try {
      const response = await fetch("/api/alerts/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          establishmentId,
          criticalOnly: alertPreferences.criticalOnly,
          dailyDigest: alertPreferences.dailyDigest,
          muteNonExpired: alertPreferences.muteNonExpired,
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        setAlertPreferencesMessage(body.error ?? "Falha ao salvar preferencias.");
        return;
      }
      setAlertPreferences((body.data ?? alertPreferences) as AlertPreferences);
      setAlertPreferencesMessage("Preferencias de notificacao salvas.");
    } catch {
      setAlertPreferencesMessage("Falha ao salvar preferencias.");
    } finally {
      setAlertPreferencesSaving(false);
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
    await refreshDashboardSummary();
    await loadAlerts();
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
    await loadAlerts();
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
    await Promise.all([loadBatches(), loadAlerts()]);
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
    setAlertScope("all");
    setAlertPage(1);
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
    await refreshDashboardSummary();
    await loadAlerts();
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
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  if (workspaceView === "alerts") {
                    setAlertPage(1);
                  }
                }}
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
            <button className={styles.buttonSecondary} onClick={logout} type="button">
              Sair
            </button>
          </div>
          <div className={styles.viewTabs} role="tablist" aria-label="Visoes de trabalho">
            <button
              type="button"
              role="tab"
              aria-selected={workspaceView === "operation"}
              className={`${styles.viewTab} ${workspaceView === "operation" ? styles.viewTabActive : ""}`}
              onClick={() => setWorkspaceView("operation")}
            >
              Operacao
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={workspaceView === "alerts"}
              className={`${styles.viewTab} ${workspaceView === "alerts" ? styles.viewTabActive : ""}`}
              onClick={() => {
                setWorkspaceView("alerts");
                setAlertPage(1);
              }}
            >
              Alertas
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={workspaceView === "history"}
              className={`${styles.viewTab} ${workspaceView === "history" ? styles.viewTabActive : ""}`}
              onClick={() => setWorkspaceView("history")}
            >
              Historico
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={workspaceView === "catalog"}
              className={`${styles.viewTab} ${workspaceView === "catalog" ? styles.viewTabActive : ""}`}
              onClick={() => setWorkspaceView("catalog")}
            >
              Cadastro
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={workspaceView === "access"}
              className={`${styles.viewTab} ${workspaceView === "access" ? styles.viewTabActive : ""}`}
              onClick={() => setWorkspaceView("access")}
            >
              Acesso
            </button>
          </div>
        </section>

        {workspaceView !== "access" ? null : initialLoading ? null : establishments.length === 0 ? (
          <section className={styles.card}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Onboarding de Acesso</h2>
              <p className={styles.sectionHint}>Crie seu primeiro estabelecimento para liberar cadastro operacional</p>
            </div>
            <form className={styles.formBlock} onSubmit={bootstrapWorkspace}>
              <label className={styles.field}>
                Nome da organizacao
                <input
                  className={styles.input}
                  value={organizationName}
                  onChange={(e) => setOrganizationName(e.target.value)}
                  placeholder="Ex.: Rede Central"
                  required
                />
              </label>
              <label className={styles.field}>
                Nome do estabelecimento
                <input
                  className={styles.input}
                  value={newEstablishmentName}
                  onChange={(e) => setNewEstablishmentName(e.target.value)}
                  placeholder="Ex.: Loja Centro"
                  required
                />
              </label>
              <div className={styles.actions}>
                <button className={styles.button} type="submit" disabled={bootstrapLoading}>
                  {bootstrapLoading ? "Criando..." : "Criar estabelecimento"}
                </button>
              </div>
            </form>
            {bootstrapError ? <p className={styles.stateError}>{bootstrapError}</p> : null}
            {bootstrapSuccess ? <p className={styles.stateSuccess}>{bootstrapSuccess}</p> : null}
          </section>
        ) : null}

        {workspaceView !== "access" ? null : (
        <section className={styles.card}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Convites Recebidos</h2>
            <p className={styles.sectionHint}>Aceite convite para acessar estabelecimentos compartilhados</p>
          </div>
          <form className={styles.formBlock} onSubmit={acceptInvitationByCode}>
            <label className={styles.field}>
              Codigo do convite
              <input
                className={styles.input}
                value={invitationCode}
                onChange={(e) => setInvitationCode(e.target.value)}
                placeholder="UUID do convite"
              />
            </label>
            <div className={styles.actions}>
              <button className={styles.buttonSecondary} type="submit" disabled={!invitationCode.trim() || !!acceptingInvitationId}>
                {acceptingInvitationId === invitationCode.trim() ? "Aceitando..." : "Aceitar por codigo"}
              </button>
            </div>
          </form>
          {pendingInvitations.length === 0 ? (
            <p className={styles.stateInfo}>Nenhum convite pendente para o seu email autenticado.</p>
          ) : (
            <div className={styles.feedList}>
              {pendingInvitations.map((invitation) => (
                <article key={invitation.invitation_id} className={styles.feedItem}>
                  <p className={styles.feedMessage}>
                    {invitation.establishment_name} | funcao: {invitation.role_name}
                  </p>
                  <p className={styles.feedMeta}>
                    criado em {toLocalDateTimeLabel(invitation.created_at)}
                    {invitation.expires_at ? ` | expira em ${toLocalDateTimeLabel(invitation.expires_at)}` : ""}
                  </p>
                  <p className={styles.feedMeta}>codigo: {invitation.invitation_id}</p>
                  <div className={styles.actions}>
                    <button
                      className={styles.buttonSecondary}
                      type="button"
                      onClick={() => acceptInvitation(invitation.invitation_id)}
                      disabled={acceptingInvitationId === invitation.invitation_id}
                    >
                      {acceptingInvitationId === invitation.invitation_id ? "Aceitando..." : "Aceitar convite"}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
          {pendingInviteError ? <p className={styles.stateError}>{pendingInviteError}</p> : null}
          {pendingInviteSuccess ? <p className={styles.stateSuccess}>{pendingInviteSuccess}</p> : null}
        </section>
        )}

        {workspaceView === "access" && establishmentId ? (
          <section className={styles.card}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Convites do Estabelecimento</h2>
              <p className={styles.sectionHint}>Convide usuarios para este estabelecimento</p>
            </div>
            {roles.length === 0 ? (
              <p className={styles.stateInfo}>Sem permissao de administracao para gerenciar convites neste estabelecimento.</p>
            ) : (
              <form className={styles.formBlock} onSubmit={createInvitation}>
                <label className={styles.field}>
                  Email
                  <input
                    className={styles.input}
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="usuario@empresa.com"
                    required
                  />
                </label>
                <label className={styles.field}>
                  Funcao
                  <select
                    className={styles.select}
                    value={inviteRoleId}
                    onChange={(e) => setInviteRoleId(e.target.value)}
                    required
                  >
                    {roles.map((role) => (
                      <option key={role.id} value={role.id}>
                        {role.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className={styles.actions}>
                  <button className={styles.button} type="submit" disabled={creatingInvitation || !inviteRoleId}>
                    {creatingInvitation ? "Enviando..." : "Convidar usuario"}
                  </button>
                </div>
              </form>
            )}
            {invitations.length === 0 ? (
              <p className={styles.stateInfo}>Nenhum convite registrado para este estabelecimento.</p>
            ) : (
              <div className={styles.feedList}>
                {invitations.map((invitation) => (
                  <article key={invitation.id} className={styles.feedItem}>
                    <p className={styles.feedMessage}>
                      {invitation.email} | status: {invitation.status}
                    </p>
                    <p className={styles.feedMeta}>
                      criado em {toLocalDateTimeLabel(invitation.created_at)}
                      {invitation.expires_at ? ` | expira em ${toLocalDateTimeLabel(invitation.expires_at)}` : ""}
                    </p>
                    <p className={styles.feedMeta}>codigo: {invitation.id}</p>
                    {invitation.status === "pending" && roles.length > 0 ? (
                      <div className={styles.actions}>
                        <button
                          className={styles.buttonSecondary}
                          type="button"
                          onClick={() => {
                            void revokeInvitation(invitation.id);
                          }}
                        >
                          Revogar convite
                        </button>
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            )}
            {inviteError ? <p className={styles.stateError}>{inviteError}</p> : null}
            {inviteSuccess ? <p className={styles.stateSuccess}>{inviteSuccess}</p> : null}
          </section>
        ) : null}

        {workspaceView === "catalog" ? (
          <>
            <section className={styles.card}>
              <div className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle}>Cadastro Operacional</h2>
                <p className={styles.sectionHint}>Fluxo guiado para cadastro rapido e sem campos financeiros</p>
              </div>
              <div className={styles.catalogFlow}>
                <article className={styles.catalogStep}>
                  <span className={styles.catalogStepTag}>Passo 1</span>
                  <p className={styles.catalogStepTitle}>Cadastre o produto base</p>
                  <p className={styles.catalogStepHint}>Defina nome, SKU, unidade e estoque minimo.</p>
                </article>
                <article className={styles.catalogStep}>
                  <span className={styles.catalogStepTag}>Passo 2</span>
                  <p className={styles.catalogStepTitle}>Registre o lote de entrada</p>
                  <p className={styles.catalogStepHint}>Informe lote, validade e quantidade para liberar operacao FEFO.</p>
                </article>
              </div>
              <div className={styles.catalogGrid}>
                <form className={styles.formBlock} onSubmit={createProduct}>
                  <div className={styles.formHeader}>
                    <span className={styles.formStep}>1</span>
                    <h3 className={styles.formTitle}>Cadastrar Produto</h3>
                  </div>
                  <label className={styles.field}>
                    Nome do produto
                    <input
                      className={styles.input}
                      value={productName}
                      onChange={(e) => setProductName(e.target.value)}
                      placeholder="Ex.: Leite integral 1L"
                      required
                    />
                  </label>
                  <label className={styles.field}>
                    SKU
                    <input
                      className={styles.input}
                      value={productSku}
                      onChange={(e) => setProductSku(e.target.value)}
                      placeholder="Ex.: LT-INT-001"
                      required
                    />
                  </label>
                  <div className={styles.row}>
                    <label className={styles.field}>
                      Unidade
                      <input
                        className={styles.input}
                        value={productUom}
                        onChange={(e) => setProductUom(e.target.value)}
                        placeholder="un, kg, l"
                        required
                      />
                    </label>
                    <label className={styles.field}>
                      Estoque minimo
                      <input
                        className={styles.input}
                        type="number"
                        min={0}
                        step="1"
                        value={productMinimumStock}
                        onChange={(e) => setProductMinimumStock(e.target.value)}
                        required
                      />
                    </label>
                  </div>
                  <div className={styles.actions}>
                    <button
                      className={styles.button}
                      type="submit"
                      disabled={!selectedEstablishment || creatingProduct}
                    >
                      {creatingProduct ? "Salvando..." : "Salvar produto"}
                    </button>
                  </div>
                </form>

                <form className={styles.formBlock} onSubmit={createInboundBatch}>
                  <div className={styles.formHeader}>
                    <span className={styles.formStep}>2</span>
                    <h3 className={styles.formTitle}>Cadastrar Lote de Entrada</h3>
                  </div>
                  <label className={styles.field}>
                    Produto
                    <select
                      className={styles.select}
                      value={inboundProductId}
                      onChange={(e) => setInboundProductId(e.target.value)}
                      disabled={products.length === 0}
                      required
                    >
                      {products.length === 0 ? <option value="">Nenhum produto disponivel</option> : null}
                      {products.map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.name} ({product.sku})
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={styles.field}>
                    Codigo do lote
                    <input
                      className={styles.input}
                      value={inboundLotCode}
                      onChange={(e) => setInboundLotCode(e.target.value)}
                      placeholder="Ex.: L-2026-05-001"
                      required
                    />
                  </label>
                  <div className={styles.row}>
                    <label className={styles.field}>
                      Validade
                      <input
                        className={styles.input}
                        type="date"
                        value={inboundExpiryDate}
                        onChange={(e) => setInboundExpiryDate(e.target.value)}
                        required
                      />
                    </label>
                    <label className={styles.field}>
                      Quantidade
                      <input
                        className={`${styles.input} ${inboundQuantityInvalid ? styles.inputInvalid : ""}`}
                        type="text"
                        inputMode="decimal"
                        value={inboundQuantity}
                        onChange={(e) => setInboundQuantity(maskQuantityInput(e.target.value))}
                        placeholder="Ex.: 1.250,5000"
                        required
                      />
                      <span className={inboundQuantityInvalid ? styles.fieldHintError : styles.fieldHint}>
                        {inboundQuantityInvalid ? "Informe quantidade maior que zero." : "Use virgula para casas decimais."}
                      </span>
                    </label>
                  </div>
                  <label className={styles.field}>
                    Localizacao (opcional)
                    <input
                      className={styles.input}
                      value={inboundLocationId}
                      onChange={(e) => setInboundLocationId(e.target.value)}
                      placeholder="UUID da localizacao"
                    />
                  </label>
                  <div className={styles.inboundPreview}>
                    <p className={styles.inboundPreviewTitle}>Resumo da entrada</p>
                    <p className={styles.inboundPreviewText}>
                      Produto: {selectedInboundProduct ? `${selectedInboundProduct.name} (${selectedInboundProduct.sku})` : "-"}
                    </p>
                    <p className={styles.inboundPreviewText}>Lote: {inboundLotCode.trim() || "-"}</p>
                    <p className={styles.inboundPreviewText}>
                      Validade: {inboundExpiryDate ? toLocalDateLabel(inboundExpiryDate) : "-"}
                    </p>
                    <p className={styles.inboundPreviewText}>
                      Quantidade: {inboundQuantityValue !== null ? inboundQuantityValue : "-"}
                    </p>
                    <p className={styles.fieldHint}>Custo unitario desativado nesta fase. Entradas registradas com custo 0.</p>
                  </div>
                  <div className={styles.actions}>
                    <button
                      className={styles.button}
                      type="submit"
                      disabled={
                        !establishmentId ||
                        products.length === 0 ||
                        creatingInboundBatch ||
                        inboundQuantityValue === null ||
                        inboundQuantityValue <= 0
                      }
                    >
                      {creatingInboundBatch ? "Registrando..." : "Registrar lote"}
                    </button>
                  </div>
                  {products.length === 0 ? (
                    <p className={styles.stateInfo}>
                      Cadastre um produto antes de registrar lotes de entrada.
                    </p>
                  ) : null}
                </form>
              </div>
              {catalogError ? <p className={styles.stateError}>{catalogError}</p> : null}
              {catalogSuccess ? <p className={styles.stateSuccess}>{catalogSuccess}</p> : null}
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
          </>
        ) : null}

        {workspaceView === "operation" ? (
          <>
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
                <h2 className={styles.sectionTitle}>Prioridade de Hoje</h2>
                <p className={styles.sectionHint}>Lotes com maior risco operacional para acao imediata</p>
              </div>
              {prioritizedBatches.length === 0 ? (
                <p className={styles.stateInfo}>Sem lotes para priorizacao com os filtros atuais.</p>
              ) : (
                <div className={styles.feedList}>
                  {prioritizedBatches.map((batch) => (
                    <button
                      key={`priority-${batch.id}`}
                      type="button"
                      className={styles.priorityItem}
                      onClick={() => {
                        setSelectedBatchId(batch.id);
                        setQuarantined(String(batch.quarantined));
                        setExpiryDate(batch.expiry_date);
                      }}
                    >
                      <div className={styles.priorityMain}>
                        <p className={styles.priorityTitle}>{batch.products?.name ?? "Sem produto"}</p>
                        <span className={`${styles.statusBadge} ${styles[`status_${batch.status}`]}`}>
                          {statusLabel(batch.status)}
                        </span>
                      </div>
                      <p className={styles.priorityMeta}>
                        Lote {batch.lot_code} | validade {toLocalDateLabel(batch.expiry_date)} | versao {batch.version}
                      </p>
                    </button>
                  ))}
                </div>
              )}
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
                              {statusLabel(batch.status)}
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
          </>
        ) : null}

        {workspaceView === "alerts" ? (
          <>
            <section className={styles.card}>
              <div className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle}>Central de Alertas</h2>
                <p className={styles.sectionHint}>Visualizacao consolidada para risco de vencimento e quarentena</p>
              </div>
              <div className={styles.alertScopeTabs}>
                <button
                  type="button"
                  className={`${styles.alertScopeTab} ${alertScope === "all" ? styles.alertScopeTabActive : ""}`}
                  onClick={() => {
                    setAlertScope("all");
                    setAlertPage(1);
                  }}
                >
                  Todos
                </button>
                <button
                  type="button"
                  className={`${styles.alertScopeTab} ${alertScope === "expired" ? styles.alertScopeTabActive : ""}`}
                  onClick={() => {
                    setAlertScope("expired");
                    setAlertPage(1);
                  }}
                >
                  Vencidos
                </button>
                <button
                  type="button"
                  className={`${styles.alertScopeTab} ${alertScope === "alert" ? styles.alertScopeTabActive : ""}`}
                  onClick={() => {
                    setAlertScope("alert");
                    setAlertPage(1);
                  }}
                >
                  Atencao
                </button>
                <button
                  type="button"
                  className={`${styles.alertScopeTab} ${alertScope === "quarantine" ? styles.alertScopeTabActive : ""}`}
                  onClick={() => {
                    setAlertScope("quarantine");
                    setAlertPage(1);
                  }}
                >
                  Quarentena
                </button>
              </div>
              <div className={styles.actions}>
                <button className={styles.buttonSecondary} type="button" onClick={loadAlerts} disabled={alertLoading}>
                  {alertLoading ? "Atualizando..." : "Atualizar alertas"}
                </button>
              </div>
              <section className={styles.alertPreferencesPanel}>
                <div className={styles.sectionHeader}>
                  <h3 className={styles.formTitle}>Preferencias de Notificacao</h3>
                  <button
                    className={styles.buttonSecondary}
                    type="button"
                    onClick={saveAlertPreferences}
                    disabled={alertPreferencesSaving || alertPreferencesLoading}
                  >
                    {alertPreferencesSaving ? "Salvando..." : "Salvar preferencias"}
                  </button>
                </div>
                {alertPreferencesLoading ? <p className={styles.stateInfo}>Carregando preferencias...</p> : null}
                <div className={styles.alertPreferencesGrid}>
                  <label className={styles.toggleField}>
                    <input
                      type="checkbox"
                      checked={alertPreferences.criticalOnly}
                      onChange={(event) =>
                        setAlertPreferences((current) => ({
                          ...current,
                          criticalOnly: event.target.checked,
                        }))
                      }
                      disabled={alertPreferencesLoading}
                    />
                    Somente criticos (vencido e quarentena)
                  </label>
                  <label className={styles.toggleField}>
                    <input
                      type="checkbox"
                      checked={alertPreferences.dailyDigest}
                      onChange={(event) =>
                        setAlertPreferences((current) => ({
                          ...current,
                          dailyDigest: event.target.checked,
                        }))
                      }
                      disabled={alertPreferencesLoading}
                    />
                    Receber resumo diario
                  </label>
                  <label className={styles.toggleField}>
                    <input
                      type="checkbox"
                      checked={alertPreferences.muteNonExpired}
                      onChange={(event) =>
                        setAlertPreferences((current) => ({
                          ...current,
                          muteNonExpired: event.target.checked,
                        }))
                      }
                      disabled={alertPreferencesLoading}
                    />
                    Silenciar nao vencidos em notificacoes push
                  </label>
                </div>
                {alertPreferencesMessage ? <p className={styles.stateInfo}>{alertPreferencesMessage}</p> : null}
              </section>
              <section className={styles.alertSummaryGrid}>
                <article className={styles.alertSummaryItem}>
                  <p>Vencidos</p>
                  <strong>{alertSummary.expired}</strong>
                </article>
                <article className={styles.alertSummaryItem}>
                  <p>Atencao</p>
                  <strong>{alertSummary.alert}</strong>
                </article>
                <article className={styles.alertSummaryItem}>
                  <p>Quarentena</p>
                  <strong>{alertSummary.quarantine}</strong>
                </article>
                <article className={styles.alertSummaryItem}>
                  <p>Snoozados</p>
                  <strong>{alertSummary.snoozed}</strong>
                </article>
              </section>
              <p className={styles.stateInfo}>
                {alertPagination.total} alertas no escopo atual. Vencidos permanecem prioridade maxima e nao devem ser silenciados.
              </p>
            </section>

            <section className={styles.card}>
              <div className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle}>Fila de Acao</h2>
                <p className={styles.sectionHint}>Clique em um lote para abrir o painel e executar acao</p>
              </div>
              {alertLoading ? <p className={styles.stateInfo}>Carregando alertas...</p> : null}
              {!alertLoading ? (
                alertItems.length === 0 ? (
                  <p className={styles.stateInfo}>Nenhum lote no escopo selecionado.</p>
                ) : (
                  <div className={styles.feedList}>
                    {alertItems.map((batch) => (
                      <button
                        key={`alert-${batch.id}`}
                        type="button"
                        className={styles.priorityItem}
                        onClick={() => {
                          setSelectedBatchId(batch.id);
                          setQuarantined(String(batch.quarantined));
                          setExpiryDate(batch.expiryDate);
                        }}
                      >
                        <div className={styles.priorityMain}>
                          <p className={styles.priorityTitle}>{batch.product?.name ?? "Sem produto"}</p>
                          <span className={`${styles.statusBadge} ${styles[`status_${batch.status}`]}`}>
                            {statusLabel(batch.status)}
                          </span>
                        </div>
                        <p className={styles.priorityMeta}>
                          Lote {batch.lotCode} | validade {toLocalDateLabel(batch.expiryDate)} | SKU{" "}
                          {batch.product?.sku ?? "-"}
                          {batch.snoozed && batch.snoozedUntil
                            ? ` | snoozado ate ${toLocalDateTimeLabel(batch.snoozedUntil)}`
                            : ""}
                        </p>
                      </button>
                    ))}
                  </div>
                )
              ) : null}
              <div className={styles.alertPagination}>
                <button
                  className={styles.buttonSecondary}
                  type="button"
                  onClick={() => setAlertPage((current) => Math.max(1, current - 1))}
                  disabled={alertLoading || alertPage <= 1}
                >
                  Anterior
                </button>
                <p className={styles.alertPaginationText}>
                  Pagina {alertPagination.page} de {alertPagination.totalPages || 1}
                </p>
                <button
                  className={styles.buttonSecondary}
                  type="button"
                  onClick={() =>
                    setAlertPage((current) =>
                      Math.min(alertPagination.totalPages || 1, current + 1),
                    )
                  }
                  disabled={
                    alertLoading ||
                    alertPagination.totalPages === 0 ||
                    alertPage >= alertPagination.totalPages
                  }
                >
                  Proxima
                </button>
              </div>
            </section>
          </>
        ) : null}

        {workspaceView === "history" ? (
          <>
            <section className={styles.card}>
              <h2 className={styles.sectionTitle}>Arquivamento e Perdas</h2>
              <div className={styles.actions}>
                <button className={styles.buttonSecondary} type="button" onClick={archiveZeroBalance}>
                  Arquivar lotes zerados (+7 dias)
                </button>
                <button className={styles.buttonSecondary} type="button" onClick={loadHistory}>
                  Ver historico
                </button>
                <button
                  className={styles.buttonSecondary}
                  type="button"
                  onClick={() => {
                    window.location.href = "/history";
                  }}
                >
                  Ir para pagina de historico
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
          </>
        ) : null}
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
