-- CAUSA CAFE: configurable per-menu discounts (base price only; modifiers retain their price).
-- Transaction values are recalculated by the database on every order, including QR orders.
begin;
alter table public.products
  add column discount_type text not null default 'none',
  add column discount_value bigint not null default 0,
  add constraint products_discount_valid check (
    (discount_type='none' and discount_value=0)
    or (discount_type='percent' and discount_value between 1 and 100)
    or (discount_type='amount' and discount_value between 1 and price)
  );
CREATE OR REPLACE FUNCTION causa_private.submit_order(payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r text:=causa_private.current_role(); existing public.orders; p public.products; line jsonb; sz jsonb; tp jsonb;
 snapshot jsonb:='[]'; sub bigint:=0; amount bigint; original_amount bigint; base_discount bigint; qty int; dis bigint; rid uuid; track uuid; tid uuid; label text:=''; src text; kind text; oid uuid;
begin
 if payload is null or jsonb_typeof(payload)<>'object' or octet_length(payload::text)>32768 then raise exception 'Payload pesanan tidak valid atau terlalu besar';end if;
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
   original_amount:=p.price+coalesce((sz->>'extra')::bigint,0)+coalesce((tp->>'extra')::bigint,0);
   base_discount:=case when p.discount_type='percent' then round(p.price::numeric*p.discount_value/100)::bigint when p.discount_type='amount' then p.discount_value else 0 end;
   amount:=original_amount-base_discount;
   if amount<0 then raise exception 'Harga diskon tidak valid';end if;
   snapshot:=snapshot||jsonb_build_array(jsonb_build_object('product_id',p.id,'name',p.name,'quantity',qty,'size',coalesce(line->>'size',''),'topping',coalesce(line->>'topping',''),'unit_price',amount,'original_unit_price',original_amount,'menu_discount',base_discount,'stock_multiplier',greatest(coalesce((sz->>'stock_multiplier')::numeric,1),0.001)));
   sub:=sub+amount*qty;
 end loop;
 dis:=case when src='pos' then coalesce((payload->>'discount')::bigint,0) else 0 end;
 if dis<0 or dis>sub then raise exception 'Diskon tidak valid';end if;
 insert into public.orders(request_id,tracking_token,source,type,table_id,table_label,customer_name,note,items,subtotal,discount,total,created_by)
 values(rid,track,src,kind,tid,label,left(coalesce(payload->>'customer_name',''),100),left(coalesce(payload->>'note',''),500),snapshot,sub,dis,sub-dis,case when r is not null then auth.uid() else null end)
 returning id into oid;
 return (select jsonb_build_object('id',id,'number',number,'tracking_token',tracking_token) from public.orders where id=oid);
end;$function$;
commit;
