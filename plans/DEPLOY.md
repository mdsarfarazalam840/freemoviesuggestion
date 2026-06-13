# Complete Deployment Guide: Cloudflare Pages (Frontend) + Cloudflare Worker (Sync/API)

This guide provides a step-by-step process to deploy your application. You are splitting the deployment:
1. **Frontend:** Deployed to **Cloudflare Pages** (Astro).
2. **Backend/Sync:** Deployed as a **Cloudflare Worker** (includes Cron trigger).

---

## 1. Prerequisites
- [Cloudflare Account](https://dash.cloudflare.com/)
- [Supabase Project](https://supabase.com/) (DB)
- [Upstash Redis](https://console.upstash.com/) (Cache & Sync Progress)
- [TMDB API Key](https://developer.themoviedb.org/)
- [Wrangler CLI Installed](https://developers.cloudflare.com/workers/wrangler/get-started/) (`npm install -g wrangler`)

---

## 2. Environment Variables Setup
You must add these variables in two places:

### A. For Cloudflare Pages (Frontend)
In your Cloudflare Pages project dashboard:
- Go to **Settings > Environment variables > Production**.
- Add the same variables as below for your frontend to interact with APIs:
  - `PUBLIC_SUPABASE_URL`
  - `PUBLIC_SUPABASE_KEY`
  - (Any other public keys)

### B. For Cloudflare Worker (Backend/Sync)
In your Cloudflare Worker dashboard:
- Go to **Settings > Variables and Secrets > Add Variable**.
- Add:
  - `SUPABASE_URL`
  - `SUPABASE_KEY`
  - `UPSTASH_REDIS_REST_URL`
  - `UPSTASH_REDIS_REST_TOKEN`
  - `TMDB_API_KEY`

---

## 3. Deploying the Backend (Worker)
The `wrangler.toml` in your root defines the worker configuration.

1.  **Authenticate Wrangler:**
    ```bash
    npx wrangler login
    ```
2.  **Deploy the Worker:**
    ```bash
    npx wrangler deploy
    ```
    *This uploads `src/index.ts` to Cloudflare and sets up the Cron trigger defined in `wrangler.toml`.*

---

## 4. Deploying the Frontend (Pages)

The recommended way is connecting your GitHub repo to Cloudflare Pages for automatic deployments.

1.  **Cloudflare Dashboard:** Go to **Workers & Pages > Create application > Pages > Connect to Git**.
2.  **Select Repository:** Choose your project repository.
3.  **Build Settings:**
    - **Framework preset:** `Astro`
    - **Build command:** `npm run build`
    - **Build output directory:** `dist`
4.  **Add Variables:** Paste your environment variables (from Step 2A) in the **Environment variables** section during configuration.
5.  **Save and Deploy:** Click **Save and Deploy**. Cloudflare will build and host your site automatically on every push to the default branch.

---

## 5. Verification
1.  **Worker/Sync Check:** 
    - In Cloudflare Dashboard, select your Worker.
    - Go to **Triggers** tab to ensure the Cron trigger `0 0 * * *` is listed and active.
    - Check **Logs** to see if the sync runs successfully (you can manually trigger it for testing if supported by your Wrangler setup).
2.  **Frontend Check:** Visit your generated `*.pages.dev` URL to ensure the frontend is active.
