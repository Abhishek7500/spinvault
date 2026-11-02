# SmartReceipt

SmartReceipt is a mobile-first receipt, return and warranty tracker. Scan a receipt photo to extract its text and structured purchase data, keep retailer return dates close at hand, review spending trends, and prepare a return or dispute evidence pass.

The app is an Angular progressive web app backed by Supabase Auth, Postgres, private Storage and Edge Functions. It keeps four focused views in a persistent mobile tab bar: **Tracker**, **Insights**, **Warranties** and **Profile**.

## Run locally

```sh
npm install
npm start
```

The app uses the Supabase project configured in `src/environments/environment.ts` and `src/environments/environment.prod.ts`. Replace those public URL/key values with the project you intend to use before deploying. Only a public anon/publishable key belongs in frontend configuration.

Without a signed-in user, the Tracker shows clearly marked sample receipts. Sign in from **Profile** using the emailed magic link to access private data and enable scanning.

## Supabase setup

> **Destructive migration:** `supabase/migrations/20261102000000_smartreceipt.sql` removes the former SpinVault chat, game, payment-method, announcement and audit/throttle tables. Export any data you need before applying it. It keeps Supabase Auth users and their profile IDs, then backfills email and creates unique SmartReceipt aliases.

1. Apply the migration in the Supabase SQL Editor or with the Supabase CLI. It creates `profiles`, `receipts`, `receipt_items` and `price_alerts`, enables owner-only RLS, creates a private `receipt-images` bucket, and adds an Auth profile trigger.
2. Set Auth **Site URL** and allowed redirect URLs for local development and the deployed site. The profile screen uses Supabase email magic links.
3. Configure the Gemini key as an Edge Function secret; never add it to the frontend:

   ```sh
   supabase secrets set GEMINI_API_KEY=your-gemini-api-key
   ```

4. Deploy the processing functions:

   ```sh
   supabase functions deploy scan-receipt
   supabase functions deploy inbound-email
   ```

   Remove the old deployed `spinvault-auth` and `recover-spinvault-pin` functions from the Supabase project after confirming nothing still depends on them.

   `scan-receipt` requires an authenticated Supabase session. It sends the image to Gemini Flash-Lite for OCR and JSON structuring; the function validates the returned fields before the client saves the image to private Storage and the receipt under RLS. Explicit warranty expiration dates are kept only when printed on the receipt.

   **Privacy note:** receipt images, forwarded email text and invoice attachments are sent to Google's Gemini API for extraction. Google AI Studio's free tier may use submitted content to improve its products; review the provider's current data terms before processing real purchase records. Use a plan and data-processing terms appropriate for your privacy requirements.

5. Configure the inbound webhook secret on the Supabase project:

   ```sh
   supabase secrets set INBOUND_EMAIL_WEBHOOK_SECRET=a-long-random-secret
   ```

   The `POST /api/inbound-email` serverless handler forwards an authenticated request to the Supabase Edge Function. Configure `SUPABASE_URL` and `INBOUND_EMAIL_WEBHOOK_SECRET` in the hosting provider (for Vercel, add `SUPABASE_URL` to the project environment variables). The webhook accepts JSON with `to`, `text` or `html`, and optional base64 image/PDF `attachments`; the matching `username-xxxxxxxx@yourreceipt.app` alias is looked up and the resulting receipt and items are inserted using the server-side service role. Send the same secret in `x-inbound-email-secret`. Alternatively, call the Supabase function endpoint directly:

   ```text
   POST https://<project-ref>.supabase.co/functions/v1/inbound-email
   ```

   Never place `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY` or the webhook secret in browser code.

## Platform behavior

- **Receipt scanning:** camera/gallery image upload → server-side Gemini OCR and schema-constrained extraction → private Storage upload → owner-scoped receipt and item records. Image uploads are limited to 10 MB.
- **Return windows:** Target/Walmart 90 days, Apple 14 days, Best Buy 15 days, and other listed retailers use client-side rules. The receipt detail sheet provides a calendar-date override.
- **Insights:** category spending is compared against the corresponding previous week/month period. A warning appears for a new category or spending more than 10% above the comparison period.
- **Return Passport:** a locally generated QR code contains the receipt ID, transaction identifier, items and purchase totals. It is an informational pass, not a merchant-issued or cryptographically signed verification.
- **Dispute packager:** prepares a formal, editable mail draft and attempts to copy the evidence text to the clipboard. Review the content before sending.
- **Price watch:** `PriceDropTracker` uses deterministic mock prices to exercise the alert and potential-refund UI. It is not a live retailer scrape or price-match guarantee; replace the mock source before treating alerts as actionable. A foreground poll runs every six hours while the app is open.
- **PWA:** production builds register Angular's service worker and include a web manifest and iOS install metadata. On iOS, use Safari's **Share → Add to Home Screen**; on Android, use the browser's install option.

## Build

```sh
npm run build
```

The production output is written to `dist/smartreceipt`.
