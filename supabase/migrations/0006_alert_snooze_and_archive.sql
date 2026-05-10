alter table batches
add column if not exists archived_at timestamptz;

create table if not exists batch_alert_snoozes (
  batch_id uuid primary key references batches(id) on delete cascade,
  establishment_id uuid not null references establishments(id) on delete cascade,
  snoozed_until timestamptz not null,
  reason text,
  actor_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_batch_alert_snoozes_establishment
  on batch_alert_snoozes(establishment_id, snoozed_until desc);

alter table batch_alert_snoozes enable row level security;

drop policy if exists batch_alert_snoozes_isolation on batch_alert_snoozes;
create policy batch_alert_snoozes_isolation
on batch_alert_snoozes
for all
using (public.user_belongs_to_establishment(establishment_id))
with check (public.user_belongs_to_establishment(establishment_id));
