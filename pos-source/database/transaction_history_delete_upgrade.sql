-- CAUSA CAFE: owner-only removal from transaction history without destroying audit records.
-- A paid sale is cancelled (and its ingredient consumption reversed) before it is archived.
begin;
alter table public.orders
 add column deleted_at timestamptz,
 add column deleted_by uuid references public.staff(id),
 add column deleted_reason text check (deleted_reason is null or length(deleted_reason) between 3 and 500);

create index orders_visible_created_idx on public.orders(created_at desc) where deleted_at is null;

drop policy if exists orders_staff_read on public.orders;
create policy orders_staff_read on public.orders
 for select to authenticated
 using (deleted_at is null and (select causa_private.current_role()) is not null);

create function causa_private.delete_order_history(order_id uuid, reason text)
returns void language plpgsql security definer set search_path='' as $$
declare o public.orders; description text;
begin
 if causa_private.current_role() is distinct from 'owner' then
   raise exception 'Hanya owner/admin yang dapat menghapus transaksi';
 end if;
 description:=btrim(coalesce(reason,''));
 if length(description) not between 3 and 500 then
   raise exception 'Alasan penghapusan harus 3 sampai 500 karakter';
 end if;
 if order_id is null then raise exception 'Nomor transaksi tidak valid'; end if;
 select * into o from public.orders where id=order_id for update;
 if not found then raise exception 'Transaksi tidak ditemukan'; end if;
 if o.deleted_at is not null then return; end if;
 if o.status<>'cancelled' then
   -- Existing audited cancellation restores consumed ingredients exactly once
   -- and excludes paid orders from revenue; monetary refunds remain manual.
   perform causa_private.cancel_order(order_id,'Dihapus dari riwayat: '||description);
 end if;
 update public.orders set deleted_at=now(),deleted_by=auth.uid(),
   deleted_reason=description where id=order_id;
end;$$;

create function public.delete_order_history(order_id uuid, reason text)
returns void language sql security invoker set search_path='' as $$
 select causa_private.delete_order_history(order_id,reason)
$$;

create or replace function causa_private.track_order(order_id uuid,token uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',id,'number',number,'status',status,
 'payment_status',payment_status,'total',total,'items',items,
 'created_at',created_at,'table_label',table_label)
 from public.orders
 where id=order_id and tracking_token=token and deleted_at is null
$$;

revoke execute on function causa_private.delete_order_history(uuid,text)
 from public,anon,authenticated;
grant execute on function causa_private.delete_order_history(uuid,text) to authenticated;
revoke execute on function public.delete_order_history(uuid,text)
 from public,anon,authenticated;
grant execute on function public.delete_order_history(uuid,text) to authenticated;
commit;
