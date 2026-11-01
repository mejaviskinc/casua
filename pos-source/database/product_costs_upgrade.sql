-- CAUSA POS: biaya modal dasar per porsi tidak disimpan pada products.
-- products dibaca oleh kasir/QR publik; hanya owner boleh membaca product_costs.
begin;
create table if not exists public.product_costs (
  product_id uuid primary key references public.products(id) on delete cascade,
  cost_price bigint not null default 0 check (cost_price >= 0 and cost_price <= 10000000),
  updated_at timestamptz not null default now()
);
comment on table public.product_costs is 'Owner-only base cost / modal per POS menu item. Never expose through customer menu queries.';
alter table public.product_costs enable row level security;
drop policy if exists product_costs_owner_only on public.product_costs;
create policy product_costs_owner_only on public.product_costs
  for all to authenticated
  using ((select causa_private."current_role"()) = 'owner')
  with check ((select causa_private."current_role"()) = 'owner');
revoke all on public.product_costs from anon;
grant select, insert, update, delete on public.product_costs to authenticated;
commit;
