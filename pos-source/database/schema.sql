-- CAUSA CAFE / run in a NEW Supabase project using SQL Editor.
-- No operational seed data is inserted.
begin;
create schema if not exists causa_private;
revoke all on schema causa_private from public;
grant usage on schema causa_private to authenticated, anon;
create table public.staff (
 id uuid primary key references auth.users(id) on delete cascade,
 name text not null check(length(name) between 1 and 100),
 email text not null,
 role text not null check(role in ('owner','cashier','barista')),
 active boolean not null default true,
 created_at timestamptz not null default now()
);
create function causa_private.current_role() returns text language sql stable security definer set search_path='' as $$
 select role from public.staff where id=auth.uid() and active=true and auth.uid() is not null
$$;
revoke all on function causa_private.current_role() from public;
grant execute on function causa_private.current_role() to authenticated,anon;
create table public.products (
 id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 1 and 120),
 category text not null check(category in ('Coffee','Non-Coffee','Food','Snack')),
 price bigint not null check(price>=0 and price<=10000000), description text not null default '',
 image_url text, available boolean not null default true, archived boolean not null default false,
 sizes jsonb not null default '[]' check(jsonb_typeof(sizes)='array'),
 toppings jsonb not null default '[]' check(jsonb_typeof(toppings)='array'), created_at timestamptz not null default now()
);
create table public.ingredients (
 id uuid primary key default gen_random_uuid(),name text not null check(length(name) between 1 and 100),
 unit text not null check(length(unit) between 1 and 20),stock numeric(14,3) not null default 0 check(stock>=0),
 minimum numeric(14,3) not null default 0 check(minimum>=0),created_at timestamptz not null default now()
);
create table public.recipes (
 id uuid primary key default gen_random_uuid(),product_id uuid not null references public.products(id),
 ingredient_id uuid not null references public.ingredients(id),quantity numeric(14,3) not null check(quantity>0),
 size text not null default '',topping text not null default '',unique(product_id,ingredient_id,size,topping)
);
create table public.cafe_tables (id uuid primary key default gen_random_uuid(),label text not null unique check(length(label) between 1 and 30),active boolean not null default true);
create table public.orders (
 id uuid primary key default gen_random_uuid(), request_id uuid not null unique,tracking_token uuid not null,
 number bigint generated always as identity unique,
 source text not null check(source in ('pos','qr')),type text not null check(type in ('dine-in','takeaway')),
 table_label text not null default '', table_id uuid references public.cafe_tables(id),customer_name text not null default '',note text not null default '',
 items jsonb not null check(jsonb_typeof(items)='array'),subtotal bigint not null check(subtotal>=0),discount bigint not null default 0 check(discount>=0),
 total bigint not null check(total>=0),status text not null default 'pending' check(status in ('pending','new','preparing','ready','completed','cancelled')),
 payment_status text not null default 'unpaid' check(payment_status in ('unpaid','paid','refunded')),
 payment_method text check(payment_method in ('cash','qris')),cash_received bigint not null default 0,
 created_by uuid references public.staff(id),paid_by uuid references public.staff(id),
 created_at timestamptz not null default now(),paid_at timestamptz,completed_at timestamptz,cancelled_at timestamptz,cancel_reason text,
 check(total=subtotal-discount),check(discount<=subtotal)
);
create table public.stock_movements (
 id uuid primary key default gen_random_uuid(),ingredient_id uuid not null references public.ingredients(id),
 delta numeric(14,3) not null check(delta<>0),kind text not null check(kind in ('in','out','sale','refund')),
 note text not null default '',order_id uuid references public.orders(id),created_by uuid references public.staff(id),created_at timestamptz not null default now(),
 unique(order_id,ingredient_id,kind)
);
create table public.expenses (id uuid primary key default gen_random_uuid(),description text not null check(length(description) between 1 and 200),amount bigint not null check(amount>0),spent_on date not null default (now() at time zone 'Asia/Jakarta')::date,created_by uuid not null default auth.uid() references public.staff(id),created_at timestamptz not null default now());
create table public.attendance (id uuid primary key default gen_random_uuid(),staff_id uuid not null default auth.uid() references public.staff(id),work_date date not null default (now() at time zone 'Asia/Jakarta')::date,clock_in timestamptz not null default now(),clock_out timestamptz,unique(staff_id,work_date));
create table public.settings (id boolean primary key default true check(id),qris_image text,shop_address text not null default '',receipt_footer text not null default 'Terima kasih. Sampai jumpa di CAUSA!');
insert into public.settings(id) values(true);
create index orders_date_idx on public.orders(paid_at);
create index orders_status_idx on public.orders(status,created_at);
create index orders_table_idx on public.orders(table_id,created_at);
create index stock_ingredient_idx on public.stock_movements(ingredient_id);
create index attendance_staff_idx on public.attendance(staff_id);
create index recipes_ingredient_idx on public.recipes(ingredient_id);
create index expenses_date_idx on public.expenses(spent_on);

-- Table access: staff roles are looked up on each operation, not in editable user metadata.
alter table public.staff enable row level security;
create policy staff_read on public.staff for select to authenticated using (id=auth.uid() or (select causa_private.current_role())='owner');
create policy staff_admin on public.staff for update to authenticated using ((select causa_private.current_role())='owner' and id<>auth.uid()) with check ((select causa_private.current_role())='owner' and id<>auth.uid());
alter table public.products enable row level security;
create policy products_read on public.products for select to anon,authenticated using ((available and not archived) or (select causa_private.current_role()) is not null);
create policy products_admin on public.products for all to authenticated using ((select causa_private.current_role())='owner') with check ((select causa_private.current_role())='owner');
alter table public.ingredients enable row level security;
create policy ingredients_read on public.ingredients for select to authenticated using ((select causa_private.current_role()) is not null);
-- Quantity is modified only through stock RPCs; owner can create a zero balance ingredient.
create policy ingredients_add on public.ingredients for insert to authenticated with check ((select causa_private.current_role())='owner' and stock=0);
alter table public.recipes enable row level security;
create policy recipes_admin on public.recipes for all to authenticated using ((select causa_private.current_role())='owner') with check ((select causa_private.current_role())='owner');
alter table public.orders enable row level security;
create policy orders_staff_read on public.orders for select to authenticated using ((select causa_private.current_role()) is not null);
alter table public.stock_movements enable row level security;
create policy movements_read on public.stock_movements for select to authenticated using ((select causa_private.current_role())='owner');
alter table public.expenses enable row level security;
create policy expenses_owner on public.expenses for all to authenticated using ((select causa_private.current_role())='owner') with check ((select causa_private.current_role())='owner' and created_by=auth.uid());
alter table public.attendance enable row level security;
create policy attendance_read on public.attendance for select to authenticated using (staff_id=auth.uid() or (select causa_private.current_role())='owner');
create policy attendance_in on public.attendance for insert to authenticated with check (staff_id=auth.uid() and (select causa_private.current_role()) is not null and clock_out is null);
alter table public.cafe_tables enable row level security;
create policy tables_owner on public.cafe_tables for all to authenticated using ((select causa_private.current_role())='owner') with check ((select causa_private.current_role())='owner');
alter table public.settings enable row level security;
create policy settings_read on public.settings for select to anon,authenticated using(true);
create policy settings_write on public.settings for update to authenticated using ((select causa_private.current_role())='owner') with check ((select causa_private.current_role())='owner');
revoke all on public.staff,public.products,public.ingredients,public.recipes,public.orders,public.stock_movements,public.expenses,public.attendance,public.cafe_tables,public.settings from anon,authenticated;
grant select on public.products,public.settings to anon,authenticated;
grant select on public.staff,public.ingredients,public.recipes,public.orders,public.stock_movements,public.expenses,public.attendance,public.cafe_tables to authenticated;
grant insert,update on public.products to authenticated;
grant update(name,email,role,active) on public.staff to authenticated;
grant insert on public.ingredients to authenticated;
grant insert(staff_id) on public.attendance to authenticated;
grant update(name,unit,minimum) on public.ingredients to authenticated;
create policy ingredients_edit on public.ingredients for update to authenticated using ((select causa_private.current_role())='owner') with check ((select causa_private.current_role())='owner');
grant insert,update,delete on public.recipes,public.expenses,public.cafe_tables to authenticated;
grant update on public.settings to authenticated;

-- Trusted transactional implementations are kept in a non-exposed schema.
-- Public API functions below are SECURITY INVOKER wrappers, granted individually.
create function causa_private.submit_order(payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare r text:=causa_private.current_role(); existing public.orders; p public.products; line jsonb; sz jsonb; tp jsonb;
 snapshot jsonb:='[]'; sub bigint:=0; amount bigint; qty int; dis bigint; rid uuid; track uuid; tid uuid; label text:=''; src text; kind text; oid uuid;
begin
 rid:=(payload->>'request_id')::uuid; track:=(payload->>'tracking_token')::uuid;
 if track is null or rid is null then raise exception 'Identitas pesanan tidak valid'; end if;
 perform pg_advisory_xact_lock(hashtextextended(rid::text,0));
 select * into existing from public.orders where request_id=rid;
 if found then
   if existing.tracking_token<>track then raise exception 'Identitas pesanan sudah digunakan'; end if;
   return jsonb_build_object('id',existing.id,'number',existing.number,'tracking_token',existing.tracking_token);
 end if;
 src:=coalesce(payload->>'source','pos');kind:=coalesce(payload->>'type','dine-in');
 if src not in ('pos','qr') or kind not in ('dine-in','takeaway') then raise exception 'Jenis pesanan tidak valid'; end if;
 if src='pos' and coalesce(r,'') not in ('owner','cashier') then raise exception 'Akses kasir diperlukan'; end if;
 if src='qr' then
   tid:=(payload->>'table_id')::uuid;
   select t.label into label from public.cafe_tables t where t.id=tid and active for update;
   if not found then raise exception 'QR meja tidak aktif';end if;
   if (select count(*) from public.orders where table_id=tid and status='pending' and created_at>now()-interval '15 minutes')>=10 then raise exception 'Terlalu banyak pesanan. Hubungi kasir.';end if;
   kind:='dine-in';
 else label:=left(coalesce(payload->>'table_label',''),30);end if;
 if kind='dine-in' and label='' then raise exception 'Nomor meja wajib diisi';end if;
 if jsonb_typeof(payload->'items') is distinct from 'array' or jsonb_array_length(payload->'items') not between 1 and 50 then raise exception 'Pilih 1 sampai 50 item'; end if;
 for line in select * from jsonb_array_elements(payload->'items') loop
   qty:=(line->>'quantity')::int;
   if qty is null or qty not between 1 and 99 then raise exception 'Jumlah tidak valid';end if;
   select * into p from public.products where id=(line->>'product_id')::uuid and available and not archived for share;
   if not found then raise exception 'Menu tidak tersedia, muat ulang menu';end if;
   sz:=null;tp:=null;
   if jsonb_array_length(p.sizes)>0 then
     select value into sz from jsonb_array_elements(p.sizes) where value->>'name'=coalesce(line->>'size','');
     if sz is null then raise exception 'Pilih ukuran yang tersedia';end if;
   elsif coalesce(line->>'size','')<>'' then raise exception 'Ukuran tidak valid';end if;
   if coalesce(line->>'topping','')<>'' then
     select value into tp from jsonb_array_elements(p.toppings) where value->>'name'=line->>'topping';
     if tp is null then raise exception 'Topping tidak tersedia';end if;
   end if;
   amount:=p.price+coalesce((sz->>'extra')::bigint,0)+coalesce((tp->>'extra')::bigint,0);
   if amount<0 then raise exception 'Harga tidak valid';end if;
   snapshot:=snapshot||jsonb_build_array(jsonb_build_object('product_id',p.id,'name',p.name,'quantity',qty,'size',coalesce(line->>'size',''),'topping',coalesce(line->>'topping',''),'unit_price',amount,'stock_multiplier',greatest(coalesce((sz->>'stock_multiplier')::numeric,1),0.001)));
   sub:=sub+amount*qty;
 end loop;
 dis:=case when src='pos' then coalesce((payload->>'discount')::bigint,0) else 0 end;
 if dis<0 or dis>sub then raise exception 'Diskon tidak valid';end if;
 insert into public.orders(request_id,tracking_token,source,type,table_id,table_label,customer_name,note,items,subtotal,discount,total,created_by)
 values(rid,track,src,kind,tid,label,left(coalesce(payload->>'customer_name',''),100),left(coalesce(payload->>'note',''),500),snapshot,sub,dis,sub-dis,case when r is not null then auth.uid() else null end)
 returning id into oid;
 return (select jsonb_build_object('id',id,'number',number,'tracking_token',tracking_token) from public.orders where id=oid);
end;$$;
create function public.submit_order(payload jsonb) returns jsonb language sql security invoker set search_path='' as $$select causa_private.submit_order(payload)$$;

create function causa_private.pay_order(order_id uuid,method text,received bigint,qris_confirmed boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.orders; ing record; need record;begin
 if coalesce(causa_private.current_role(),'') not in ('owner','cashier') then raise exception 'Akses kasir diperlukan';end if;
 select * into o from public.orders where id=order_id for update;
 if not found then raise exception 'Pesanan tidak ditemukan';end if;
 if o.status='cancelled' then raise exception 'Pesanan dibatalkan';end if;
 if o.payment_status='paid' then return to_jsonb(o);end if;
 if o.status<>'pending' then raise exception 'Status pesanan tidak valid';end if;
 if method not in ('cash','qris') or method is null then raise exception 'Metode pembayaran tidak valid';end if;
 if method='cash' and (received is null or received<o.total) then raise exception 'Uang tunai kurang';end if;
 if method='qris' and not coalesce(qris_confirmed,false) then raise exception 'Konfirmasi pembayaran QRIS terlebih dahulu';end if;
 -- Lock all involved ingredient rows in stable order to prevent overselling/deadlocks.
 for ing in select distinct r.ingredient_id from jsonb_array_elements(o.items) l join public.recipes r on r.product_id=(l->>'product_id')::uuid
 where (r.size='' or r.size=coalesce(l->>'size','')) and (r.topping='' or r.topping=coalesce(l->>'topping','')) order by r.ingredient_id loop
   perform 1 from public.ingredients where id=ing.ingredient_id for update;
 end loop;
 for need in select r.ingredient_id,sum(r.quantity*(l->>'quantity')::numeric*(l->>'stock_multiplier')::numeric) as qty
 from jsonb_array_elements(o.items) l join public.recipes r on r.product_id=(l->>'product_id')::uuid
 where (r.size='' or r.size=coalesce(l->>'size','')) and (r.topping='' or r.topping=coalesce(l->>'topping','')) group by r.ingredient_id loop
   if (select stock from public.ingredients where id=need.ingredient_id)<need.qty then raise exception 'Stok bahan tidak mencukupi';end if;
   update public.ingredients set stock=stock-need.qty where id=need.ingredient_id;
   insert into public.stock_movements(ingredient_id,delta,kind,order_id,created_by,note) values(need.ingredient_id,-need.qty,'sale',o.id,auth.uid(),'Pemakaian pesanan #'||o.number);
 end loop;
 update public.orders set payment_status='paid',payment_method=method,cash_received=case when method='cash' then received else total end,paid_by=auth.uid(),paid_at=now(),status='new' where id=o.id returning * into o;
 return to_jsonb(o);
end;$$;
create function public.pay_order(order_id uuid,method text,received bigint default 0,qris_confirmed boolean default false) returns jsonb language sql security invoker set search_path='' as $$select causa_private.pay_order(order_id,method,received,qris_confirmed)$$;

create function causa_private.advance_order(order_id uuid,next_status text) returns void language plpgsql security definer set search_path='' as $$
declare o public.orders;begin
 if coalesce(causa_private.current_role(),'') not in ('owner','barista') then raise exception 'Akses barista diperlukan';end if;
 select * into o from public.orders where id=order_id for update;
 if not found or o.payment_status<>'paid' then raise exception 'Pesanan belum dibayar';end if;
 if not ((o.status='new' and next_status='preparing') or (o.status='preparing' and next_status='ready') or (o.status='ready' and next_status='completed')) then raise exception 'Status telah berubah. Muat ulang pesanan.';end if;
 update public.orders set status=next_status,completed_at=case when next_status='completed' then now() else null end where id=o.id;
end;$$;
create function public.advance_order(order_id uuid,next_status text) returns void language sql security invoker set search_path='' as $$select causa_private.advance_order(order_id,next_status)$$;

create function causa_private.cancel_order(order_id uuid,reason text) returns void language plpgsql security definer set search_path='' as $$
declare o public.orders; m record;begin
 if causa_private.current_role() is distinct from 'owner' then raise exception 'Pembatalan membutuhkan izin owner/admin';end if;
 if length(trim(coalesce(reason,'')))<3 then raise exception 'Isi alasan pembatalan';end if;
 select * into o from public.orders where id=order_id for update;
 if not found then raise exception 'Pesanan tidak ditemukan';end if;
 if o.status='cancelled' then return;end if;
 for m in select ingredient_id,delta from public.stock_movements where stock_movements.order_id=o.id and kind='sale' order by ingredient_id loop
   update public.ingredients set stock=stock-m.delta where id=m.ingredient_id;
   insert into public.stock_movements(ingredient_id,delta,kind,order_id,created_by,note) values(m.ingredient_id,-m.delta,'refund',o.id,auth.uid(),left(reason,500));
 end loop;
 update public.orders set status='cancelled',payment_status=case when payment_status='paid' then 'refunded' else payment_status end,cancelled_at=now(),cancel_reason=left(reason,500) where id=o.id;
end;$$;
create function public.cancel_order(order_id uuid,reason text) returns void language sql security invoker set search_path='' as $$select causa_private.cancel_order(order_id,reason)$$;

create function causa_private.adjust_stock(ingredient_id uuid,delta numeric,note text) returns void language plpgsql security definer set search_path='' as $$
begin
 if causa_private.current_role() is distinct from 'owner' then raise exception 'Akses owner diperlukan';end if;
 if delta is null or delta=0 or length(trim(coalesce(note,'')))<3 then raise exception 'Isi jumlah dan alasan perubahan';end if;
 perform 1 from public.ingredients where id=ingredient_id for update;
 if not found then raise exception 'Bahan tidak ditemukan';end if;
 update public.ingredients i set stock=i.stock+delta where i.id=ingredient_id;
 insert into public.stock_movements(ingredient_id,delta,kind,created_by,note) values(ingredient_id,delta,case when delta>0 then 'in' else 'out' end,auth.uid(),left(note,500));
end;$$;
create function public.adjust_stock(ingredient_id uuid,delta numeric,note text) returns void language sql security invoker set search_path='' as $$select causa_private.adjust_stock(ingredient_id,delta,note)$$;

create function causa_private.clock_out() returns void language plpgsql security definer set search_path='' as $$begin
 if causa_private.current_role() is null then raise exception 'Login diperlukan';end if;
 update public.attendance set clock_out=now() where staff_id=auth.uid() and work_date=(now() at time zone 'Asia/Jakarta')::date and clock_out is null;
 if not found then raise exception 'Belum absen masuk atau sudah absen pulang';end if;
end;$$;
create function public.clock_out() returns void language sql security invoker set search_path='' as $$select causa_private.clock_out()$$;

create function causa_private.track_order(order_id uuid,token uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',id,'number',number,'status',status,'payment_status',payment_status,'total',total,'items',items,'created_at',created_at,'table_label',table_label) from public.orders where id=order_id and tracking_token=token
$$;
create function public.track_order(order_id uuid,token uuid) returns jsonb language sql security invoker set search_path='' as $$select causa_private.track_order(order_id,token)$$;
create function causa_private.get_table(token uuid) returns jsonb language sql stable security definer set search_path='' as $$select jsonb_build_object('id',id,'label',label) from public.cafe_tables where id=token and active$$;
create function public.get_table(token uuid) returns jsonb language sql security invoker set search_path='' as $$select causa_private.get_table(token)$$;

revoke execute on all functions in schema causa_private from public;
grant execute on function causa_private.current_role(),causa_private.submit_order(jsonb),causa_private.track_order(uuid,uuid),causa_private.get_table(uuid) to anon,authenticated;
grant execute on function causa_private.pay_order(uuid,text,bigint,boolean),causa_private.advance_order(uuid,text),causa_private.cancel_order(uuid,text),causa_private.adjust_stock(uuid,numeric,text),causa_private.clock_out() to authenticated;
revoke execute on function public.submit_order(jsonb),public.track_order(uuid,uuid),public.get_table(uuid),public.pay_order(uuid,text,bigint,boolean),public.advance_order(uuid,text),public.cancel_order(uuid,text),public.adjust_stock(uuid,numeric,text),public.clock_out() from public,anon,authenticated;
grant execute on function public.submit_order(jsonb),public.track_order(uuid,uuid),public.get_table(uuid) to anon,authenticated;
grant execute on function public.pay_order(uuid,text,bigint,boolean),public.advance_order(uuid,text),public.cancel_order(uuid,text),public.adjust_stock(uuid,numeric,text),public.clock_out() to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('menu-images','menu-images',true,5242880,array['image/jpeg','image/png','image/webp']);
create policy menu_upload_owner on storage.objects for insert to authenticated with check(bucket_id='menu-images' and (select causa_private.current_role())='owner');
create policy menu_storage_owner on storage.objects for select to authenticated using(bucket_id='menu-images' and (select causa_private.current_role())='owner');
create policy menu_storage_delete on storage.objects for delete to authenticated using(bucket_id='menu-images' and (select causa_private.current_role())='owner');
alter publication supabase_realtime add table public.orders,public.products,public.ingredients,public.expenses,public.attendance,public.staff,public.cafe_tables,public.recipes,public.stock_movements,public.settings;
commit;
