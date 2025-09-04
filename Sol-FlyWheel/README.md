# Solana Flywheel — Vercel Hobby Edition

This version removes Vercel's cron (Hobby only supports daily). Use an **external scheduler** to hit `/api/flywheel` every 20 minutes.

## Deploy
1. Zip this folder and drag into Vercel “New Project” (or push to GitHub and import).
2. Add env vars in Vercel Project Settings → Environment Variables:
   - RPC_URL=https://api.mainnet-beta.solana.com
   - SECRET_KEY_B58=<your Phantom-exported base58 key>
   - TOKEN_MINT=B5NqK2GQWtzNfo3EzWeSxg6XUnXqRSU7xLH5PtC7
   - SOL_BUFFER=0.02
   - SLIPPAGE_BPS=100
   - CRON_KEY=<make up a long random string>
3. Deploy.

## Schedule with cron‑job.org (easy, free)
- Create a new job pointing to: `https://<your-app>.vercel.app/api/flywheel?key=<CRON_KEY>`
- Method: GET
- Interval: Every 20 minutes
- Optional: add header `X-CRON-KEY: <CRON_KEY>` instead of the query string.

## Schedule with GitHub Actions
Create `.github/workflows/flywheel-cron.yml` in any repo:

```yaml
name: Flywheel Cron
on:
  schedule:
    - cron: "*/20 * * * *"
  workflow_dispatch:
jobs:
  trigger:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Vercel endpoint
        run: curl -sSf "https://<your-app>.vercel.app/api/flywheel?key=${{ secrets.CRON_KEY }}"
```

- Add a **Repository Secret** named `CRON_KEY` with the same value you set in Vercel.

## Manual trigger
Visit `/api/flywheel?key=<CRON_KEY>` on your deployed domain to test instantly.
