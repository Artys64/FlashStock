create or replace function public.bootstrap_establishment_for_current_user(
  target_organization_name text,
  target_establishment_name text
)
returns table (
  organization_id uuid,
  establishment_id uuid,
  admin_role_id uuid,
  operator_role_id uuid,
  user_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  requester_id uuid;
  normalized_org_name text;
  normalized_establishment_name text;
begin
  requester_id := auth.uid();

  if requester_id is null then
    raise exception
      using errcode = '42501',
            message = 'Unauthenticated user.';
  end if;

  normalized_org_name := nullif(trim(target_organization_name), '');
  normalized_establishment_name := nullif(trim(target_establishment_name), '');

  if normalized_org_name is null then
    raise exception
      using errcode = '23514',
            message = 'Organization name is required.';
  end if;

  if normalized_establishment_name is null then
    raise exception
      using errcode = '23514',
            message = 'Establishment name is required.';
  end if;

  insert into organizations (name)
  values (normalized_org_name)
  returning id into organization_id;

  insert into establishments (organization_id, name)
  values (organization_id, normalized_establishment_name)
  returning id into establishment_id;

  insert into roles (organization_id, name)
  values (organization_id, 'admin')
  returning id into admin_role_id;

  insert into roles (organization_id, name)
  values (organization_id, 'operador')
  returning id into operator_role_id;

  insert into role_permissions (role_id, permission_id)
  select admin_role_id, p.id
  from permissions p
  on conflict do nothing;

  insert into role_permissions (role_id, permission_id)
  select operator_role_id, p.id
  from permissions p
  where p.code in (
    'inventory.read',
    'inventory.write',
    'movements.read',
    'movements.write'
  )
  on conflict do nothing;

  insert into user_roles (user_id, establishment_id, role_id)
  values (requester_id, establishment_id, admin_role_id)
  on conflict (establishment_id, user_id)
  do update set role_id = excluded.role_id;

  insert into audit_logs (establishment_id, entity_type, entity_id, action, actor_user_id, payload)
  values
    (
      establishment_id,
      'organization',
      organization_id,
      'organization_bootstrapped',
      requester_id,
      jsonb_build_object(
        'organizationId', organization_id,
        'organizationName', normalized_org_name,
        'createdBy', requester_id
      )
    ),
    (
      establishment_id,
      'establishment',
      establishment_id,
      'establishment_bootstrapped',
      requester_id,
      jsonb_build_object(
        'establishmentId', establishment_id,
        'establishmentName', normalized_establishment_name,
        'organizationId', organization_id
      )
    ),
    (
      establishment_id,
      'user_role',
      requester_id,
      'user_role_bootstrapped',
      requester_id,
      jsonb_build_object(
        'userId', requester_id,
        'roleId', admin_role_id,
        'establishmentId', establishment_id
      )
    );

  user_id := requester_id;
  return next;
end;
$$;

grant execute on function public.bootstrap_establishment_for_current_user(text, text) to authenticated;
grant execute on function public.bootstrap_establishment_for_current_user(text, text) to service_role;

create or replace function public.list_pending_invitations_for_current_user()
returns table (
  invitation_id uuid,
  establishment_id uuid,
  establishment_name text,
  role_id uuid,
  role_name text,
  email text,
  expires_at timestamptz,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    i.id as invitation_id,
    i.establishment_id,
    e.name as establishment_name,
    i.role_id,
    r.name as role_name,
    i.email,
    i.expires_at,
    i.created_at
  from establishment_invitations i
  join establishments e on e.id = i.establishment_id
  join roles r on r.id = i.role_id
  where i.status = 'pending'
    and i.email = public.requesting_user_email()
    and (i.expires_at is null or i.expires_at > now())
  order by i.created_at desc;
$$;

grant execute on function public.list_pending_invitations_for_current_user() to authenticated;
grant execute on function public.list_pending_invitations_for_current_user() to service_role;
