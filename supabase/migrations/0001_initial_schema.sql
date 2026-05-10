create extension if not exists "pgcrypto";

create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table establishments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  lead_time_alert_days int not null check (lead_time_alert_days >= 0),
  created_at timestamptz not null default now()
);

create table products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  category_id uuid not null references categories(id),
  sku text not null,
  name text not null,
  uom text not null,
  minimum_stock numeric(14,3) not null default 0 check (minimum_stock >= 0),
  created_at timestamptz not null default now(),
  unique (organization_id, sku)
);

create type batch_status as enum ('active', 'alert', 'expired', 'quarantine');

create table batches (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid not null references establishments(id) on delete cascade,
  product_id uuid not null references products(id),
  lot_code text not null,
  expiry_date date not null,
  quantity_current numeric(14,3) not null check (quantity_current >= 0),
  cost_price numeric(14,4) not null check (cost_price >= 0),
  location_id text,
  quarantined boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (establishment_id, lot_code)
);

create type movement_type as enum ('entry_purchase', 'exit_sale', 'exit_loss', 'adjustment');

create table inventory_movements (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid not null references establishments(id) on delete cascade,
  batch_id uuid not null references batches(id),
  product_id uuid not null references products(id),
  movement_type movement_type not null,
  quantity numeric(14,3) not null check (quantity > 0),
  unit_cost numeric(14,4) not null check (unit_cost >= 0),
  reason_code text,
  actor_user_id uuid,
  created_at timestamptz not null default now()
);

create index idx_batches_expiry on batches (establishment_id, expiry_date asc);
create index idx_movements_created_at on inventory_movements (establishment_id, created_at desc);
