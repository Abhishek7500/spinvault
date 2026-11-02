begin;

create extension if not exists pgcrypto;

drop table if exists
  public.chat_messages,
  public.games,
  public.payment_methods,
  public.system_audit_logs,
  public.spinvault_announcements,
  public.spinvault_login_throttles,
  public.spinvault_recovery_throttles
  cascade;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  unique_email_alias text not null,
  created_at timestamptz not null default now()
);

alter table public.profiles add column if not exists username text;
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists unique_email_alias text;
alter table public.profiles add column if not exists created_at timestamptz not null default now();
alter table public.profiles alter column username drop not null;

update public.profiles as profile
set email = auth_user.email
from auth.users as auth_user
where auth_user.id = profile.id
  and (profile.email is null or btrim(profile.email) = '');

update public.profiles
set email = 'unknown+' || id::text || '@yourreceipt.app'
where email is null or btrim(email) = '';

update public.profiles
set unique_email_alias =
  coalesce(
    nullif(regexp_replace(lower(split_part(email, '@', 1)), '[^a-z0-9._-]', '', 'g'), ''),
    'receipt'
  ) || '-' || left(replace(id::text, '-', ''), 8) || '@yourreceipt.app'
where unique_email_alias is null;

alter table public.profiles alter column email set not null;
alter table public.profiles alter column unique_email_alias set not null;
create unique index if not exists profiles_email_unique_idx on public.profiles (email);
create unique index if not exists profiles_unique_email_alias_idx on public.profiles (unique_email_alias);

create table if not exists public.receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  store_name text not null,
  total_amount numeric(12, 2) not null check (total_amount >= 0),
  tax_amount numeric(12, 2) check (tax_amount is null or tax_amount >= 0),
  purchase_date date not null,
  return_deadline date,
  warranty_expiration date,
  category text not null default 'Other',
  ocr_raw_text text,
  image_url text,
  status text not null default 'active' check (status in ('active', 'returned', 'expired', 'archived')),
  transaction_id text,
  return_window_days integer check (return_window_days is null or return_window_days between 0 and 3650),
  created_at timestamptz not null default now()
);

create table if not exists public.receipt_items (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.receipts (id) on delete cascade,
  item_name text not null,
  quantity numeric(10, 2) not null default 1 check (quantity > 0),
  price numeric(12, 2) not null check (price >= 0)
);

create table if not exists public.price_alerts (
  id uuid primary key default gen_random_uuid(),
  receipt_item_id uuid not null unique references public.receipt_items (id) on delete cascade,
  original_price numeric(12, 2) not null check (original_price >= 0),
  lowest_found_price numeric(12, 2) not null check (lowest_found_price >= 0),
  last_checked timestamptz not null default now(),
  status text not null default 'active' check (status in ('active', 'claimed', 'expired'))
);

alter table public.profiles enable row level security;
alter table public.receipts enable row level security;
alter table public.receipt_items enable row level security;
alter table public.price_alerts enable row level security;

do $$
declare
  existing_policy record;
begin
  for existing_policy in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
  loop
    execute format('drop policy %I on public.profiles', existing_policy.policyname);
  end loop;
end
$$;

drop policy if exists "Users read their own SmartReceipt profile" on public.profiles;
create policy "Users read their own SmartReceipt profile"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));

drop policy if exists "Users manage their own receipts" on public.receipts;
create policy "Users manage their own receipts"
  on public.receipts for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "Users manage their own receipt items" on public.receipt_items;
create policy "Users manage their own receipt items"
  on public.receipt_items for all to authenticated
  using (
    exists (
      select 1 from public.receipts
      where receipts.id = receipt_items.receipt_id
        and receipts.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.receipts
      where receipts.id = receipt_items.receipt_id
        and receipts.user_id = (select auth.uid())
    )
  );

drop policy if exists "Users manage their own price alerts" on public.price_alerts;
create policy "Users manage their own price alerts"
  on public.price_alerts for all to authenticated
  using (
    exists (
      select 1
      from public.receipt_items
      join public.receipts on receipts.id = receipt_items.receipt_id
      where receipt_items.id = price_alerts.receipt_item_id
        and receipts.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.receipt_items
      join public.receipts on receipts.id = receipt_items.receipt_id
      where receipt_items.id = price_alerts.receipt_item_id
        and receipts.user_id = (select auth.uid())
    )
  );

revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
revoke all on public.receipts, public.receipt_items, public.price_alerts from anon;
grant select, insert, update, delete on public.receipts, public.receipt_items, public.price_alerts to authenticated;

create or replace function public.create_smartreceipt_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  local_part text;
begin
  local_part := coalesce(
    nullif(regexp_replace(lower(split_part(coalesce(new.email, ''), '@', 1)), '[^a-z0-9._-]', '', 'g'), ''),
    'receipt'
  );

  insert into public.profiles (id, email, unique_email_alias, created_at)
  values (
    new.id,
    coalesce(new.email, 'unknown+' || new.id::text || '@yourreceipt.app'),
    local_part || '-' || left(replace(new.id::text, '-', ''), 8) || '@yourreceipt.app',
    now()
  )
  on conflict (id) do update
    set email = excluded.email;

  return new;
end;
$$;

drop trigger if exists on_spinvault_auth_user_created on auth.users;
drop trigger if exists on_smartreceipt_auth_user_created on auth.users;
create trigger on_smartreceipt_auth_user_created
  after insert on auth.users
  for each row execute procedure public.create_smartreceipt_profile();

insert into public.profiles (id, email, unique_email_alias, created_at)
select
  auth_user.id,
  coalesce(auth_user.email, 'unknown+' || auth_user.id::text || '@yourreceipt.app'),
  coalesce(
    nullif(regexp_replace(lower(split_part(coalesce(auth_user.email, ''), '@', 1)), '[^a-z0-9._-]', '', 'g'), ''),
    'receipt'
  ) || '-' || left(replace(auth_user.id::text, '-', ''), 8) || '@yourreceipt.app',
  auth_user.created_at
from auth.users as auth_user
on conflict (id) do update
set email = excluded.email
where public.profiles.email is distinct from excluded.email;

create index if not exists receipts_user_purchase_date_idx
  on public.receipts (user_id, purchase_date desc);
create index if not exists receipt_items_receipt_id_idx
  on public.receipt_items (receipt_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipt-images', 'receipt-images', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users read their own SmartReceipt images" on storage.objects;
create policy "Users read their own SmartReceipt images"
  on storage.objects for select to authenticated
  using (bucket_id = 'receipt-images' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Users upload their own SmartReceipt images" on storage.objects;
create policy "Users upload their own SmartReceipt images"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'receipt-images' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Users delete their own SmartReceipt images" on storage.objects;
create policy "Users delete their own SmartReceipt images"
  on storage.objects for delete to authenticated
  using (bucket_id = 'receipt-images' and (storage.foldername(name))[1] = (select auth.uid())::text);

commit;
