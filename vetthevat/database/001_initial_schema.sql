-- Vet the VAT PostgreSQL schema
-- Run on PostgreSQL 15+.
-- Production rule: the browser must never connect directly to this database.
-- Use a secured backend/API layer that verifies authentication, company access
-- and role permissions before every query.

begin;

create extension if not exists pgcrypto;
create extension if not exists citext;

create type user_status as enum ('active', 'invited', 'suspended', 'deactivated');
create type company_status as enum ('active', 'review', 'suspended');
create type member_role as enum ('owner', 'admin', 'finance', 'accountant', 'staff', 'viewer');
create type invoice_status as enum ('processed', 'pending_review', 'reviewed', 'duplicate_warning', 'processing_failed');
create type processing_status as enum ('uploaded', 'processing', 'ready_for_review', 'confirmed', 'failed');
create type review_status as enum ('needs_review', 'reviewed', 'not_required');
create type document_status as enum ('processed', 'unprocessed', 'needs_review');
create type document_type as enum ('pdf', 'image');
create type ticket_status as enum ('open', 'in_progress', 'waiting_for_customer', 'resolved');

create table app_users (
  id uuid primary key default gen_random_uuid(),
  email citext not null unique,
  full_name text not null,
  password_hash text,
  mfa_enabled boolean not null default false,
  status user_status not null default 'invited',
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  registration_number text,
  vat_number text,
  address text,
  country text not null default 'United Kingdom',
  currency char(3) not null default 'GBP',
  industry text,
  status company_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table company_members (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  user_id uuid not null references app_users(id) on delete cascade,
  role member_role not null default 'viewer',
  status user_status not null default 'active',
  invited_by uuid references app_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, user_id)
);

create table suppliers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  email citext,
  phone text,
  vat_number text,
  address text,
  status company_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, name)
);

create table documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  uploaded_by uuid references app_users(id),
  supplier_id uuid references suppliers(id),
  file_name text not null,
  document_type document_type not null,
  mime_type text not null,
  byte_size bigint not null check (byte_size >= 0),
  storage_key text not null unique,
  sha256_hash text,
  status document_status not null default 'unprocessed',
  uploaded_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table invoices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  supplier_id uuid references suppliers(id),
  document_id uuid references documents(id),
  invoice_number text not null,
  invoice_date date not null,
  due_date date,
  currency char(3) not null default 'GBP',
  supplier_name text not null,
  supplier_vat_number text,
  customer_name text,
  customer_vat_number text,
  subtotal numeric(14,2) not null default 0,
  vat_amount numeric(14,2) not null default 0,
  total_amount numeric(14,2) not null default 0,
  status invoice_status not null default 'pending_review',
  processing_status processing_status not null default 'uploaded',
  review_status review_status not null default 'needs_review',
  confidence text not null default 'needs_review',
  notes text,
  created_by uuid references app_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, supplier_id, invoice_number)
);

create table invoice_line_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  line_number integer not null,
  description text not null,
  quantity numeric(14,4) not null default 1,
  unit_price numeric(14,4) not null default 0,
  discount numeric(14,2) not null default 0,
  vat_rate numeric(5,2) not null default 20,
  net_amount numeric(14,2) not null default 0,
  vat_amount numeric(14,2) not null default 0,
  gross_amount numeric(14,2) not null default 0,
  confidence text not null default 'needs_review',
  unique (invoice_id, line_number)
);

create table vat_breakdowns (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  vat_rate numeric(5,2) not null,
  net_amount numeric(14,2) not null default 0,
  vat_amount numeric(14,2) not null default 0,
  gross_amount numeric(14,2) not null default 0,
  unique (invoice_id, vat_rate)
);

create table data_quality_warnings (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  tone text not null check (tone in ('warning', 'danger', 'info')),
  title text not null,
  description text not null,
  created_at timestamptz not null default now()
);

create table audit_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade,
  actor_user_id uuid references app_users(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  details text,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);

create table support_tickets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  created_by uuid references app_users(id),
  subject text not null,
  status ticket_status not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table support_ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references support_tickets(id) on delete cascade,
  author_user_id uuid references app_users(id),
  body text not null,
  created_at timestamptz not null default now()
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade,
  user_id uuid references app_users(id) on delete cascade,
  title text not null,
  description text not null,
  tone text not null check (tone in ('success', 'warning', 'info')),
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table api_clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  client_key text not null unique,
  hashed_secret text not null,
  allowed_scopes text[] not null default '{}',
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create table pos_registers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  location text,
  status company_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, name)
);

create table pos_sales (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  register_id uuid references pos_registers(id),
  invoice_id uuid references invoices(id),
  sale_reference text not null,
  payment_method text not null,
  net_amount numeric(14,2) not null default 0,
  vat_amount numeric(14,2) not null default 0,
  gross_amount numeric(14,2) not null default 0,
  created_by uuid references app_users(id),
  created_at timestamptz not null default now(),
  unique (company_id, sale_reference)
);

create index idx_company_members_user on company_members(user_id);
create index idx_suppliers_company on suppliers(company_id);
create index idx_documents_company on documents(company_id);
create index idx_invoices_company_date on invoices(company_id, invoice_date desc);
create index idx_invoices_supplier on invoices(supplier_id);
create index idx_invoice_line_items_invoice on invoice_line_items(invoice_id);
create index idx_audit_events_company_time on audit_events(company_id, created_at desc);
create index idx_pos_sales_company_time on pos_sales(company_id, created_at desc);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_app_users_updated_at before update on app_users for each row execute function set_updated_at();
create trigger trg_companies_updated_at before update on companies for each row execute function set_updated_at();
create trigger trg_company_members_updated_at before update on company_members for each row execute function set_updated_at();
create trigger trg_suppliers_updated_at before update on suppliers for each row execute function set_updated_at();
create trigger trg_invoices_updated_at before update on invoices for each row execute function set_updated_at();
create trigger trg_support_tickets_updated_at before update on support_tickets for each row execute function set_updated_at();
create trigger trg_pos_registers_updated_at before update on pos_registers for each row execute function set_updated_at();

-- Row Level Security guardrails.
-- The backend/API must set these values after verifying the authenticated user:
-- select set_config('app.current_user_id', '<uuid>', true);
-- select set_config('app.current_company_id', '<uuid>', true);

alter table companies enable row level security;
alter table company_members enable row level security;
alter table suppliers enable row level security;
alter table documents enable row level security;
alter table invoices enable row level security;
alter table invoice_line_items enable row level security;
alter table vat_breakdowns enable row level security;
alter table data_quality_warnings enable row level security;
alter table audit_events enable row level security;
alter table support_tickets enable row level security;
alter table support_ticket_messages enable row level security;
alter table notifications enable row level security;
alter table pos_registers enable row level security;
alter table pos_sales enable row level security;

create policy company_isolation on companies
  using (id = nullif(current_setting('app.current_company_id', true), '')::uuid);

create policy company_member_isolation on company_members
  using (company_id = nullif(current_setting('app.current_company_id', true), '')::uuid);

create policy supplier_company_isolation on suppliers
  using (company_id = nullif(current_setting('app.current_company_id', true), '')::uuid);

create policy document_company_isolation on documents
  using (company_id = nullif(current_setting('app.current_company_id', true), '')::uuid);

create policy invoice_company_isolation on invoices
  using (company_id = nullif(current_setting('app.current_company_id', true), '')::uuid);

create policy line_item_company_isolation on invoice_line_items
  using (exists (
    select 1 from invoices
    where invoices.id = invoice_line_items.invoice_id
      and invoices.company_id = nullif(current_setting('app.current_company_id', true), '')::uuid
  ));

create policy vat_breakdown_company_isolation on vat_breakdowns
  using (exists (
    select 1 from invoices
    where invoices.id = vat_breakdowns.invoice_id
      and invoices.company_id = nullif(current_setting('app.current_company_id', true), '')::uuid
  ));

create policy warning_company_isolation on data_quality_warnings
  using (exists (
    select 1 from invoices
    where invoices.id = data_quality_warnings.invoice_id
      and invoices.company_id = nullif(current_setting('app.current_company_id', true), '')::uuid
  ));

create policy audit_company_isolation on audit_events
  using (company_id = nullif(current_setting('app.current_company_id', true), '')::uuid);

create policy ticket_company_isolation on support_tickets
  using (company_id = nullif(current_setting('app.current_company_id', true), '')::uuid);

create policy ticket_message_company_isolation on support_ticket_messages
  using (exists (
    select 1 from support_tickets
    where support_tickets.id = support_ticket_messages.ticket_id
      and support_tickets.company_id = nullif(current_setting('app.current_company_id', true), '')::uuid
  ));

create policy notification_user_isolation on notifications
  using (
    user_id = nullif(current_setting('app.current_user_id', true), '')::uuid
    or company_id = nullif(current_setting('app.current_company_id', true), '')::uuid
  );

create policy pos_register_company_isolation on pos_registers
  using (company_id = nullif(current_setting('app.current_company_id', true), '')::uuid);

create policy pos_sale_company_isolation on pos_sales
  using (company_id = nullif(current_setting('app.current_company_id', true), '')::uuid);

commit;
