# AidPal — Community Good, Organized

A social networking app for civic and community good. Create groups, share photos, comment, and connect.

This is the **first thin-slice build**: email+password auth, profiles, public/private groups, photo uploads, comments, and likes.

---

## Prerequisites

- **Node.js LTS 20+** with npm  
  Download from <https://nodejs.org> and install. Then reopen your terminal and verify:
  ```powershell
  node --version; npm --version
  ```

## Setup

1. **Install dependencies**

   ```powershell
   cd c:\Projects\AidPal; npm install
   ```

2. **Create a free Supabase project**

   Go to <https://supabase.com> and create a new project (free tier). Copy:
   - **Project URL** (e.g. `https://abcdef.supabase.co`)
   - **anon / public** API key

3. **Configure Supabase Auth**

   In the Supabase dashboard, go to **Authentication → URL Configuration**:
   - **Site URL:** `http://localhost:3000`
   - **Redirect URLs:** add `http://localhost:3000/**`

   Then go to **Authentication → Email Templates → Confirm signup** and set the confirmation link to:
   ```
   {{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email
   ```
   The default `?code=` link will **not** work with this app (it does not use the PKCE flow).

4. **Run the database schema**

   Open the **Supabase SQL Editor** (runs as `postgres`) and paste the entire contents of `supabase/schema.sql`. Click **Run**. The file is idempotent — safe to re-run.

5. **Set environment variables**

   ```powershell
   Copy-Item .env.example .env.local
   ```
   Edit `.env.local` and replace the placeholder values with your real Supabase URL and anon key.

6. **Run the dev server** (do this yourself)

   ```powershell
   npm run dev
   ```
   Open <http://localhost:3000> in your browser.

7. **Optional: run unit tests**

   ```powershell
   npm test
   ```

## Deploying

Deploy to Vercel or Cloudflare Pages. Set the two environment variables (`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`) in the host dashboard.

## Tech Stack

- **Next.js 16** (App Router, TypeScript, React 19)
- **Tailwind CSS v4**
- **Supabase** (Postgres + Auth + Storage)
- **Vitest** (unit tests)
