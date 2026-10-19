# SpinVault

SpinVault is a mobile-first Angular gaming distributor portal with a Supabase-backed game directory, player authentication, private real-time support chat, structured load/cash-out requests, and an admin inbox. The existing REST/WebSocket messaging application remains available at `/chat`; its `/login` and `/register` accounts are separate from SpinVault accounts.

## What works, and what needs setup

The home page, game cards, how-to-play guide, FAQ, responsive layout, and client-side navigation work without Supabase credentials. The supplied Juwa, GameVault, and Orion Stars cards are featured examples; no external download URLs or sample user accounts are bundled.

Supabase-dependent functions work only after you configure a project and apply the schema below:

- Load the games and their download links from the `games` table.
- Sign in to SpinVault with admin-provisioned username/PIN credentials.
- Use private player-to-admin chat, load/cash-out requests, and realtime updates.
- Sign in to the admin dashboard at `/admin`.
- Use a six-digit numeric keypad, optional separately stored recovery code, and a 15-minute inactivity lock.
- Search chat history, see typing indicators and pinned notices, crop/compress image uploads, and use quick amount/game selections.

There are **no default admin or player usernames/PINs**. Players sign in using a custom username and PIN; no player email address is required. Admin-provisioned accounts use the `username@spinvault.local` shadow-email format so the browser still receives a native Supabase session/JWT for RLS, Storage, and Realtime. An existing Supabase Auth player can be converted by resetting its access in the admin console.

The gallery contains ten compact entries as starter records. Only entries with a valid `download_url` open a game link; the included starter titles do not imply that SpinVault distributes those games. Set verified links and icons before publishing the corresponding entries.

## Supabase setup

### 1. Create a Supabase project and database

Create a project in Supabase, open its SQL Editor, and run these scripts in order:

1. [`supabase/spinvault-schema.sql`](./supabase/spinvault-schema.sql) creates the portal tables, RLS, Storage, and chat request workflows.
2. [`supabase/spinvault-pin-auth.sql`](./supabase/spinvault-pin-auth.sql) adds username/PIN Auth, account administration, admin approvals, heartbeats, audit logs, and Super Admin telemetry.

Both scripts are designed to be re-runnable. The PIN migration relies on the base profile trigger and must run after the base schema.

If you already ran an earlier version of `spinvault-schema.sql`, run the current version again before applying the PIN migration. The current schema adds the `verification_required` request state used by the admin quick action.

### 2. Configure the Angular app

Copy the project URL and public **publishable/anon** key from the Supabase project settings into **both** environment files:

- `src/environments/environment.ts` (local development)
- `src/environments/environment.prod.ts` (production build)

Replace the empty values:

```ts
supabaseUrl: 'https://your-project-ref.supabase.co',
supabaseAnonKey: 'your-public-anon-or-publishable-key',
```

These values are included in the browser bundle and are intended to be public. **Never put a Supabase `service_role` key or database password in the Angular app.** Environment values are compiled into the app at build time, so update the production environment file before running the production build or deploying it.

### 3. Configure Supabase Auth

In Supabase Authentication settings, set the Site URL to your deployed site and add the local development URL and deployed URL to the allowed redirect URLs. Admin-provisioned player accounts have confirmed, non-deliverable shadow emails in the reserved `.local` domain. Do not configure email delivery or send mail to `@spinvault.local` accounts. Native Supabase password sign-in issues the actual session JWT; the shadow email is only an Auth identifier, not a player contact address.

### 4. Bootstrap the first Super Admin

There is no pre-created owner account or shared credential. Bootstrap one trusted owner account before using the admin player-creation screen:

1. In Supabase **Authentication → Users**, create an owner account with an owner-controlled email and confirm it.
2. In the SQL Editor, replace the example email, username, and temporary PIN in this one-time bootstrap with values you control. The PIN must be 6–32 letters/numbers. It converts this account to the shadow-email login and grants the initial Super Admin role:

   ```sql
   do $$
   declare
     owner_id uuid;
     owner_name text := 'spinvault-owner';
     bootstrap_pin text := 'REPLACE_WITH_A_TEMPORARY_PIN';
     pin_digest text;
   begin
     select id into strict owner_id
     from auth.users
     where email = 'owner@your-domain.example';

     pin_digest := spinvault_private.crypt(bootstrap_pin, spinvault_private.gen_salt('bf', 12));

     update auth.users
     set email = owner_name || '@spinvault.local',
         encrypted_password = pin_digest,
         email_confirmed_at = coalesce(email_confirmed_at, now()),
         raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
           || jsonb_build_object('username', owner_name),
         updated_at = now()
     where id = owner_id;

     update auth.identities
     set provider_id = owner_name || '@spinvault.local',
         identity_data = coalesce(identity_data, '{}'::jsonb)
           || jsonb_build_object('email', owner_name || '@spinvault.local'),
         updated_at = now()
     where user_id = owner_id and provider = 'email';

     update public.profiles
     set username = owner_name,
         custom_username = owner_name,
         pin_hash = pin_digest,
         role = 'admin',
         admin_status = 'approved',
         is_super_admin = true
     where id = owner_id;
   end $$;
   ```

3. Sign in at `/pin-login` with the chosen username and temporary PIN. Immediately reset it to a unique, private PIN from `/admin` → **Player access**. Do not keep the bootstrap PIN in shell history, chat, or source control.

Only a trusted database/project owner should run this bootstrap SQL. Never promote users through client-side SQL or expose a service-role key.

### 5. Create player/test logins and review admins

There are no seeded demo accounts. After bootstrapping, use `/admin` → **Player access** to create players or reset an existing player's username and PIN. Share credentials directly with that player using a trusted channel; the app never displays a PIN after save. Player usernames are unique and case-insensitive. PINs are bcrypt-hashed in `profiles.pin_hash` and in the native Auth password field; the hash is not selectable through the client API.

For example, you can create:

| Purpose | Example username | Login |
|---|---|---|---|
| Owner/admin | `spinvault-owner` | Username plus a private PIN |
| Test player | `demo-player` | Username plus a separate private PIN |

These are suggested account names, **not accounts or credentials that already exist**. `/pin-login` and the **Chat with us** prompt accept username/PIN. Failed PIN checks are rate-limited by username and recorded in the audit stream.

An authenticated player can request admin elevation from the home navigation. Only a Super Admin can approve or reject that request in `/admin` → **Admin approvals**. To designate another trusted Super Admin, a current database owner must update the account using the Supabase SQL Editor; never expose that power through player-facing RPCs.

### 6. Deploy self-service PIN recovery

Recovery uses a separate code that the player must enroll while signed in; it cannot recover accounts that have not set a recovery code. From the home page, a signed-in user opens **Recovery code**, saves a unique 8–32 character alphanumeric code, and stores it somewhere private. The code is hashed in `profiles` and is never retrievable by admins. The signed-out **Forgot your PIN?** link accepts this code and a new 6–32 character login PIN.

Deploy the Supabase Edge Function after applying both SQL scripts:

```bash
supabase functions deploy recover-spinvault-pin --project-ref YOUR_PROJECT_REF
```

Configure `RECOVERY_IP_HASH_SECRET` as a high-entropy secret in Supabase **Project Settings → Edge Functions → Secrets**. The function also requires the project-provided `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`; if those are not present in your function environment, add them there from the project settings. Never place either server secret in Angular environment files, the README, or client code. The function configuration disables platform JWT verification for this public, signed-out recovery endpoint; the handler validates input and applies a three-attempt/15-minute limit keyed by username and a salted IP hash. The SQL recovery procedure updates the Auth password and PIN hash transactionally. Test it with a disposable account before production.

The optional six-digit touch keypad accepts numeric-only PINs. The standard input continues to accept 6–32 alphanumeric PINs. After 15 minutes without pointer, keyboard, or touch activity, the app blurs and disables the current view and asks the user to sign in again with their login PIN. This is a privacy lock, not a replacement for device or browser security.

### 7. Configure payment instructions and QR codes

Sign in with the admin account and open `/admin` → **Payment methods**. Add a provider such as Cash App, Zelle, or Venmo, enter player-facing instructions, optionally select a QR image, and choose whether the option is visible to players. Existing options can be edited or hidden. QR codes are kept in a private Supabase Storage bucket and served to authorized users through signed URLs.

The app does not connect to payment processors and does not move money. Admin actions record the request status and send a chat confirmation; verify and complete any payment separately using the provider's official service.

### 8. Add game download links

In Supabase Table Editor, edit the rows in `public.games` and set `download_url` (and optionally `logo_url`) to URLs you are authorized to distribute. The app renders a download link only when `download_url` is populated; otherwise it offers a support prompt. The `Refresh list` button reloads the game list from Supabase.

## Deploying and testing

Build the production app with:

```bash
npm install
npm run build
```

Deploy the generated `dist/messenger-frontend/browser` directory to an Angular-compatible static host. Configure that host to serve `index.html` as a fallback for client-side routes; otherwise direct visits or refreshes at `/how-to-play` or `/admin` can return a host-level 404. Configure HTTPS and the matching Supabase Auth site/redirect URLs for the deployed domain.

### Feature check

1. Open the deployed home page. Home, Games (the game section), and How to play are Angular navigation links/sections and should navigate without a full-page application error.
2. With Supabase configured and both SQL scripts applied, create a player under `/admin` → **Player access**, then sign in from **Chat with us** using that username/PIN. Send a message or a load/cash-out request, then verify it appears in the admin inbox.
3. Sign in as the promoted owner/admin in another browser session and open `/admin`. Select the player conversation, reply, and confirm the player sees the reply in realtime.
4. In a second player session, sign in with the username/PIN provisioned by the admin; verify private chat, a heartbeat in `profiles.last_seen`, and an updated active-user count in the Super Admin dashboard. Confirm bad PIN attempts appear in **Audit stream**.
5. Populate a game's `download_url` and optionally `logo_url`, then refresh the game list to verify its compact tile and external link.
6. As an admin, open a player's pending request, approve or deny it, then mark an approved load as loaded or an approved cash-out as sent. The status update and confirmation message are committed together by a database function.
7. From either side of a conversation, attach a supported image (JPEG, PNG, WebP, or GIF, up to 5 MB) and check that the other participant can view it. Images and payment QR codes use private Storage buckets and row-level access policies.
8. While chatting, confirm typing indicators, keyword/amount/request-type search, pinned announcements, offline messaging feedback, and quick amount/game request options. Image attachments are previewed, center-cropped, and compressed to JPEG before upload.
9. Enroll a recovery code from a signed-in test account, sign out, and verify that the recovery page changes the login PIN. Confirm invalid attempts are rate limited; do not test recovery with your only owner account.

The home, gallery, and How to play navigation work after static deployment. **Authentication, live game data, chat, request actions, payment instructions, and uploads require Supabase configuration and the current SQL schema.** A successful Angular build alone does not connect the app to Supabase. The referral banner is promotional copy only; it does not track referrals or issue a bonus.

## Database and access notes

The SQL schema gives unauthenticated visitors read access to the game list. Player PIN sign-in validates a bcrypt hash and then calls Supabase Auth `signInWithPassword` using the deterministic `username@spinvault.local` identifier; this second step is what creates the GoTrue JWT required by existing RLS, Storage, and Realtime policies. PIN validation is throttled at five failed attempts in a rolling ten-minute window per normalized username. PINs have a 6-character minimum; use a high-entropy alphanumeric PIN and never reuse a personal password.

The migration explicitly withholds `pin_hash` and `last_ip` from client-readable profile columns. Super Admin telemetry is exposed through a role-checked RPC, and audit rows can only be read by admins. `last_ip` is included for future trusted server-side capture; the browser heartbeat does not accept a client-supplied IP as trustworthy. The SQL scripts and Edge Function have not been executed against your live project; apply them to a test Supabase project first, deploy the recovery function, then validate role policies, shadow-email sign-in, account reset, failed-login lockout, recovery-code throttling, Realtime, and storage with separate accounts. Configure backups, Auth security, and log retention before production.

## Run locally

```bash
npm install
npm start
```

Then open `http://localhost:4200`. Use the development environment values above. The legacy messaging feature at `/chat` continues to use the separate backend configured by `apiUrl` and `wsUrl`.

Do not store account passwords, access tokens, or service-role keys in this README, source control, or frontend environment files.

If a real password was ever committed to Git or shared outside a trusted channel, change it and review the repository history; removing it from the current README does not remove copies from prior commits.
