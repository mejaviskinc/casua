-- CAUSA POS: payroll settings and month-by-month payslips (Owner only).
-- Installed on project nbkszvcaaitualyonkcw via Supabase migration causa_payroll_owner_only.
-- This script is also included in schema.sql for fresh installs.
CREATE TABLE IF NOT EXISTS public.payroll_settings(
 staff_id uuid primary key references public.staff(id) on delete cascade,
 base_salary bigint not null default 0 check (base_salary between 0 and 1000000000),
 updated_at timestamptz not null default now()
);
CREATE TABLE IF NOT EXISTS public.payrolls(
 id uuid primary key default gen_random_uuid(),
 staff_id uuid references public.staff(id) on delete set null,
 staff_name text not null check(length(btrim(staff_name)) between 1 and 100),
 period date not null check(date_trunc('month',period::timestamp)::date=period),
 base_salary bigint not null default 0 check(base_salary between 0 and 1000000000),
 allowance bigint not null default 0 check(allowance between 0 and 1000000000),
 bonus bigint not null default 0 check(bonus between 0 and 1000000000),
 deduction bigint not null default 0 check(deduction between 0 and 1000000000),
 net_pay bigint generated always as (base_salary+allowance+bonus-deduction) stored,
 status text not null default 'draft' check(status in ('draft','paid')),
 payment_method text check(payment_method in ('cash','transfer')),
 paid_on date,
 paid_by uuid references public.staff(id) on delete set null,
 note text not null default '' check(length(note)<=500),
 created_by uuid references public.staff(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint payroll_non_negative check(deduction<=base_salary+allowance+bonus),
 constraint payroll_payment_state check(
   (status='draft' and paid_on is null and paid_by is null and payment_method is null)
   or (status='paid' and paid_on is not null and payment_method is not null)),
 constraint payroll_unique_staff_period unique(staff_id,period)
);
CREATE INDEX IF NOT EXISTS payrolls_paid_date_idx ON public.payrolls(paid_on) WHERE status='paid';
CREATE INDEX IF NOT EXISTS payrolls_period_idx ON public.payrolls(period DESC);
ALTER TABLE public.payroll_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payrolls ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payroll_settings,public.payrolls FROM anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.payroll_settings,public.payrolls TO authenticated;

CREATE POLICY payroll_settings_owner ON public.payroll_settings FOR ALL TO authenticated
 USING ((select causa_private.current_role())='owner')
 WITH CHECK ((select causa_private.current_role())='owner');
CREATE POLICY payrolls_owner_read ON public.payrolls FOR SELECT TO authenticated
 USING ((select causa_private.current_role())='owner');
CREATE POLICY payrolls_owner_insert_draft ON public.payrolls FOR INSERT TO authenticated
 WITH CHECK ((select causa_private.current_role())='owner' AND status='draft' AND created_by=auth.uid());
CREATE POLICY payrolls_owner_update_draft ON public.payrolls FOR UPDATE TO authenticated
 USING ((select causa_private.current_role())='owner' AND status='draft')
 WITH CHECK ((select causa_private.current_role())='owner' AND status='draft');
CREATE POLICY payrolls_owner_delete_draft ON public.payrolls FOR DELETE TO authenticated
 USING ((select causa_private.current_role())='owner' AND status='draft');

CREATE OR REPLACE FUNCTION causa_private.mark_payroll_paid(payroll_id uuid,method text,payment_date date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result public.payrolls;
BEGIN
 IF auth.uid() IS NULL OR causa_private.current_role() IS DISTINCT FROM 'owner' THEN
  RAISE EXCEPTION 'Hanya Owner yang dapat mengonfirmasi penggajian';
 END IF;
 IF method NOT IN ('cash','transfer') OR payment_date IS NULL THEN
  RAISE EXCEPTION 'Metode dan tanggal pembayaran tidak valid';
 END IF;
 SELECT * INTO result FROM public.payrolls WHERE id=payroll_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Slip gaji tidak ditemukan'; END IF;
 IF result.status='paid' THEN RETURN to_jsonb(result); END IF;
 UPDATE public.payrolls SET status='paid',paid_on=payment_date,payment_method=method,
  paid_by=auth.uid(),updated_at=now() WHERE id=payroll_id RETURNING * INTO result;
 RETURN to_jsonb(result);
END;
$$;
CREATE OR REPLACE FUNCTION public.mark_payroll_paid(payroll_id uuid,method text,payment_date date)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT causa_private.mark_payroll_paid(payroll_id,method,payment_date)
$$;
REVOKE ALL ON FUNCTION causa_private.mark_payroll_paid(uuid,text,date) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION causa_private.mark_payroll_paid(uuid,text,date) TO authenticated;
REVOKE ALL ON FUNCTION public.mark_payroll_paid(uuid,text,date) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mark_payroll_paid(uuid,text,date) TO authenticated;
