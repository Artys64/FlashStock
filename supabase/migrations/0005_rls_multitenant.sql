create or replace function public.requesting_user_id()
returns uuid
language sql
stable
as $$
  select coalesce(
    (
      case
        when coalesce(current_setting('request.headers', true), '') <> ''
          and coalesce((current_setting('request.headers', true)::json ->> 'x-user-id'), '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then (current_setting('request.headers', true)::json ->> 'x-user-id')::uuid
        else null
      end
    ),
    auth.uid()
  );
$$;

create or replace function public.user_belongs_to_establishment(target_establishment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from user_roles ur
    where ur.establishment_id = target_establishment_id
      and ur.user_id = public.requesting_user_id()
  );
$$;

create or replace function public.user_belongs_to_organization(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from user_roles ur
    join establishments e on e.id = ur.establishment_id
    where e.organization_id = target_organization_id
      and ur.user_id = public.requesting_user_id()
  );
$$;

create or replace function public.user_has_permission(
  target_establishment_id uuid,
  permission_code text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from user_roles ur
    join roles r on r.id = ur.role_id
    join role_permissions rp on rp.role_id = r.id
    join permissions p on p.id = rp.permission_id
    where ur.establishment_id = target_establishment_id
      and ur.user_id = public.requesting_user_id()
      and p.code = permission_code
  );
$$;

alter table organizations enable row level security;
alter table establishments enable row level security;
alter table categories enable row level security;
alter table products enable row level security;
alter table batches enable row level security;
alter table inventory_movements enable row level security;
alter table audit_logs enable row level security;
alter table roles enable row level security;
alter table permissions enable row level security;
alter table role_permissions enable row level security;
alter table user_roles enable row level security;

drop policy if exists organizations_select on organizations;
create policy organizations_select
on organizations
for select
using (public.user_belongs_to_organization(id));

drop policy if exists organizations_mutation on organizations;
create policy organizations_mutation
on organizations
for all
using (public.user_belongs_to_organization(id))
with check (public.user_belongs_to_organization(id));

drop policy if exists establishments_select on establishments;
create policy establishments_select
on establishments
for select
using (public.user_belongs_to_establishment(id));

drop policy if exists establishments_mutation on establishments;
create policy establishments_mutation
on establishments
for all
using (public.user_belongs_to_organization(organization_id))
with check (public.user_belongs_to_organization(organization_id));

drop policy if exists categories_isolation on categories;
create policy categories_isolation
on categories
for all
using (public.user_belongs_to_organization(organization_id))
with check (public.user_belongs_to_organization(organization_id));

drop policy if exists products_isolation on products;
create policy products_isolation
on products
for all
using (public.user_belongs_to_organization(organization_id))
with check (public.user_belongs_to_organization(organization_id));

drop policy if exists batches_isolation on batches;
create policy batches_isolation
on batches
for all
using (public.user_belongs_to_establishment(establishment_id))
with check (public.user_belongs_to_establishment(establishment_id));

drop policy if exists movements_isolation on inventory_movements;
create policy movements_isolation
on inventory_movements
for all
using (public.user_belongs_to_establishment(establishment_id))
with check (public.user_belongs_to_establishment(establishment_id));

drop policy if exists audit_logs_isolation on audit_logs;
create policy audit_logs_isolation
on audit_logs
for all
using (public.user_belongs_to_establishment(establishment_id))
with check (public.user_belongs_to_establishment(establishment_id));

drop policy if exists roles_isolation on roles;
create policy roles_isolation
on roles
for all
using (public.user_belongs_to_organization(organization_id))
with check (public.user_belongs_to_organization(organization_id));

drop policy if exists permissions_read on permissions;
create policy permissions_read
on permissions
for select
using (public.requesting_user_id() is not null);

drop policy if exists role_permissions_isolation on role_permissions;
create policy role_permissions_isolation
on role_permissions
for select
using (
  exists (
    select 1
    from roles r
    where r.id = role_permissions.role_id
      and public.user_belongs_to_organization(r.organization_id)
  )
);

drop policy if exists user_roles_self_or_admin on user_roles;
create policy user_roles_self_or_admin
on user_roles
for select
using (
  user_id = public.requesting_user_id()
  or public.user_has_permission(establishment_id, 'admin.manage')
);
