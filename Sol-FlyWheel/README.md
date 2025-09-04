# Solana Flywheel — Vercel Hobby (fixed)

Includes proper `vercel.json` (`version: 2`, `nodejs20.x`) and `package.json` so Vercel installs deps.

## Env Vars (Vercel → Project → Settings → Environment Variables)
- RPC_URL=https://api.mainnet-beta.solana.com
- SECRET_KEY_B58=<your Phantom base58 key>
- TOKEN_MINT=B5NqK2GQWtzNfo3EzWeSxg6XUnXqRSU7xLH5PtC7
- SOL_BUFFER=0.02
- SLIPPAGE_BPS=100
- CRON_KEY=<long random string>

## Scheduling
Use cron-job.org or GitHub Actions to hit:
`https://<your-app>.vercel.app/api/flywheel?key=<CRON_KEY>` every 20 minutes.
