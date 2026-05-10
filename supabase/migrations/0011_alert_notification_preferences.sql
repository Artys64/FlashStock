create table if not exists alert_notification_preferences (
  establishment_id uuid not null references establishments(id) on delete cascade,
  user_id uuid not null,
  critical_only boolean not null default false,
  daily_digest boolean not null default true,
  mute_non_expired boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (establishment_id, user_id)
);

create index if not exists idx_alert_notification_preferences_establishment
  on alert_notification_preferences (establishment_id);

alter table alert_notification_preferences enable row level security;
grant select, insert, update on table alert_notification_preferences to authenticated;
grant all on table alert_notification_preferences to service_role;

drop policy if exists alert_notification_preferences_select_own on alert_notification_preferences;
create policy alert_notification_preferences_select_own
on alert_notification_preferences
for select
using (
  public.user_belongs_to_establishment(establishment_id)
  and user_id = public.requesting_user_id()
);

drop policy if exists alert_notification_preferences_insert_own on alert_notification_preferences;
create policy alert_notification_preferences_insert_own
on alert_notification_preferences
for insert
with check (
  public.user_belongs_to_establishment(establishment_id)
  and user_id = public.requesting_user_id()
);

drop policy if exists alert_notification_preferences_update_own on alert_notification_preferences;
create policy alert_notification_preferences_update_own
on alert_notification_preferences
for update
using (
  public.user_belongs_to_establishment(establishment_id)
  and user_id = public.requesting_user_id()
)
with check (
  public.user_belongs_to_establishment(establishment_id)
  and user_id = public.requesting_user_id()
);

