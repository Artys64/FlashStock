create table if not exists alert_email_notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  establishment_id uuid not null references establishments(id) on delete cascade,
  user_id uuid not null,
  batch_id uuid not null references batches(id) on delete cascade,
  notification_kind text not null check (notification_kind in ('alert_milestone', 'expired_daily', 'quarantine_daily')),
  milestone_days int check (milestone_days is null or milestone_days > 0),
  operation_date date not null,
  recipient_email text not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'skipped')),
  provider_message_id text,
  attempts int not null default 0 check (attempts >= 0),
  last_error text,
  payload jsonb not null default '{}'::jsonb,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_alert_email_notifications_establishment_created_at
  on alert_email_notifications (establishment_id, created_at desc);

create index if not exists idx_alert_email_notifications_status
  on alert_email_notifications (status, created_at asc);

create unique index if not exists uq_alert_email_notifications_milestone
  on alert_email_notifications (
    establishment_id,
    user_id,
    batch_id,
    notification_kind,
    milestone_days
  )
  where notification_kind = 'alert_milestone';

create unique index if not exists uq_alert_email_notifications_daily
  on alert_email_notifications (
    establishment_id,
    user_id,
    batch_id,
    notification_kind,
    operation_date
  )
  where notification_kind in ('expired_daily', 'quarantine_daily');

alter table alert_email_notifications enable row level security;
grant select, insert, update on table alert_email_notifications to service_role;
