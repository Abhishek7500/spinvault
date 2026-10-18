# SpinVault

SpinVault is a mobile-first Angular gaming distributor portal with a Supabase-backed game directory, player authentication, private real-time support chat, structured load/cash-out requests, and an admin inbox. The existing REST/WebSocket messaging application remains available at `/chat`; its `/login` and `/register` accounts are separate from SpinVault accounts.

## What works, and what needs setup

The home page, game cards, how-to-play guide, FAQ, responsive layout, and client-side navigation work without Supabase credentials. The supplied Juwa, GameVault, and Orion Stars cards are featured examples; no external download URLs or sample user accounts are bundled.

Supabase-dependent functions work only after you configure a project and apply the schema below:

- Load the games and their download links from the `games` table.
- Sign up and sign in to SpinVault.
- Use private player-to-admin chat, load/cash-out requests, and realtime updates.
- Sign in to the admin dashboard at `/admin`.

There are **no default admin or player usernames/passwords**. Create your own accounts using the steps below. The login form uses **email and password**; the username is the display name shown in the portal.

The gallery contains ten compact entries as starter records. Only entries with a valid `download_url` open a game link; the included starter titles do not imply that SpinVault distributes those games. Set verified links and icons before publishing the corresponding entries.

## Supabase setup

### 1. Create a Supabase project and database

Create a project in Supabase, open its SQL Editor, and run [`supabase/spinvault-schema.sql`](./supabase/spinvault-schema.sql). The script creates `profiles`, `games`, `chat_messages`, and `payment_methods`, creates a profile automatically for each new Supabase Auth user, enables row-level security, and enables Realtime for messages. It adds ten starter game titles without inventing download links.

If you already applied an earlier SpinVault schema, run the current SQL file again to add the request status, payment-method, attachment, Storage, and admin request-processing pieces. The setup is written to be re-runnable.

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

### 3. Configure Supabase Auth URLs

In Supabase Authentication settings, set the Site URL to your deployed site and add the local development URL and deployed URL to the allowed redirect URLs. If email confirmation is enabled, users must confirm their email before they can sign in. For a quick test, you can disable email confirmation in the Supabase Auth settings, but enable the appropriate confirmation/security settings for your production use.

### 4. Create the owner/admin login

There is no pre-created owner account or shared password. Create the owner account through the SpinVault site:

1. Run the app locally or deploy it after configuring Supabase.
2. Click **Log in** or **Chat with us**, then select **Create account**.
3. Create an account with an owner-controlled email, a username such as `spinvault-admin`, and a strong password you choose. The password is not stored in this repository.
4. Confirm the email first if confirmation is enabled.
5. In the Supabase SQL Editor, promote that account to admin. Replace the example address with the exact email used at signup:

   ```sql
   update public.profiles
   set role = 'admin'
   where id = (
     select id from auth.users where email = 'owner@your-domain.example'
   );
   ```

6. Sign in through the SpinVault modal with that **email and the password chosen at signup**, then open `/admin`. The account username is for display; it is not the login identifier.

Only a trusted project owner should run the promotion SQL. Signup always creates a `player`; the browser signup form does not accept a role.

### 5. Create player/test logins

There are no seeded demo accounts. Create each player account through **Create account** in the SpinVault login/chat modal, using an email you control, a username such as `demo-player`, and a password you choose. Confirm the email first if required, then sign in with that email and password. Repeat with a second email/account if you want to test multiple players.

For example, you can create:

| Purpose | Example username | Email for signup | Password |
|---|---|---|---|
| Owner/admin | `spinvault-admin` | An owner-controlled email | Choose and store a strong password |
| Test player | `demo-player` | A test email you control | Choose a separate password |

These are suggested account names, **not credentials that already exist**. Never use a real personal password in documentation or source control.

### 6. Configure payment instructions and QR codes

Sign in with the admin account and open `/admin` → **Payment methods**. Add a provider such as Cash App, Zelle, or Venmo, enter player-facing instructions, optionally select a QR image, and choose whether the option is visible to players. Existing options can be edited or hidden. QR codes are kept in a private Supabase Storage bucket and served to authorized users through signed URLs.

The app does not connect to payment processors and does not move money. Admin actions record the request status and send a chat confirmation; verify and complete any payment separately using the provider's official service.

### 7. Add game download links

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
2. With Supabase configured and the SQL applied, create a player and sign in from **Chat with us**. Send a message or a load/cash-out request, then verify it appears in the admin inbox.
3. Sign in as the promoted owner/admin in another browser session and open `/admin`. Select the player conversation, reply, and confirm the player sees the reply in realtime.
4. Populate a game's `download_url` and optionally `logo_url`, then refresh the game list to verify its compact tile and external link.
5. As an admin, open a player's pending request, approve or deny it, then mark an approved load as loaded or an approved cash-out as sent. The status update and confirmation message are committed together by a database function.
6. From either side of a conversation, attach a supported image (JPEG, PNG, WebP, or GIF, up to 5 MB) and check that the other participant can view it. Images and payment QR codes use private Storage buckets and row-level access policies.

The home, gallery, and How to play navigation work after static deployment. **Authentication, live game data, chat, request actions, payment instructions, and uploads require Supabase configuration and the current SQL schema.** A successful Angular build alone does not connect the app to Supabase. The referral banner is promotional copy only; it does not track referrals or issue a bonus.

## Database and access notes

The SQL schema gives unauthenticated visitors read access to the game list. Authenticated users can read player profiles, players can message admin profiles, and admins can reply to players and read the admin inbox. Request state changes are performed by an admin-checked database function. Chat and QR images use private buckets and storage policies. Profile role changes are not granted to normal users. Configure project-specific Auth, rate limits, backups, and operational policies before production use.

## Run locally

```bash
npm install
npm start
```

Then open `http://localhost:4200`. Use the development environment values above. The legacy messaging feature at `/chat` continues to use the separate backend configured by `apiUrl` and `wsUrl`.

Do not store account passwords, access tokens, or service-role keys in this README, source control, or frontend environment files.

If a real password was ever committed to Git or shared outside a trusted channel, change it and review the repository history; removing it from the current README does not remove copies from prior commits.
