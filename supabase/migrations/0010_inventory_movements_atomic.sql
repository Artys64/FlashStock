create or replace function public.register_inbound_movement(
  target_establishment_id uuid,
  target_product_id uuid,
  target_lot_code text,
  target_expiry_date date,
  target_quantity numeric,
  target_cost_price numeric,
  target_location_id text default null,
  target_actor_user_id uuid default null
)
returns table (
  batch_id uuid,
  movement_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_batch_id uuid;
  inserted_movement_id uuid;
begin
  if auth.uid() is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  if not public.user_has_permission(target_establishment_id, 'movements.write') then
    raise exception 'INBOUND_FORBIDDEN';
  end if;

  if target_quantity <= 0 then
    raise exception 'INBOUND_INVALID_QUANTITY';
  end if;

  if target_cost_price < 0 then
    raise exception 'INBOUND_INVALID_COST_PRICE';
  end if;

  if not exists (
    select 1
    from products p
    join establishments e on e.organization_id = p.organization_id
    where p.id = target_product_id
      and e.id = target_establishment_id
  ) then
    raise exception 'INBOUND_PRODUCT_TENANT_MISMATCH';
  end if;

  insert into batches (
    establishment_id,
    product_id,
    lot_code,
    expiry_date,
    quantity_current,
    cost_price,
    location_id,
    quarantined
  )
  values (
    target_establishment_id,
    target_product_id,
    target_lot_code,
    target_expiry_date,
    target_quantity,
    target_cost_price,
    target_location_id,
    false
  )
  returning id into inserted_batch_id;

  insert into inventory_movements (
    establishment_id,
    batch_id,
    product_id,
    movement_type,
    quantity,
    unit_cost,
    reason_code,
    actor_user_id
  )
  values (
    target_establishment_id,
    inserted_batch_id,
    target_product_id,
    'entry_purchase',
    target_quantity,
    target_cost_price,
    null,
    target_actor_user_id
  )
  returning id into inserted_movement_id;

  batch_id := inserted_batch_id;
  movement_id := inserted_movement_id;
  return next;
end;
$$;

create or replace function public.register_outbound_movement(
  target_establishment_id uuid,
  target_product_id uuid,
  target_batch_id uuid,
  target_quantity numeric,
  target_movement_type text,
  target_reason_code text default null,
  target_actor_user_id uuid default null
)
returns table (
  batch_id uuid,
  movement_id uuid,
  new_quantity numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_batch batches%rowtype;
  resolved_movement_type movement_type;
  inserted_movement_id uuid;
  today_operation date := timezone('America/Sao_Paulo', now())::date;
begin
  if auth.uid() is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  if not public.user_has_permission(target_establishment_id, 'movements.write') then
    raise exception 'OUTBOUND_FORBIDDEN';
  end if;

  if target_quantity <= 0 then
    raise exception 'OUTBOUND_INVALID_QUANTITY';
  end if;

  begin
    resolved_movement_type := target_movement_type::movement_type;
  exception
    when others then
      raise exception 'OUTBOUND_INVALID_MOVEMENT_TYPE';
  end;

  select *
  into selected_batch
  from batches
  where id = target_batch_id
    and establishment_id = target_establishment_id
    and product_id = target_product_id
  for update;

  if not found then
    raise exception 'OUTBOUND_BATCH_NOT_FOUND';
  end if;

  if selected_batch.quarantined then
    raise exception 'OUTBOUND_BATCH_QUARANTINED';
  end if;

  if selected_batch.quantity_current < target_quantity then
    raise exception 'OUTBOUND_INSUFFICIENT_STOCK';
  end if;

  if resolved_movement_type <> 'exit_loss' and selected_batch.expiry_date <= today_operation then
    raise exception 'OUTBOUND_EXPIRED_NOT_ALLOWED';
  end if;

  update batches
  set quantity_current = quantity_current - target_quantity,
      updated_at = now(),
      version = version + 1
  where id = selected_batch.id;

  insert into inventory_movements (
    establishment_id,
    batch_id,
    product_id,
    movement_type,
    quantity,
    unit_cost,
    reason_code,
    actor_user_id
  )
  values (
    target_establishment_id,
    selected_batch.id,
    target_product_id,
    resolved_movement_type,
    target_quantity,
    selected_batch.cost_price,
    target_reason_code,
    target_actor_user_id
  )
  returning id into inserted_movement_id;

  batch_id := selected_batch.id;
  movement_id := inserted_movement_id;
  new_quantity := selected_batch.quantity_current - target_quantity;
  return next;
end;
$$;

grant execute on function public.register_inbound_movement(uuid, uuid, text, date, numeric, numeric, text, uuid) to authenticated;
grant execute on function public.register_inbound_movement(uuid, uuid, text, date, numeric, numeric, text, uuid) to service_role;

grant execute on function public.register_outbound_movement(uuid, uuid, uuid, numeric, text, text, uuid) to authenticated;
grant execute on function public.register_outbound_movement(uuid, uuid, uuid, numeric, text, text, uuid) to service_role;
