alter table alert_email_notifications
  add column if not exists next_retry_at timestamptz,
  add column if not exists last_attempt_at timestamptz;

update alert_email_notifications
set next_retry_at = coalesce(next_retry_at, created_at)
where status in ('pending', 'failed')
  and next_retry_at is null;

create index if not exists idx_alert_email_notifications_due_retry
  on alert_email_notifications (status, next_retry_at asc, created_at asc);
