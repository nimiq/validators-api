# Pages to Workers Migration Guide

## Background

Cloudflare Pages does NOT support scheduled tasks (cron jobs). This project requires hourly syncing, so we migrated to Cloudflare Workers.

## Setting Up Redirects

To maintain backwards compatibility, configure the old Pages deployments to redirect to Workers.

### For Mainnet Pages Project

Create `_redirects` file in the Pages project root:

```
/api/*  https://validators-api-main.workers.dev/api/:splat  301
/*      https://validators-api-main.workers.dev/:splat       301
```

Deploy this file to `validators-api-mainnet` Pages project.

### For Testnet Pages Project

Create `_redirects` file in the Pages project root:

```
/api/*  https://validators-api-test.workers.dev/api/:splat  301
/*      https://validators-api-test.workers.dev/:splat       301
```

Deploy this file to `validators-api-testnet` Pages project.

### Alternative: Dashboard Configuration

Go to Cloudflare Dashboard → Pages → [Project] → Rules → Redirects:

**Mainnet:**

- Source: `/*` → Destination: `https://validators-api-main.workers.dev/$1` (301)

**Testnet:**

- Source: `/*` → Destination: `https://validators-api-test.workers.dev/$1` (301)

## Verification

Test redirects work:

```bash
curl -I https://validators-api-mainnet.pages.dev/api/v1/status
# Should return 301 redirect to validators-api-main.workers.dev

curl -I https://validators-api-testnet.pages.dev/api/v1/status
# Should return 301 redirect to validators-api-test.workers.dev
```

## Timeline

1. Verify Workers fully operational
2. Deploy redirects to Pages projects
3. Monitor for 1-2 weeks
4. (Optional) Deprecate .pages.dev URLs and add custom domain
