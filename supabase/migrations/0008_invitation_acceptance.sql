create or replace function public.requesting_user_email()
returns text
language sql
stable
as $$
  select nullif(lower(trim(coalesce(auth.jwt() ->> 'email', ''))), '');
$$;

create or replace function public.accept_establishment_invitation(
  target_invitation_id uuid
)
returns table (
  outcome text,
  invitation_id uuid,
  establishment_id uuid,
  role_id uuid,
  user_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  requester_id uuid;
  requester_email text;
  invitation_row public.establishment_invitations%rowtype;
begin
  requester_id := auth.uid();
  requester_email := public.requesting_user_email();

  if requester_id is null then
    return query
    select 'unauthenticated'::text, null::uuid, null::uuid, null::uuid, null::uuid;
    return;
  end if;

  if requester_email is null then
    return query
    select 'missing_email'::text, null::uuid, null::uuid, null::uuid, requester_id;
    return;
  end if;

  select *
  into invitation_row
  from establishment_invitations
  where id = target_invitation_id
  for update;

  if not found then
    return query
    select 'not_found'::text, target_invitation_id, null::uuid, null::uuid, requester_id;
    return;
  end if;

  if invitation_row.email <> requester_email then
    return query
    select 'email_mismatch'::text, invitation_row.id, invitation_row.establishment_id, invitation_row.role_id, requester_id;
    return;
  end if;

  if invitation_row.status = 'revoked' then
    return query
    select 'revoked'::text, invitation_row.id, invitation_row.establishment_id, invitation_row.role_id, requester_id;
    return;
  end if;

  if invitation_row.status = 'expired'
    or (invitation_row.expires_at is not null and invitation_row.expires_at <= now()) then
    if invitation_row.status = 'pending' then
      update establishment_invitations
      set status = 'expired',
          updated_at = now()
      where id = invitation_row.id;
    end if;

    return query
    select 'expired'::text, invitation_row.id, invitation_row.establishment_id, invitation_row.role_id, requester_id;
    return;
  end if;

  if invitation_row.status = 'accepted' then
    if invitation_row.invited_user_id = requester_id then
      return query
      select 'already_accepted_self'::text, invitation_row.id, invitation_row.establishment_id, invitation_row.role_id, requester_id;
      return;
    end if;

    return query
    select 'already_accepted_other'::text, invitation_row.id, invitation_row.establishment_id, invitation_row.role_id, requester_id;
    return;
  end if;

  if invitation_row.status <> 'pending' then
    return query
    select 'invalid_status'::text, invitation_row.id, invitation_row.establishment_id, invitation_row.role_id, requester_id;
    return;
  end if;

  insert into user_roles (user_id, establishment_id, role_id)
  values (requester_id, invitation_row.establishment_id, invitation_row.role_id)
  on conflict (establishment_id, user_id)
  do update set role_id = excluded.role_id;

  update establishment_invitations
  set status = 'accepted',
      invited_user_id = requester_id,
      updated_at = now()
  where id = invitation_row.id;

  return query
  select 'accepted'::text, invitation_row.id, invitation_row.establishment_id, invitation_row.role_id, requester_id;
end;
$$;

grant execute on function public.accept_establishment_invitation(uuid) to authenticated;
grant execute on function public.accept_establishment_invitation(uuid) to service_role;
