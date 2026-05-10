export type EditableBatchFields = {
  quarantined?: boolean;
  expiryDate?: string;
};

export type MergePayload = {
  strategy: "client_wins" | "field_level";
  resolved?: EditableBatchFields;
};

export type ConflictFieldDiff = {
  field: "quarantined" | "expiryDate";
  clientValue: unknown;
  serverValue: unknown;
};

export type ConflictPayload = {
  entityId: string;
  expectedVersion: number;
  currentVersion: number;
  clientChanges: EditableBatchFields;
  serverState: Required<EditableBatchFields>;
  fieldDiff: ConflictFieldDiff[];
};

type ServerBatchState = {
  quarantined: boolean;
  expiryDate: string;
};

export function buildConflictPayload(params: {
  entityId: string;
  expectedVersion: number;
  currentVersion: number;
  clientChanges: EditableBatchFields;
  serverState: ServerBatchState;
}): ConflictPayload {
  const { entityId, expectedVersion, currentVersion, clientChanges, serverState } = params;
  const fieldDiff: ConflictFieldDiff[] = [];

  if (
    clientChanges.quarantined !== undefined &&
    clientChanges.quarantined !== serverState.quarantined
  ) {
    fieldDiff.push({
      field: "quarantined",
      clientValue: clientChanges.quarantined,
      serverValue: serverState.quarantined,
    });
  }

  if (clientChanges.expiryDate !== undefined && clientChanges.expiryDate !== serverState.expiryDate) {
    fieldDiff.push({
      field: "expiryDate",
      clientValue: clientChanges.expiryDate,
      serverValue: serverState.expiryDate,
    });
  }

  return {
    entityId,
    expectedVersion,
    currentVersion,
    clientChanges,
    serverState,
    fieldDiff,
  };
}

export function buildMergedUpdate(params: {
  clientChanges: EditableBatchFields;
  merge?: MergePayload;
}): EditableBatchFields {
  const { clientChanges, merge } = params;
  if (!merge || merge.strategy === "client_wins") return clientChanges;

  return {
    quarantined:
      merge.resolved?.quarantined !== undefined
        ? merge.resolved.quarantined
        : clientChanges.quarantined,
    expiryDate:
      merge.resolved?.expiryDate !== undefined
        ? merge.resolved.expiryDate
        : clientChanges.expiryDate,
  };
}
