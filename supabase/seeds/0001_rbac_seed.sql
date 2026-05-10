-- Replace the UUIDs below with real values from your environment before running.
-- organization_id: target organization
-- establishment_id: target establishment
-- admin_user_id / operator_user_id: authenticated user IDs

with seed_context as (
  select
    '00000000-0000-0000-0000-000000000001'::uuid as organization_id,
    '00000000-0000-0000-0000-000000000002'::uuid as establishment_id,
    '00000000-0000-0000-0000-000000000010'::uuid as admin_user_id,
    '00000000-0000-0000-0000-000000000011'::uuid as operator_user_id
),
created_roles as (
  insert into roles (organization_id, name)
  select organization_id, 'admin' from seed_context
  union all
  select organization_id, 'operador' from seed_context
  on conflict (organization_id, name) do update set name = excluded.name
  returning id, organization_id, name
),
all_permissions as (
  select id, code from permissions
),
admin_role as (
  select id from created_roles where name = 'admin'
),
operator_role as (
  select id from created_roles where name = 'operador'
),
admin_permissions as (
  insert into role_permissions (role_id, permission_id)
  select ar.id, p.id
  from admin_role ar
  cross join all_permissions p
  on conflict do nothing
),
operator_permissions as (
  insert into role_permissions (role_id, permission_id)
  select orole.id, p.id
  from operator_role orole
  join all_permissions p
    on p.code in (
      'inventory.read',
      'inventory.write',
      'movements.read',
      'movements.write'
    )
  on conflict do nothing
)
insert into user_roles (user_id, establishment_id, role_id)
select sc.admin_user_id, sc.establishment_id, ar.id
from seed_context sc
cross join admin_role ar
on conflict do nothing;

with seed_context as (
  select
    '00000000-0000-0000-0000-000000000002'::uuid as establishment_id,
    '00000000-0000-0000-0000-000000000011'::uuid as operator_user_id
),
operator_role as (
  select r.id
  from roles r
  where r.name = 'operador'
  limit 1
)
insert into user_roles (user_id, establishment_id, role_id)
select sc.operator_user_id, sc.establishment_id, orole.id
from seed_context sc
cross join operator_role orole
on conflict do nothing;
