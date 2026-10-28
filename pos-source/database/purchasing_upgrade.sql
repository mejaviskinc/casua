-- Purchasing upgrade. Run once on existing CAUSA databases.
begin;
create table public.purchase_orders (
 id uuid primary key default gen_random_uuid(),
 number bigint generated always as identity unique,
 supplier_name text not null check(length(btrim(supplier_name)) between 2 and 120),
 note text not null default '' check(length(note)<=500),
 expected_date date,
 items jsonb not null check(jsonb_typeof(items)='array' and jsonb_array_length(items) between 1 and 50),
 total bigint not null check(total>=0),
 status text not null default 'draft' check(status in ('draft','ordered','received','cancelled')),
 created_by uuid not null references public.staff(id),
 created_at timestamptz not null default now(),
 ordered_at timestamptz,received_at timestamptz,cancelled_at timestamptz
);
create index purchase_orders_date_idx on public.purchase_orders(created_at desc);
alter table public.purchase_orders enable row level security;
create policy purchase_owner_read on public.purchase_orders for select to authenticated using ((select causa_private.current_role())='owner');
revoke all on public.purchase_orders from anon,authenticated;
grant select on public.purchase_orders to authenticated;
alter table public.stock_movements add column purchase_id uuid references public.purchase_orders(id);
create unique index stock_movements_purchase_receive_uq on public.stock_movements(purchase_id,ingredient_id) where purchase_id is not null and kind='in';
CREATE OR REPLACE FUNCTION causa_private.create_purchase(payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare 
 ingredient public.ingredients;
 line jsonb;
 snapshot jsonb:='[]'::jsonb;
 seen uuid[]:=array[]::uuid[];
 ingredient_id uuid;
 qty numeric;
 cost bigint;
 subtotal bigint:=0;
 supplier text;
 expected date;
 new_order public.purchase_orders;
begin
 if causa_private.current_role() is distinct from 'owner' then raise exception 'Akses owner diperlukan';end if;
 if payload is null or jsonb_typeof(payload)<>'object' or octet_length(payload::text)>32768 then raise exception 'Data pembelian tidak valid';end if;
 supplier:=btrim(coalesce(payload->>'supplier_name',''));
 if length(supplier) not between 2 and 120 then raise exception 'Isi nama supplier (2-120 karakter)';end if;
 if length(coalesce(payload->>'note',''))>500 then raise exception 'Catatan terlalu panjang';end if;
 if nullif(payload->>'expected_date','') is not null then expected:=(payload->>'expected_date')::date;end if;
 if jsonb_typeof(payload->'items') is distinct from 'array' or jsonb_array_length(payload->'items') not between 1 and 50 then raise exception 'Pilih 1 sampai 50 bahan';end if;
 for line in select value from jsonb_array_elements(payload->'items') loop
   ingredient_id:=(line->>'ingredient_id')::uuid;
   qty:=(line->>'quantity')::numeric;
   cost:=(line->>'estimated_cost')::bigint;
   if ingredient_id is null or ingredient_id=any(seen) then raise exception 'Bahan tidak valid atau duplikat';end if;
   if qty is null or qty<=0 or qty>10000000 or round(qty,3)<>qty then raise exception 'Jumlah bahan tidak valid (maksimal 3 desimal)';end if;
   if cost is null or cost<0 or cost>1000000000 then raise exception 'Estimasi biaya harus antara Rp0 dan Rp1 miliar per bahan';end if;
   select * into ingredient from public.ingredients where id=ingredient_id;
   if not found then raise exception 'Bahan tidak ditemukan';end if;
   seen:=array_append(seen,ingredient_id);
   snapshot:=snapshot||jsonb_build_array(jsonb_build_object(
     'ingredient_id',ingredient_id,'name',ingredient.name,'unit',ingredient.unit,
     'quantity',qty,'estimated_cost',cost
   ));
   subtotal:=subtotal+cost;
 end loop;
 insert into public.purchase_orders(supplier_name,note,expected_date,items,total,created_by)
 values(supplier,left(coalesce(payload->>'note',''),500),expected,snapshot,subtotal,auth.uid())
 returning * into new_order;
 return to_jsonb(new_order);
end;$function$;

CREATE OR REPLACE FUNCTION public.create_purchase(payload jsonb)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
 select causa_private.create_purchase(payload)
$function$;

CREATE OR REPLACE FUNCTION causa_private.progress_purchase(purchase_id uuid, operation text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare po public.purchase_orders; line jsonb; qty numeric; iid uuid;
begin
 if causa_private.current_role() is distinct from 'owner' then raise exception 'Akses owner diperlukan';end if;
 select * into po from public.purchase_orders where id=purchase_id for update;
 if not found then raise exception 'Pembelian tidak ditemukan';end if;
 if operation='order' then
   if po.status<>'draft' then raise exception 'Hanya draft yang dapat dipesan';end if;
   update public.purchase_orders set status='ordered',ordered_at=now() where id=po.id returning * into po;
 elsif operation='receive' then
   if po.status='received' then return to_jsonb(po);end if;
   if po.status<>'ordered' then raise exception 'Tandai sebagai Dipesan terlebih dahulu';end if;
   -- Deterministic ingredient order; all updates and movement logs occur in one transaction.
   for line in select value from jsonb_array_elements(po.items) order by (value->>'ingredient_id')::uuid loop
     iid:=(line->>'ingredient_id')::uuid;
     qty:=(line->>'quantity')::numeric;
     update public.ingredients set stock=stock+qty where id=iid;
     if not found then raise exception 'Bahan tidak ditemukan saat penerimaan';end if;
     insert into public.stock_movements(ingredient_id,delta,kind,purchase_id,created_by,note)
     values(iid,qty,'in',po.id,auth.uid(),left('Purchasing #PC-'||po.number||' · '||po.supplier_name,500));
   end loop;
   update public.purchase_orders set status='received',received_at=now() where id=po.id returning * into po;
 elsif operation='cancel' then
   if po.status not in ('draft','ordered') then raise exception 'Pembelian yang diterima tidak dapat dibatalkan';end if;
   update public.purchase_orders set status='cancelled',cancelled_at=now() where id=po.id returning * into po;
 else
   raise exception 'Aksi pembelian tidak valid';
 end if;
 return to_jsonb(po);
end;$function$;

CREATE OR REPLACE FUNCTION public.progress_purchase(purchase_id uuid, operation text)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
 select causa_private.progress_purchase(purchase_id,operation)
$function$;

revoke execute on function causa_private.create_purchase(jsonb),causa_private.progress_purchase(uuid,text) from public,anon,authenticated;
grant execute on function causa_private.create_purchase(jsonb),causa_private.progress_purchase(uuid,text) to authenticated;
revoke execute on function public.create_purchase(jsonb),public.progress_purchase(uuid,text) from public,anon,authenticated;
grant execute on function public.create_purchase(jsonb),public.progress_purchase(uuid,text) to authenticated;
commit;
