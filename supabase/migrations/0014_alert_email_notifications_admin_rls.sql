grant select, update on table alert_email_notifications to authenticated;

drop policy if exists alert_email_notifications_admin_select on alert_email_notifications;
create policy alert_email_notifications_admin_select
on alert_email_notifications
for select
using (
  public.user_belongs_to_establishment(establishment_id)
  and public.user_has_permission(establishment_id, 'admin.manage')
);

drop policy if exists alert_email_notifications_admin_update on alert_email_notifications;
create policy alert_email_notifications_admin_update
on alert_email_notifications
for update
using (
  public.user_belongs_to_establishment(establishment_id)
  and public.user_has_permission(establishment_id, 'admin.manage')
)
with check (
  public.user_belongs_to_establishment(establishment_id)
  and public.user_has_permission(establishment_id, 'admin.manage')
);
