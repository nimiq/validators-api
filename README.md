<p align="center">
  <a href="https://github.com/nimiq/validators-api" target="_blank">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/nimiq/validators-API/HEAD/.github/logo-dark.svg">
      <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/nimiq/validators-API/HEAD/.github/logo-light.svg">
      <img alt="Nimiq Validators API" src="https://raw.githubusercontent.com/nimiq/validators-API/HEAD/.github/logo-light.svg" width="350" height="70" style="max-width: 100%;">
    </picture>
  </a>
</p>

<p align="center">
  An API for integrating validators and pools with the Nimiq Wallet and other apps, helping stakers choose where to stake.
</p>

<p align="center">
<a href="https://github.com/nimiq/validators-api/actions/workflows/ci.yml" target="_blank"><img src="https://github.com/nimiq/validators-api/actions/workflows/ci.yml/badge.svg" /></a>
</p>

<h2 align="center">Dashboards</h2>

<p align="center">
<a href="https://validators-api-main.je-cf9.workers.dev" target="_blank">Mainnet</a>&nbsp; &nbsp; &nbsp;
<a href="https://validators-api-test.je-cf9.workers.dev" target="_blank">Testnet</a>
</p>

<br />

<br />

**Validators and Staking Pools**:
A validator can operate as a staking pool, allowing multiple users to stake. Pools must provide detailed information such as fees, payout schedules, and contact details to ensure trust and transparency.

Stakers can evaluate a validator’s reliability using the Validator Trust Score (VTS) and review staking pool details like payout schedules to select the best option.

## Add your Validator Information

If you operate a staking pool and want to be displayed in the Nimiq Wallet, follow these steps:

1. [Fork this repository](https://github.com/nimiq/validators-api/fork).
2. Add your Validator File:
   - Create a new JSON file in the `public/validators/main-albatross` directory.
   - Use the provided example template in the directory to structure your data.
3. Review the [Description Guidelines](#recommendations-for-your-validator-description).
4. Learn about the [JSON Schema](#validator-json-schema).
5. Submit a PR to this repository. A Nimiq team member will review your submission within 3 days.
6. Once the PR is submitted, check that the [API endpoint](https://validators-api-main.je-cf9.workers.dev/api/v1/validators) returns your information. This process may take a few minutes.

> [!WARNING]
> Nimiq reserves the right to make minor adjustments to the content submitted by validator owners if necessary.

### Recommendations for your Validator Description

#### Description

This information will be displayed in the wallet to help stakers decide which pool they want to stake in. Providing clear and concise information helps stakers make informed decisions. For complete guidelines and suggestions, check our [Staking Pools Handbook](https://forum.nimiq.community/t/staking-pools-handbook/2169).

- **Length**: Aim for 1-2 sentences (20-40 words).
- **Clarity**: Highlight unique aspects of your pool, such as reliability, transparency or low fees.
- **Strengths**: Mention features like high uptime, low fees, strong community support or eco-friendly practices.
- **Tone**: Keep a friendly and professional tone.

**Good Example**: "Our pool offers 99.9% uptime, low fees, and strong security, ensuring a seamless staking experience. Join us for a reliable, transparent, and staker-focused service."
**Bad Example**: "Stake with us for unmatched rewards and the highest profits! Don’t miss your chance to earn big — this is the ultimate opportunity for stakers!"

### Validator JSON schema

Use the following schema to create your validator information file. You can start by copying this [example JSON template](./public/validators/.example.json). When you add your validator information, you'll need to include specific keys in your JSON file. Below is an explanation of each key and its possible values.

**Required Keys**:

- `name`: The name of your validator. If you don’t provide a name, your validator address will be used by default.
- `description`: A short description of your validator. Use this to highlight what makes your validator unique or appealing to stakers.
- `address`: The address of the validator in this format `NQXX XXXX XXXX XXXX XXXX XXXX XXXX XXXX XXXX`.
- `fee`: Use either static or dynamic fees:
  - For static fees, use `fee` with a percentage between 0 and 1 (0.05 represents a 5% fee).
  - For dynamic fees, use the following 3 values:
    - `feeLowest`: The minimum possible fee.
    - `feeHighest`: The maximum possible fee.
    - `feeDescription`: Outline the conditions for various fees.
- `payoutType`: The method used to payout the rewards. Possible values are:
  - `restake`: Rewards are automatically restaked.
  - `direct`: Rewards are paid directly into the staker's wallet and are not automatically restaked. Requires:
    - `payoutAddress`: Provide address you will payout from.
    - `payoutSchedule`: Specify the frequency of payouts using the [cron job format](https://crontab.guru/). Example: `0 */6 * * *` for payouts every 6 hours.
  - `none`: No rewards will be paid out.
- `website`: The URL of your validator's website or any similar source of information (Telegram pinned message, Discord...)
- `logo`: A logo in SVG or PNG format (min size: 224x224px) with a transparent background, encoded in Base64 to represent your validator. Background colors should be avoided unless they ensure clear contrast.
- `contact`: At least one contact allowing validators to share contact details so users can easily get in touch.
  - `email`
  - `telegram` (optional). e.g. `@nimiq`
  - `twitter` (optional). e.g. `@nimiq`
  - `discordInvitationUrl` (optional). A URL to your Discord invitation.
  - `bluesky` (optional). e.g. `@nimiq`
  - `github` (optional). e.g. `nimiq`
  - `linkedin` (optional). e.g. `nimiq`
  - `facebook` (optional). e.g. `nimiq`
  - `instagram` (optional). e.g. `@nimiq`
  - `youtube` (optional). e.g. `nimiq`

## Validator Trustscore

The VTS is a metric designed to help stakers evaluate the performance and reliability of validators. The VTS provides a transparent way to assess validator behavior, empowering stakers to make informed decisions when choosing where to stake their funds.

The VTS is displayed in the Nimiq Wallet, allowing stakers to compare validators and select the one that best meets their needs.

- [Read the docs](./packages/nimiq-validator-trustscore/)
- Checkout the [pnpm package](./packages/nimiq-validator-trustscore/)

## Validators API

The Validators API provides endpoints to retrieve validator information for integration with tools, dashboards, and other applications.
| Endpoint | Description |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| [/api/v1/validators](https://validators-api-main.je-cf9.workers.dev/api/v1/validators) | Retrieves the validator list. See [query params](./server/utils/schemas.ts#L54) |
| [/api/v1/validators/:validator_address](https://validators-api-main.je-cf9.workers.dev/api/v1/validators/NQ98%20D3KE%208EQ8%20Y7DK%20G1MT%203P5T%202PHX%2018V5%20UEC1) | Retrieves the validator information |
| [/api/v1/status](https://validators-api-main.je-cf9.workers.dev/api/v1/status) | Retrieves activity coverage and selected score status |
| [/api/v1/supply](https://validators-api-main.je-cf9.workers.dev/api/v1/supply) | Retrieves supply status |

Validator list, detail, and status endpoints accept `score-version=1|2`. Without it, `NUXT_SCORE_V2_MODE=off` and `shadow` select v1, while `active` selects v2. Queries filter by the selected version before choosing the latest score, so responses never mix v1 and v2 history.

For score v2, finalized gaps after a validator has been elected estimate the chance of receiving zero of the 512 validator slots from the nearest surrounding stake observations. A complete gap is marked `inferred_offline`, shown in v2 validator activity, and penalized by v2 only when estimated stake is at least 1% and random-election probability is below 0.1%. Lower-stake and lower-confidence gaps remain `not_elected_randomness` and do not reduce availability. Score v1 behavior remains unchanged.

Every score includes its version and data state:

- `current`: selected-version score covers the latest completed epoch.
- `stale`: an older valid score remains available while current activity or scoring is incomplete.
- `no_score`: no selected-version score exists; numeric fields remain `null`, not zero.

## Validators Dashboard

The Validators Dashboard is a simple Nuxt application that displays all validators along with their scores. You can access the dashboard here: https://validators-api-main.je-cf9.workers.dev/

> [!TIP]
> Check also the [deployment](#deployment) section to learn how to access the `testnet` environment.

## How the API works

The API has different endpoints to retrieve information about validators and staking metrics. In the following sections we will focus on how the validators scores are calculated and how the data is stored.

### Range

We fetch the data from the last ~9 months to calculate the score. In order to do this, we have a function to calculate the window of epochs to fetch.

- `fromXXX`: The information for the first block/epoch we consider (~9 months). We have: `fromEpoch`, `fromBlockNumber`, `fromTimestamp`
- `toXXX`: The information for the last block/epoch we consider. We have: `toEpoch`, `toBlockNumber`, `toTimestamp`
- `snapshotXXX`: The information for current epoch. (It is not called `currentEpoch` as this could be missleading when talking about a range that is in the past). We have: `snapshotEpoch`, `snapshotBlockNumber`, `snapshotTimestamp`. If you have a better name, please suggest it.

We also do have an UI component to visualize the range, check the status, and debug.

### Fetcher

The fetcher retrieves data from the Nimiq network and stores it in D1. It runs every six hours in this order:

1. Discover completed epochs and verify or repair activity snapshots.
2. Store the current validator snapshot.
3. Calculate scores from finalized activity markers.

Completed-epoch activity uses marker-backed integrity checks. Operator-facing marker states are:

- `syncing`: repair attempt owns a fresh six-hour lease.
- `complete`: stored `finalized` marker has matching election-set hash and elected counts.
- `incomplete`: expected epoch has no finalized marker or exact stored set.
- `failed`: attempt rolled back and retained its error for retry.

#### Ended epochs

It fetches the data from epochs already ended and stores it in the database the following variables:

- `epoch`: The epoch number.
- `validatorAddress`: The address of the validator.
- `missed`: The number of batches where at least a slot was missed.
- `rewarded`: The number of batches rewarded.
- `likelihood`: The probability of being selected to produce a block, calculated by `numSlots / SLOTS`.
- `dominanceViaSlots`: Same as `likelihood`
- `dominanceViaBalance`: The dominance ratio of the validator, calculated by `validatorBalance / totalBalance`. Might be -1 if the `balance` was not fetched when the epoch was active.

#### Current epoch

It fetches the data from the current active epoch and stores it in the database the following variables:

- `epoch`: The epoch number.
- `validatorAddress`: The address of the validator.
- `balance`: The balance of the validator.
- `stakers`: The amount of stakers in the validator.

It will also set empty values for `missed`, `rewarded`, `likelihood`, and `dominanceViaBalance` for the current epoch. This is because the epoch is still active and the data is not available yet. Those fields will be updated once the epoch ends and only if the validator was selected to produce a block, otherwise they will remain untouched.

#### Types of validators

| Type                          | Elected | Tracked |
| ----------------------------- | ------- | ------- |
| `ElectedTrackedValidator`     | ✅      | ✅      |
| `ElectedUntrackedValidator`   | ✅      | ❌      |
| `UnelectedTrackedValidator`   | ❌      | ✅      |
| `UnelectedUntrackedValidator` | ❌      | ❌      |

> [!NOTE]
> Having a `UnelectedUntrackedValidator` should only happen when the validator has been selected for the first time in history.

## Development

Once it is cloned and installed the dependencies, you must run:

```bash
pnpm db:generate
pnpm dev # or pnpm dev:local to use the local database
```

## Slack Notifications

The API supports Slack notifications for important events. To enable notifications, set the `NUXT_SLACK_WEBHOOK_URL` environment variable:

```bash
NUXT_SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK
```

**Notification Types:**

- **Sync Failures** (Production only): Notifies when sync operations fail, with `@maxi` tagged and full context
- **New Epochs** (Mainnet only): Notifies when a new epoch is successfully synced

The system automatically detects the environment and only sends notifications in production, unless `NUXT_SLACK_WEBHOOK_URL_FORCE_DEV=true` is set for testing in development.

## Deployment

Deployed via Wrangler CLI with `wrangler.json` config:

```bash
pnpm build && npx wrangler --cwd .output deploy [-e env]
```

Where `env`: `testnet` (omit `-e env` for mainnet production).

**Required secrets:** `ALBATROSS_RPC_NODE_URL`, `NUXT_SLACK_WEBHOOK_URL`

### D1 Migrations

Never assume remote migration state. Authenticate Wrangler, inspect `_hub_migrations` and relevant schemas, and export a backup outside the repository before applying migrations. Set the migration-only `NUXT_HUB_CLOUDFLARE_ACCOUNT_ID`, `NUXT_HUB_CLOUDFLARE_DATABASE_ID`, and `NUXT_HUB_CLOUDFLARE_API_TOKEN` values in the target `.env` file.

Generic migration commands use NuxtHub's `_hub_migrations` basenames and apply all pending files under `server/db/migrations/`:

```bash
pnpm db:migrate:testnet
pnpm db:migrate:mainnet
```

Always migrate and validate testnet first. See [MIGRATION.md](./MIGRATION.md) for inspection, backup, rollout, and rollback steps.

This implementation does not run any remote migration or deployment.

**Environments** (configured in `wrangler.json`):

- `production`: [Validators API Mainnet](https://validators-api-main.je-cf9.workers.dev) via manual `wrangler deploy`
- `testnet`: [Validators API Testnet](https://validators-api-test.je-cf9.workers.dev) via manual `wrangler deploy --env testnet`

Each environment has its own D1 database, KV cache, and R2 blob. Sync runs every six hours via Cloudflare cron triggers (see `server/tasks/sync/`).

### Score v2 rollout

Set `NUXT_SCORE_V2_MODE` per environment:

- `off`: write and serve v1 only.
- `shadow`: keep v1 writes, also write v2, and serve v1 by default.
- `active`: keep v1 and v2 writes, and serve v2 by default.

Rollback requires no destructive schema or data change: set `NUXT_SCORE_V2_MODE=off`, keep all v1/v2 rows intact, and request `score-version=1` explicitly while the configuration change propagates.

### Deployment Migration

Migrated from Cloudflare Pages to Workers for cron job support. Pages URLs remain legacy redirects only and are not active deployment targets.

**Old URLs (redirect to Workers):**

- `validators-api-mainnet.pages.dev` → `validators-api-main.je-cf9.workers.dev`
- `validators-api-testnet.pages.dev` → `validators-api-test.je-cf9.workers.dev`

Setup redirects per [MIGRATION.md](./MIGRATION.md).

**Write operations to `main` are restricted**, only via PR.
