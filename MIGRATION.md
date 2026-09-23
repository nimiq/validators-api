# Pages to Workers Migration Guide

## Background

Cloudflare Pages does not support scheduled tasks. This project requires six-hour syncing, so it uses Cloudflare Workers.

## Setting Up Redirects

To maintain backwards compatibility, configure the old Pages deployments to redirect to Workers.

### For Mainnet Pages Project

Create `_redirects` file in the Pages project root:

```
/api/*  https://validators-api-main.je-cf9.workers.dev/api/:splat  301
/*      https://validators-api-main.je-cf9.workers.dev/:splat       301
```

Deploy this file to `validators-api-mainnet` Pages project.

### For Testnet Pages Project

Create `_redirects` file in the Pages project root:

```
/api/*  https://validators-api-test.je-cf9.workers.dev/api/:splat  301
/*      https://validators-api-test.je-cf9.workers.dev/:splat       301
```

Deploy this file to `validators-api-testnet` Pages project.

### Alternative: Dashboard Configuration

Go to Cloudflare Dashboard → Pages → [Project] → Rules → Redirects:

**Mainnet:**

- Source: `/*` → Destination: `https://validators-api-main.je-cf9.workers.dev/$1` (301)

**Testnet:**

- Source: `/*` → Destination: `https://validators-api-test.je-cf9.workers.dev/$1` (301)

## Verification

Test redirects work:

```bash
curl -I https://validators-api-mainnet.pages.dev/api/v1/status
# Should return 301 redirect to validators-api-main.je-cf9.workers.dev

curl -I https://validators-api-testnet.pages.dev/api/v1/status
# Should return 301 redirect to validators-api-test.je-cf9.workers.dev
```

## Timeline

1. Verify Workers fully operational
2. Deploy redirects to Pages projects
3. Monitor for 1-2 weeks
4. (Optional) Deprecate legacy `.pages.dev` URLs and add a custom domain

## Activity integrity and score v2 rollout

This implementation does not perform any remote migration or deployment. Run each remote command manually, testnet first, after reviewing its target.

### Safeguards

1. Authenticate Wrangler and confirm the expected account:

   ```bash
   pnpm exec wrangler login
   pnpm exec wrangler whoami
   ```

2. Inspect applied migrations and relevant table/index definitions. Never assume a migration is already applied:

   ```bash
   pnpm exec wrangler d1 execute validators-api-testnet --remote --env testnet --command "SELECT id, name, applied_at FROM _hub_migrations ORDER BY id;"
   pnpm exec wrangler d1 execute validators-api-testnet --remote --env testnet --command "SELECT name, type, sql FROM sqlite_schema WHERE name IN ('_hub_migrations', 'activities', 'activity_epochs', 'scores', 'validators') OR name LIKE 'idx_%' ORDER BY type, name;"
   ```

3. Export a backup outside this repository:

   ```bash
   pnpm exec wrangler d1 export validators-api-testnet --remote --env testnet --output ../validators-api-testnet-before-score-v2.sql
   ```

4. Put migration-only D1 HTTP credentials in `.env.testnet`:

   ```dotenv
   NUXT_HUB_CLOUDFLARE_ACCOUNT_ID=...
   NUXT_HUB_CLOUDFLARE_DATABASE_ID=...
   NUXT_HUB_CLOUDFLARE_API_TOKEN=...
   ```

   Keep these values out of deployed runtime variables. Migration scripts enable the HTTP driver only for their own command and fail if any credential is missing.

Repeat inspection and backup with `validators-api-mainnet` and without `--env testnet` only after testnet validation passes.

### Testnet-first sequence

1. Keep testnet `NUXT_SCORE_V2_MODE=off`.
2. Apply all pending tracked migrations:

   ```bash
   pnpm db:migrate:testnet
   ```

   This uses NuxtHub's basename-compatible `_hub_migrations` ledger. Do not substitute `wrangler d1 migrations apply`; Wrangler records full filenames and can replay an existing NuxtHub baseline.

3. Inspect `_hub_migrations` and relevant schemas again.
4. Build and deploy testnet while v2 remains off:

   ```bash
   CLOUDFLARE_ENV=testnet pnpm build
   pnpm exec wrangler --cwd .output deploy
   ```

   NuxtHub selects the testnet bindings during the build. Rebuild after each `NUXT_SCORE_V2_MODE` change; deploy the matching `.output` without `--env`.

5. Let the six-hour job discover epochs, repair recent activity, store the snapshot, then calculate v1 scores.
6. Set `NUXT_SCORE_V2_MODE=shadow`, deploy, and validate v1/v2 rows, activity coverage, score versions, and `current`, `stale`, or `no_score` API states.
7. Set `NUXT_SCORE_V2_MODE=active` only after shadow results pass.
8. Repeat the same inspect, backup, migrate, off, repair, shadow, validate, and active sequence for mainnet. Build mainnet with `pnpm build` and deploy with `pnpm exec wrangler --cwd .output deploy` after each mode change.

Activity marker interpretation during validation:

- `syncing`: repair attempt is inside its six-hour lease.
- `complete`: stored `finalized` marker has an exact elected set and matching counts.
- `incomplete`: expected activity has no valid finalized marker.
- `failed`: attempt rolled back and recorded an error for retry.

API list, detail, and status endpoints accept `score-version=1|2`. Omitted version follows rollout mode: `off` and `shadow` select v1; `active` selects v2. Selected-version rows are filtered before latest-score selection. `current` means latest completed epoch is covered, `stale` preserves an older valid score, and `no_score` returns null score values.

### Rollback

Set `NUXT_SCORE_V2_MODE=off`, deploy the configuration change, and request `score-version=1` explicitly while caches settle. Keep both v1 and v2 rows intact. Do not roll back schema or score data destructively.
