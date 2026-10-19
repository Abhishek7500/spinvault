-- Apply after spinvault-schema.sql.
-- Username/PIN users use a non-deliverable shadow email as their native
-- Supabase Auth identity; never use this domain for real email delivery.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create schema if not exists spinvault_private;
revoke all on schema spinvault_private from public, anon, authenticated;
do $$
declare
  installed_schema text;
begin
  select n.nspname into installed_schema
  from pg_extension e
  join pg_namespace n on n.oid = e.extnamespace
  where e.extname = 'pgcrypto';
  if installed_schema is null then raise exception 'pgcrypto is not installed'; end if;
  execute format(
    'create or replace function spinvault_private.crypt(text, text) returns text language sql immutable strict set search_path = '''' as $body$ select %I.crypt($1, $2) $body$',
    installed_schema
  );
  execute format(
    'create or replace function spinvault_private.gen_salt(text, integer) returns text language sql volatile strict set search_path = '''' as $body$ select %I.gen_salt($1, $2) $body$',
    installed_schema
  );
end;
$$;
revoke all on function spinvault_private.crypt(text, text) from public, anon, authenticated;
revoke all on function spinvault_private.gen_salt(text, integer) from public, anon, authenticated;

alter table public.profiles
  add column if not exists pin_hash text,
  add column if not exists custom_username text,
  add column if not exists admin_status text not null default 'none',
  add column if not exists admin_requested_at timestamptz,
  add column if not exists is_super_admin boolean not null default false,
  add column if not exists last_seen timestamptz,
  add column if not exists last_ip text;

alter table public.profiles drop constraint if exists profiles_admin_status_check;
alter table public.profiles add constraint profiles_admin_status_check
  check (admin_status in ('none', 'pending', 'approved', 'rejected'));

create unique index if not exists profiles_custom_username_lower_uidx
  on public.profiles (lower(custom_username))
  where custom_username is not null;

create table if not exists public.system_audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  username text,
  event_type text not null check (event_type in ('login_failed', 'system_error')),
  error_message text not null,
  created_at timestamptz not null default now()
);

create index if not exists system_audit_logs_created_at_idx
  on public.system_audit_logs (created_at desc);
create index if not exists system_audit_logs_user_id_created_at_idx
  on public.system_audit_logs (user_id, created_at desc);

alter table public.system_audit_logs enable row level security;
revoke all on public.system_audit_logs from anon, authenticated;
grant select on public.system_audit_logs to authenticated;
grant insert (user_id, username, event_type, error_message) on public.system_audit_logs to authenticated;

create table if not exists public.spinvault_login_throttles (
  username_key text primary key,
  failed_attempts integer not null default 0,
  window_started_at timestamptz not null default now(),
  locked_until timestamptz
);
alter table public.spinvault_login_throttles enable row level security;
revoke all on public.spinvault_login_throttles from public, anon, authenticated;

create or replace function public.spinvault_is_admin(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = p_user_id and (p.role = 'admin' or p.is_super_admin)
  );
$$;

create or replace function public.spinvault_is_super_admin(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = p_user_id and p.is_super_admin
  );
$$;

revoke all on function public.spinvault_is_admin(uuid) from public, anon;
revoke all on function public.spinvault_is_super_admin(uuid) from public, anon;
grant execute on function public.spinvault_is_admin(uuid) to authenticated;
grant execute on function public.spinvault_is_super_admin(uuid) to authenticated;

drop policy if exists "Authenticated users can read profiles" on public.profiles;
create policy "Users read own profiles and admins read all"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.spinvault_is_admin());

drop policy if exists "Admins read audit logs" on public.system_audit_logs;
create policy "Admins read audit logs"
  on public.system_audit_logs for select to authenticated
  using (public.spinvault_is_admin());

drop policy if exists "Users insert own failure logs" on public.system_audit_logs;
create policy "Users insert own failure logs"
  on public.system_audit_logs for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and event_type in ('login_failed', 'system_error')
  );

-- PIN hashes and last_ip are deliberately not selectable through PostgREST.
revoke select on public.profiles from authenticated;
grant select (id, username, role, custom_username, admin_status, admin_requested_at, is_super_admin)
  on public.profiles to authenticated;
revoke update on public.profiles from authenticated;
grant update (username) on public.profiles to authenticated;

create or replace function public.login_with_pin(p_username text, p_pin text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_username text := lower(trim(coalesce(p_username, '')));
  matched_profile public.profiles%rowtype;
  throttle_row public.spinvault_login_throttles%rowtype;
begin
  if normalized_username = '' or normalized_username !~ '^[a-z0-9_-]{3,32}$' then
    insert into public.system_audit_logs (username, event_type, error_message)
    values (nullif(normalized_username, ''), 'login_failed', 'Invalid username or PIN');
    return false;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(normalized_username, 0));
  select * into throttle_row
  from public.spinvault_login_throttles
  where username_key = normalized_username
  for update;

  if found and throttle_row.locked_until > pg_catalog.now() then
    insert into public.system_audit_logs (username, event_type, error_message)
    values (normalized_username, 'login_failed', 'Too many failed attempts; try again later');
    return false;
  end if;

  select * into matched_profile
  from public.profiles
  where lower(custom_username) = normalized_username;

  if found and p_pin is not null and p_pin ~ '^[A-Za-z0-9]{6,32}$'
    and matched_profile.pin_hash is not null
    and matched_profile.pin_hash = spinvault_private.crypt(p_pin, matched_profile.pin_hash) then
    delete from public.spinvault_login_throttles where username_key = normalized_username;
    return true;
  end if;

  insert into public.spinvault_login_throttles as throttle
    (username_key, failed_attempts, window_started_at, locked_until)
  values (normalized_username, 1, pg_catalog.now(), null)
  on conflict (username_key) do update
    set failed_attempts = case
          when throttle.window_started_at < pg_catalog.now() - interval '10 minutes' then 1
          else throttle.failed_attempts + 1
        end,
        window_started_at = case
          when throttle.window_started_at < pg_catalog.now() - interval '10 minutes' then pg_catalog.now()
          else throttle.window_started_at
        end,
        locked_until = case
          when throttle.window_started_at >= pg_catalog.now() - interval '10 minutes'
            and throttle.failed_attempts + 1 >= 5 then pg_catalog.now() + interval '10 minutes'
          else null
        end;

  insert into public.system_audit_logs (user_id, username, event_type, error_message)
  values (matched_profile.id, normalized_username, 'login_failed', 'Invalid username or PIN');
  return false;
end;
$$;

revoke all on function public.login_with_pin(text, text) from public;
grant execute on function public.login_with_pin(text, text) to anon, authenticated;

create or replace function public.admin_upsert_player_credentials(
  p_target_user_id uuid,
  p_new_username text,
  p_new_pin text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  normalized_username text := lower(trim(coalesce(p_new_username, '')));
  target_id uuid := coalesce(p_target_user_id, pg_catalog.gen_random_uuid());
  shadow_email text;
  pin_digest text;
  target_role text;
begin
  if actor_id is null or not public.spinvault_is_admin(actor_id) then
    raise exception 'Only admins can manage player credentials';
  end if;
  if normalized_username !~ '^[a-z0-9_-]{3,32}$' then
    raise exception 'Username must be 3-32 letters, numbers, underscores, or hyphens';
  end if;
  if p_new_pin is null or p_new_pin !~ '^[A-Za-z0-9]{6,32}$' then
    raise exception 'PIN must be 6-32 letters or numbers';
  end if;
  if exists (
    select 1 from public.profiles
    where (lower(custom_username) = normalized_username or lower(username) = normalized_username)
      and id <> target_id
  ) then
    raise exception 'That username is already in use';
  end if;

  if p_target_user_id is not null then
    select role into target_role from public.profiles where id = target_id for update;
    if target_role is distinct from 'player' then
      raise exception 'Only existing player accounts can be reset';
    end if;
  end if;

  shadow_email := normalized_username || '@spinvault.local';
  pin_digest := spinvault_private.crypt(p_new_pin, spinvault_private.gen_salt('bf', 12));

  if p_target_user_id is null then
    if exists (select 1 from auth.users where lower(email) = shadow_email) then
      raise exception 'That username is already in use';
    end if;
    insert into auth.users (
      id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) values (
      target_id, 'authenticated', 'authenticated', shadow_email, pin_digest, pg_catalog.now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      pg_catalog.jsonb_build_object('username', normalized_username),
      pg_catalog.now(), pg_catalog.now()
    );
  else
    update auth.users
    set email = shadow_email,
        encrypted_password = pin_digest,
        email_confirmed_at = coalesce(email_confirmed_at, pg_catalog.now()),
        raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
          || pg_catalog.jsonb_build_object('username', normalized_username),
        updated_at = pg_catalog.now()
    where id = target_id;
    if not found then
      raise exception 'Player Auth account was not found';
    end if;
    update auth.identities
    set provider_id = shadow_email,
        identity_data = coalesce(identity_data, '{}'::jsonb) || pg_catalog.jsonb_build_object('email', shadow_email),
        updated_at = pg_catalog.now()
    where user_id = target_id and provider = 'email';
  end if;

  insert into public.profiles (id, username, custom_username, pin_hash, role)
  values (target_id, normalized_username, normalized_username, pin_digest, 'player')
  on conflict (id) do update
    set username = excluded.username,
        custom_username = excluded.custom_username,
        pin_hash = excluded.pin_hash;

  return pg_catalog.jsonb_build_object('id', target_id, 'username', normalized_username);
end;
$$;

revoke all on function public.admin_upsert_player_credentials(uuid, text, text) from public, anon;
grant execute on function public.admin_upsert_player_credentials(uuid, text, text) to authenticated;

create or replace function public.admin_upsert_player(p_new_username text, p_new_pin text)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select public.admin_upsert_player_credentials(null::uuid, p_new_username, p_new_pin);
$$;
revoke all on function public.admin_upsert_player(text, text) from public, anon;
grant execute on function public.admin_upsert_player(text, text) to authenticated;

create or replace function public.update_user_heartbeat()
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  active_user_id uuid := auth.uid();
  seen_at timestamptz := pg_catalog.now();
begin
  if active_user_id is null then
    raise exception 'Authentication is required';
  end if;
  update public.profiles set last_seen = seen_at where id = active_user_id;
  if not found then
    raise exception 'Profile was not found';
  end if;
  return seen_at;
end;
$$;
revoke all on function public.update_user_heartbeat() from public, anon;
grant execute on function public.update_user_heartbeat() to authenticated;

create or replace function public.get_super_admin_telemetry()
returns table (id uuid, username text, custom_username text, last_seen timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.spinvault_is_super_admin(auth.uid()) then
    raise exception 'Only a super admin can access telemetry';
  end if;
  return query
    select p.id, p.username, p.custom_username, p.last_seen
    from public.profiles p
    where p.last_seen >= pg_catalog.now() - interval '5 minutes'
    order by p.last_seen desc;
end;
$$;
revoke all on function public.get_super_admin_telemetry() from public, anon;
grant execute on function public.get_super_admin_telemetry() to authenticated;

create or replace function public.request_admin_elevation()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  requester_id uuid := auth.uid();
begin
  if requester_id is null then raise exception 'Authentication is required'; end if;
  update public.profiles
  set admin_status = 'pending', admin_requested_at = pg_catalog.now()
  where id = requester_id and role = 'player' and not is_super_admin
    and admin_status in ('none', 'rejected');
  if not found then raise exception 'An admin request cannot be submitted for this account'; end if;
end;
$$;
revoke all on function public.request_admin_elevation() from public, anon;
grant execute on function public.request_admin_elevation() to authenticated;

create or replace function public.review_admin_request(p_target_user_id uuid, p_approve boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.spinvault_is_super_admin(auth.uid()) then
    raise exception 'Only a super admin can review admin requests';
  end if;
  if p_approve is null then raise exception 'An approval decision is required'; end if;
  update public.profiles
  set admin_status = case when p_approve then 'approved' else 'rejected' end,
      role = case when p_approve then 'admin' else 'player' end
  where id = p_target_user_id
    and admin_status = 'pending'
    and role = 'player';
  if not found then raise exception 'Pending admin request was not found'; end if;
end;
$$;
revoke all on function public.review_admin_request(uuid, boolean) from public, anon;
grant execute on function public.review_admin_request(uuid, boolean) to authenticated;

-- Keep the existing profile trigger compatible with PIN-created users.
create or replace function public.create_spinvault_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_username text;
  normalized_username text;
begin
  requested_username := nullif(trim(new.raw_user_meta_data ->> 'username'), '');
  if requested_username is null then
    requested_username := split_part(new.email, '@', 1);
  end if;
  normalized_username := lower(requested_username);

  insert into public.profiles (id, username, custom_username)
  values (
    new.id,
    requested_username,
    case when normalized_username ~ '^[a-z0-9_-]{3,32}$' then normalized_username else null end
  )
  on conflict (id) do update
    set username = excluded.username,
        custom_username = coalesce(public.profiles.custom_username, excluded.custom_username);
  return new;
end;
$$;

-- Column privileges prevent authenticated clients from reading PIN hashes or IPs.
-- Do not grant INSERT/UPDATE/DELETE on this table via broad grants.

do $$
begin
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'system_audit_logs'
  ) is false then
    alter publication supabase_realtime add table public.system_audit_logs;
  end if;
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'profiles'
    ) then
    alter publication supabase_realtime add table public.profiles;
  end if;
end;
$$;

alter table public.system_audit_logs replica identity full;
