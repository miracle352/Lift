# Your checklist (things Codex can't do for you)

## Today (Thu Oct 22), about 1 hour
1. **Repo:** unzip, then in PowerShell: `cd receipts; git init; git add .; git commit -m "Receipts scaffold"`. Create a GitHub repo
   (private for now, **public before you submit**) and push.
2. **Sui wallet:** install Slush (or any Sui wallet) and create a fresh wallet just for this project. Its address is the
   *SUI address* on the submission form and becomes `MEMWAL_OWNER_ADDRESS`.
3. **Walrus Memory:** https://memory.walrus.xyz/dashboard → sign in with that wallet → create the account →
   *Delegate keys* → create a key labelled `receipts-server`. Copy:
   - the private key → `MEMWAL_PRIVATE_KEY` (server only, never share)
   - the account object id → `MEMWAL_ACCOUNT_ID`
   - the public key → **MEMWAL_AGENT_ID** for the form (`pnpm smoke:memwal` also prints it)
4. **Tatum:** https://dashboard.tatum.io → sign up → copy the **mainnet** API key → `TATUM_API_KEY`. Note your dashboard
   account id: the form asks for "Tatum ID".
5. **Env:** `copy .env.example .env.local` and fill it in. For `SESSION_SECRET` (40 chars) and `CRON_SECRET`, run in PowerShell:
   `-join ((48..57)+(97..122) | Get-Random -Count 40 | % {[char]$_})`. Put your handle in `ADMIN_HANDLES`.
6. **Smoke tests:** `pnpm install`, then `pnpm smoke:sui`, `pnpm smoke:tatum`, `pnpm smoke:memwal`, `pnpm smoke:memwal -- --write`.
   All four must succeed before you start Codex on M1. Paste any failure to Codex (or me).
7. **Discords:** join Tatum (https://discord.gg/hR6NG7sNXE) and Walrus (https://discord.gg/walrusprotocol). Ask Tatum whether
   hackathon participants can get extra credits (the Prediction API costs 100–200 credits per call; the free plan has 100k a month).
8. Start Codex with **Prompt 0**, then **Prompt M1** (docs/CODEX_PROMPTS.md).

## Friday Oct 23 (M2 day): get it live before Saturday
9. **Turso:** create a database + token (https://turso.tech). `DATABASE_URL=libsql://…`, `DATABASE_AUTH_TOKEN=…`.
   Run migrations against it from your machine (Codex will give exact commands).
10. **Vercel:** import the GitHub repo, set every env var from `.env.local` (except `DATABASE_URL`/token → the Turso ones; `APP_URL` → your Vercel URL), deploy.
11. **GitHub Actions:** repo Settings → Secrets and variables → Actions: variable `APP_URL`, secret `CRON_SECRET`. Run the `tick` workflow once by hand.
12. **First real seal:** on your phone, lock a forecast on the deployed app and open its receipt. Wait for green checks and a Suiscan link.

## Weekends (Oct 24–25, Oct 31–Nov 1, Nov 7–8): data days
13. Curate the weekend's matches on Friday (one market per match, mixed leagues).
14. Get **5–10 people** (any country) to sign up and do 5+ forecasts each. Use fair-test mode. Paste pundit takes *before* kickoff.
15. Create one or two "tipster" accounts (you, a friend) that publish takes, so the advisor list has real people.
16. Check `/api/health` and the tick workflow runs; screenshot `/me` each Monday (the day-1 vs now story).

## M7 (Nov 4–5): payments
17. Fund a separate **agent wallet** with a little SUI (gas) and ~5 USDC on **Sui mainnet** (withdraw USDC on the Sui network from an exchange that supports it, or swap in your wallet).
    Put its key in `AGENT_WALLET_PRIVATE_KEY`. Set a tipster account's payout address. Run one real paid unlock and keep the digest for the video.

## Submission (Nov 8–9)
18. Run `pnpm report`. Write the blog post (docs/HACKATHON.md outline) on Medium, Dev.to, Hashnode or similar.
19. Record the 2–3 minute demo (script in docs/HACKATHON.md). Upload (YouTube unlisted or Loom).
20. Post on X and LinkedIn tagging **@Tatum_io** and **@WalrusFoundation** (the Walrus X account linked from the event page is @WalrusProtocol: tag both).
21. Make the GitHub repo public. Submit at https://recall-tatum-walrus.vercel.app ("Submit Project") with: email, Discord, LinkedIn,
    how you heard, first Web3 project?, Tatum ID, SUI address, Account ID (SUI) (most likely your `MEMWAL_ACCOUNT_ID`; confirm in Discord), MEMWAL_AGENT_ID,
    description, video, repo, your Walrus experience, your Tatum AI Builder experience (we didn't use it; say so).
22. Deadline **Tue Nov 10 17:00 UTC (18:00 in Lagos)**. Aim for Mon Nov 9.
