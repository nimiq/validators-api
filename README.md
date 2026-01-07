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
<a href="https://validators-api-main.workers.dev" target="_blank">Mainnet</a>&nbsp; &nbsp; &nbsp;
<a href="https://validators-api-test.workers.dev" target="_blank">Testnet</a>
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
6. Once the PR is submitted, check that the [API endpoint](https://validators-api-main.workers.dev/api/v1/validators) returns your information. This process may take a few minutes.

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
  - `custom`: Custom payout scheme. Requires:
    - `payoutScheme`: A description of the custom payout method (e.g., "Pays 50% of rewards every 1st of the month").
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

- [Read the docs](https://nimiq.com/developers/validators/validator-trustscore)
- Checkout the [pnpm package](./packages/nimiq-validator-trustscore/)

## Validators API

The Validators API provides endpoints to retrieve validator information for integration with tools, dashboards, and other applications.
| Endpoint | Description |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| [/api/v1/validators](https://validators-api-main.workers.dev/api/v1/validators) | Retrieves the validator list. See [query params](./server/utils/schemas.ts#L54) |
| [/api/v1/validators/:validator_address](https://validators-api-main.workers.dev/api/v1/validators/NQ7700000000000000000000000000000001) | Retrieves the validator information |
| [/api/v1/supply](https://validators-api-main.workers.dev/api/v1/supply) | Retrieves supply status |

## Validators Dashboard

The Validators Dashboard is a simple Nuxt application that displays all validators along with their scores. You can access the dashboard here: https://validators-api-main.workers.dev/

> [!TIP]
> Check also the [deployment](#deployment) section to learn how to access to the `testnet` and `preview` environments.

## How the API works

The API has different endpoints to retrieve information about validators and staking metrics. In the following sections we will focus on how the validators scores are calculated and how the data is stored.

### Range

We fetch the data from the last ~9 months to calculate the score. In order to do this, we have a function to calculate the window of epochs to fetch.

- `fromXXX`: The information for the first block/epoch we consider (~9 months). We have: `fromEpoch`, `fromBlockNumber`, `fromTimestamp`
- `toXXX`: The information for the last block/epoch we consider. We have: `toEpoch`, `toBlockNumber`, `toTimestamp`
- `snapshotXXX`: The information for current epoch. (It is not called `currentEpoch` as this could be missleading when talking about a range that is in the past). We have: `snapshotEpoch`, `snapshotBlockNumber`, `snapshotTimestamp`. If you have a better name, please suggest it.

We also do have an UI component to visualize the range, check the status, and debug.

### Fetcher

The fetcher is a process that retrieves data from the Nimiq network and stores it in a D1 database. The fetcher runs every hour and collects data about the validators in two different ways:

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

Where `env`: `preview`, `testnet`, or `testnet-preview` (omit for mainnet production).

**Required secrets:** `ALBATROSS_RPC_NODE_URL`, `NUXT_SLACK_WEBHOOK_URL`

**Environments** (configured in `wrangler.json`):

| Environment       | Dashboard URL                                                             | Trigger                                |
| ----------------- | ------------------------------------------------------------------------- | -------------------------------------- |
| `production`      | [Validators API Mainnet](https://validators-api-main.workers.dev)         | Manual `wrangler deploy`               |
| `preview`         | [Validators API Mainnet Preview](https://validators-api-main.workers.dev) | Manual deployment                      |
| `testnet`         | [Validators API Testnet](https://validators-api-test.workers.dev)         | Manual `wrangler deploy --env testnet` |
| `testnet-preview` | [Validators API Testnet Preview](https://validators-api-test.workers.dev) | Manual deployment                      |

Each environment has its own D1 database, KV cache, and R2 blob. Sync runs hourly via Cloudflare cron triggers (see `server/tasks/sync/`).

### Deployment Migration

Migrated from Cloudflare Pages to Workers for cron job support.

**Old URLs (redirect to Workers):**

- `validators-api-mainnet.pages.dev` → `validators-api-main.workers.dev`
- `validators-api-testnet.pages.dev` → `validators-api-test.workers.dev`

Setup redirects per [MIGRATION.md](./MIGRATION.md).

**Write operations to `main` are restricted**, only via PR.
