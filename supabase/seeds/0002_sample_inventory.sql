-- Replace UUIDs below before running.
-- Keep organization/establishment/user IDs consistent with 0001_rbac_seed.sql.

with seed_context as (
  select
    '00000000-0000-0000-0000-000000000001'::uuid as organization_id,
    '00000000-0000-0000-0000-000000000002'::uuid as establishment_id,
    '00000000-0000-0000-0000-000000000010'::uuid as admin_user_id
),
category_upsert as (
  insert into categories (organization_id, name, lead_time_alert_days)
  select organization_id, 'Laticinios', 5 from seed_context
  on conflict do nothing
  returning id
),
category_ref as (
  select id from category_upsert
  union all
  select c.id
  from categories c
  join seed_context sc on sc.organization_id = c.organization_id
  where c.name = 'Laticinios'
  limit 1
),
product_upsert as (
  insert into products (organization_id, category_id, sku, name, uom, minimum_stock)
  select sc.organization_id, cr.id, 'LEITE-INT-1L', 'Leite Integral 1L', 'un', 20
  from seed_context sc
  cross join category_ref cr
  on conflict (organization_id, sku) do update
    set name = excluded.name,
        uom = excluded.uom,
        minimum_stock = excluded.minimum_stock
  returning id
),
product_ref as (
  select id from product_upsert
  union all
  select p.id
  from products p
  join seed_context sc on sc.organization_id = p.organization_id
  where p.sku = 'LEITE-INT-1L'
  limit 1
),
batch_upsert as (
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
  select
    sc.establishment_id,
    pr.id,
    'L2026A',
    (current_date + interval '4 days')::date,
    35,
    4.80,
    'A1-01',
    false
  from seed_context sc
  cross join product_ref pr
  on conflict (establishment_id, lot_code) do update
    set expiry_date = excluded.expiry_date,
        quantity_current = excluded.quantity_current,
        cost_price = excluded.cost_price,
        location_id = excluded.location_id,
        quarantined = excluded.quarantined,
        updated_at = now()
  returning id, product_id
),
batch_ref as (
  select id, product_id from batch_upsert
  union all
  select b.id, b.product_id
  from batches b
  join seed_context sc on sc.establishment_id = b.establishment_id
  where b.lot_code = 'L2026A'
  limit 1
)
insert into inventory_movements (
  establishment_id,
  batch_id,
  product_id,
  movement_type,
  quantity,
  unit_cost,
  actor_user_id
)
select
  sc.establishment_id,
  br.id,
  br.product_id,
  'entry_purchase',
  35,
  4.80,
  sc.admin_user_id
from seed_context sc
cross join batch_ref br
where not exists (
  select 1
  from inventory_movements im
  where im.establishment_id = sc.establishment_id
    and im.batch_id = br.id
    and im.movement_type = 'entry_purchase'
    and im.quantity = 35
);
