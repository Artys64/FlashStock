create table roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table permissions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  description text not null,
  created_at timestamptz not null default now()
);

create table role_permissions (
  role_id uuid not null references roles(id) on delete cascade,
  permission_id uuid not null references permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);

create table user_roles (
  user_id uuid not null,
  establishment_id uuid not null references establishments(id) on delete cascade,
  role_id uuid not null references roles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, establishment_id, role_id)
);

insert into permissions (code, description) values
  ('inventory.read', 'Read inventory and product data'),
  ('inventory.write', 'Create and update inventory records'),
  ('movements.read', 'Read inventory movement ledger'),
  ('movements.write', 'Create inventory movements'),
  ('audit.read', 'Read audit logs'),
  ('admin.manage', 'Manage organization entities')
on conflict (code) do nothing;
