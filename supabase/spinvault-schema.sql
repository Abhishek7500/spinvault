create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique,
  role text not null default 'player' check (role in ('player', 'admin'))
);

create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  logo_url text,
  download_url text
);

create table if not exists public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  instructions text not null default '',
  qr_code_path text,
  enabled boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles (id) on delete cascade,
  receiver_id uuid not null references public.profiles (id) on delete cascade,
  content text not null,
  request_type text check (request_type in ('load', 'cashout')),
  amount numeric(12, 2) check (amount is null or amount > 0),
  request_status text check (request_status in ('pending', 'approved', 'denied', 'loaded', 'cashout_sent')),
  attachment_path text,
  attachment_name text,
  created_at timestamptz not null default now(),
  constraint chat_messages_distinct_participants check (sender_id <> receiver_id),
  constraint chat_messages_request_payload check (
    (request_type is null and amount is null)
    or (request_type is not null and amount is not null)
  )
);

alter table public.chat_messages add column if not exists request_status text;
alter table public.chat_messages add column if not exists attachment_path text;
alter table public.chat_messages add column if not exists attachment_name text;
update public.chat_messages
set request_status = 'pending'
where request_type is not null and request_status is null;
update public.chat_messages
set request_status = null
where request_type is null and request_status is not null;
alter table public.chat_messages drop constraint if exists chat_messages_request_status_check;
alter table public.chat_messages add constraint chat_messages_request_status_check
  check (request_status is null or request_status in ('pending', 'approved', 'denied', 'loaded', 'cashout_sent'));
alter table public.chat_messages drop constraint if exists chat_messages_request_status_consistent;
alter table public.chat_messages add constraint chat_messages_request_status_consistent
  check (
    (request_type is null and request_status is null)
    or (request_type is not null and request_status is not null)
  );

create index if not exists chat_messages_sender_receiver_created_idx
  on public.chat_messages (sender_id, receiver_id, created_at);
create index if not exists chat_messages_receiver_sender_created_idx
  on public.chat_messages (receiver_id, sender_id, created_at);

create or replace function public.create_spinvault_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_username text;
begin
  requested_username := nullif(trim(new.raw_user_meta_data ->> 'username'), '');
  if requested_username is null then
    requested_username := split_part(new.email, '@', 1);
  end if;

  insert into public.profiles (id, username)
  values (new.id, requested_username);
  return new;
end;
$$;

drop trigger if exists on_spinvault_auth_user_created on auth.users;
create trigger on_spinvault_auth_user_created
  after insert on auth.users
  for each row execute procedure public.create_spinvault_profile();

alter table public.profiles enable row level security;
alter table public.games enable row level security;
alter table public.chat_messages enable row level security;
alter table public.payment_methods enable row level security;
grant select on public.profiles to authenticated;
grant select on public.games to anon, authenticated;
grant select, insert on public.chat_messages to authenticated;
grant select, insert, update, delete on public.payment_methods to authenticated;

drop policy if exists "Authenticated users can read profiles" on public.profiles;
create policy "Authenticated users can read profiles"
  on public.profiles for select to authenticated
  using (true);

drop policy if exists "Users can update their own username" on public.profiles;
create policy "Users can update their own username"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

revoke update on public.profiles from authenticated;
grant update (username) on public.profiles to authenticated;

drop policy if exists "Games are readable by everyone" on public.games;
create policy "Games are readable by everyone"
  on public.games for select to anon, authenticated
  using (true);

drop policy if exists "Participants and admins can read chat messages" on public.chat_messages;
create policy "Participants and admins can read chat messages"
  on public.chat_messages for select to authenticated
  using (
    sender_id = (select auth.uid())
    or receiver_id = (select auth.uid())
    or exists (
      select 1 from public.profiles admin_profile
      where admin_profile.id = (select auth.uid())
        and admin_profile.role = 'admin'
    )
  );

drop policy if exists "Players message admins and admins message players" on public.chat_messages;
create policy "Players message admins and admins message players"
  on public.chat_messages for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and exists (
      select 1
      from public.profiles sender_profile
      join public.profiles receiver_profile on receiver_profile.id = chat_messages.receiver_id
      where sender_profile.id = (select auth.uid())
        and (
          (sender_profile.role = 'player' and receiver_profile.role = 'admin')
          or sender_profile.role = 'admin'
        )
        and (
          (chat_messages.request_type is null and chat_messages.request_status is null)
          or (chat_messages.request_type is not null and chat_messages.request_status = 'pending')
        )
    )
  );

drop policy if exists "Players read enabled payment methods and admins read all" on public.payment_methods;
create policy "Players read enabled payment methods and admins read all"
  on public.payment_methods for select to authenticated
  using (
    enabled
    or exists (
      select 1 from public.profiles
      where id = (select auth.uid()) and role = 'admin'
    )
  );

drop policy if exists "Admins manage payment methods" on public.payment_methods;
create policy "Admins manage payment methods"
  on public.payment_methods for all to authenticated
  using (
    exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin')
  )
  with check (
    exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin')
  );

create or replace function public.process_spinvault_request(request_id uuid, action text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  request_row public.chat_messages%rowtype;
  updated_request public.chat_messages%rowtype;
  confirmation_row public.chat_messages%rowtype;
  next_status text;
  confirmation_text text;
begin
  if actor_id is null or not exists (
    select 1 from public.profiles where id = actor_id and role = 'admin'
  ) then
    raise exception 'Only admins can process requests';
  end if;

  select * into request_row
  from public.chat_messages
  where id = request_id
    and receiver_id = actor_id
    and request_type is not null
    and exists (
      select 1 from public.profiles
      where id = public.chat_messages.sender_id and role = 'player'
    )
  for update;

  if not found then
    raise exception 'Request was not found or is not assigned to this admin';
  end if;

  if action is null or action not in ('approve', 'deny', 'loaded', 'cashout_sent') then
    raise exception 'Unsupported request action';
  end if;
  if request_row.request_status is distinct from 'pending' and action in ('approve', 'deny') then
    raise exception 'Only pending requests can be approved or denied';
  end if;
  if action = 'loaded' and (request_row.request_type <> 'load' or request_row.request_status <> 'approved') then
    raise exception 'Approve a load request before marking it loaded';
  end if;
  if action = 'cashout_sent' and (request_row.request_type <> 'cashout' or request_row.request_status <> 'approved') then
    raise exception 'Approve a cash-out request before marking it sent';
  end if;

  next_status := case action
    when 'approve' then 'approved'
    when 'deny' then 'denied'
    when 'loaded' then 'loaded'
    else 'cashout_sent'
  end;

  update public.chat_messages
  set request_status = next_status
  where id = request_row.id
  returning * into updated_request;

  confirmation_text := case next_status
    when 'approved' then 'Your ' || case request_row.request_type when 'load' then 'load' else 'cash-out' end || ' request was approved.'
    when 'denied' then 'Your ' || case request_row.request_type when 'load' then 'load' else 'cash-out' end || ' request was denied. Please contact support if you have questions.'
    when 'loaded' then 'Your requested load has been marked as loaded.'
    else 'Your cash-out has been marked as sent.'
  end;

  insert into public.chat_messages (sender_id, receiver_id, content)
  values (actor_id, request_row.sender_id, confirmation_text)
  returning * into confirmation_row;

  return jsonb_build_object(
    'request', to_jsonb(updated_request),
    'confirmation', to_jsonb(confirmation_row)
  );
end;
$$;

revoke all on function public.process_spinvault_request(uuid, text) from public;
grant execute on function public.process_spinvault_request(uuid, text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('chat-attachments', 'chat-attachments', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
  ('payment-qr', 'payment-qr', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users upload chat images into own folder" on storage.objects;
create policy "Users upload chat images into own folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'chat-attachments'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Participants read chat image attachments" on storage.objects;
create policy "Participants read chat image attachments"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'chat-attachments'
    and exists (
      select 1 from public.chat_messages
      where attachment_path = storage.objects.name
        and (
          sender_id = (select auth.uid())
          or receiver_id = (select auth.uid())
          or exists (
            select 1 from public.profiles
            where id = (select auth.uid()) and role = 'admin'
          )
        )
    )
  );

drop policy if exists "Admins upload payment QR images into own folder" on storage.objects;
create policy "Admins upload payment QR images into own folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'payment-qr'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin')
  );

drop policy if exists "Players and admins read payment QR images" on storage.objects;
create policy "Players and admins read payment QR images"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'payment-qr'
    and exists (
      select 1 from public.payment_methods
      where qr_code_path = storage.objects.name
        and (
          enabled
          or exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin')
        )
    )
  );

drop policy if exists "Admins delete own SpinVault images" on storage.objects;
create policy "Admins delete own SpinVault images"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'payment-qr'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin')
  );

drop policy if exists "Users delete own chat images" on storage.objects;
create policy "Users delete own chat images"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'chat-attachments'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

insert into public.games (title)
select featured.title
from (values
  ('Juwa'),
  ('GameVault'),
  ('Orion Stars'),
  ('Neon Reels'),
  ('Lucky Orbit'),
  ('Starfall Slots'),
  ('Pixel Jackpot'),
  ('Cosmic Spin'),
  ('Moonlight Arcade'),
  ('Vault Rush')
) as featured(title)
where not exists (
  select 1 from public.games existing
  where lower(existing.title) = lower(featured.title)
);

alter table public.chat_messages replica identity full;
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'chat_messages'
  ) then
    alter publication supabase_realtime add table public.chat_messages;
  end if;
end;
$$;
