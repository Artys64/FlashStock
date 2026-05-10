create table if not exists establishment_invitations (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid not null references establishments(id) on delete cascade,
  email text not null,
  role_id uuid not null references roles(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  invited_by uuid,
  invited_user_id uuid,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_establishment_invitations_establishment_created
  on establishment_invitations (establishment_id, created_at desc);

create unique index if not exists idx_establishment_invitations_pending_email
  on establishment_invitations (establishment_id, lower(email))
  where status = 'pending';

with ranked as (
  select
    ctid,
    row_number() over (
      partition by user_id, establishment_id
      order by created_at desc, role_id asc
    ) as rn
  from user_roles
)
delete from user_roles ur
using ranked r
where ur.ctid = r.ctid
  and r.rn > 1;

create unique index if not exists idx_user_roles_establishment_user
  on user_roles (establishment_id, user_id);

create or replace function public.role_matches_establishment_organization(
  target_role_id uuid,
  target_establishment_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from roles r
    join establishments e on e.organization_id = r.organization_id
    where r.id = target_role_id
      and e.id = target_establishment_id
  );
$$;

create or replace function public.enforce_user_roles_scope()
returns trigger
language plpgsql
as $$
begin
  if not public.role_matches_establishment_organization(new.role_id, new.establishment_id) then
    raise exception
      using errcode = '23514',
            message = 'Role organization must match establishment organization.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_user_roles_scope on user_roles;
create trigger trg_user_roles_scope
before insert or update on user_roles
for each row
execute function public.enforce_user_roles_scope();

create or replace function public.enforce_establishment_invitations_scope()
returns trigger
language plpgsql
as $$
begin
  new.email := lower(trim(new.email));

  if new.email = '' then
    raise exception
      using errcode = '23514',
            message = 'Invitation email must not be empty.';
  end if;

  if not public.role_matches_establishment_organization(new.role_id, new.establishment_id) then
    raise exception
      using errcode = '23514',
            message = 'Invitation role must belong to the same organization as establishment.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_establishment_invitations_scope on establishment_invitations;
create trigger trg_establishment_invitations_scope
before insert or update on establishment_invitations
for each row
execute function public.enforce_establishment_invitations_scope();

alter table establishment_invitations enable row level security;
grant select, insert, update, delete on table establishment_invitations to authenticated;
grant all on table establishment_invitations to service_role;

drop policy if exists establishment_invitations_select_admin on establishment_invitations;
create policy establishment_invitations_select_admin
on establishment_invitations
for select
using (public.user_has_permission(establishment_id, 'admin.manage'));

drop policy if exists establishment_invitations_insert_admin on establishment_invitations;
create policy establishment_invitations_insert_admin
on establishment_invitations
for insert
with check (public.user_has_permission(establishment_id, 'admin.manage'));

drop policy if exists establishment_invitations_update_admin on establishment_invitations;
create policy establishment_invitations_update_admin
on establishment_invitations
for update
using (public.user_has_permission(establishment_id, 'admin.manage'))
with check (public.user_has_permission(establishment_id, 'admin.manage'));

drop policy if exists establishment_invitations_delete_admin on establishment_invitations;
create policy establishment_invitations_delete_admin
on establishment_invitations
for delete
using (public.user_has_permission(establishment_id, 'admin.manage'));

drop policy if exists user_roles_admin_manage_mutation on user_roles;
create policy user_roles_admin_manage_mutation
on user_roles
for insert
with check (public.user_has_permission(establishment_id, 'admin.manage'));

drop policy if exists user_roles_admin_manage_update on user_roles;
create policy user_roles_admin_manage_update
on user_roles
for update
using (public.user_has_permission(establishment_id, 'admin.manage'))
with check (public.user_has_permission(establishment_id, 'admin.manage'));

drop policy if exists user_roles_admin_manage_delete on user_roles;
create policy user_roles_admin_manage_delete
on user_roles
for delete
using (public.user_has_permission(establishment_id, 'admin.manage'));
