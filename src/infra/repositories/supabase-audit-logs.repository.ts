import { SupabaseClient } from "@supabase/supabase-js";

export interface CreateAuditLogInput {
  establishmentId: string;
  entityType:
    | "organization"
    | "establishment"
    | "category"
    | "product"
    | "batch"
    | "movement"
    | "user_role"
    | "invitation";
  entityId: string;
  action: string;
  actorUserId?: string;
  payload: Record<string, unknown>;
}

export class SupabaseAuditLogsRepository {
  constructor(private readonly client: SupabaseClient) {}

  async create(input: CreateAuditLogInput): Promise<void> {
    const { error } = await this.client.from("audit_logs").insert({
      establishment_id: input.establishmentId,
      entity_type: input.entityType,
      entity_id: input.entityId,
      action: input.action,
      actor_user_id: input.actorUserId ?? null,
      payload: input.payload,
    });
    if (error) throw new Error(error.message);
  }
}
