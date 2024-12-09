  <a id="README" href="#README" href="https://github.com/nimiq/core-rs-albatross/blob/albatross/README.md">
    <img src="https://raw.githubusercontent.com/nimiq/developer-center/refs/heads/main/assets/images/logos/validators-API.svg" alt="Nimiq PoS Albatross Repository" width="600" />
  </a>
</br>
</br>

[![Sync Mainnet](https://github.com/nimiq/validators-api/actions/workflows/sync-mainnet.yml/badge.svg)](https://github.com/nimiq/validators-api/actions/workflows/sync-mainnet.yml) [![Sync Testnet](https://github.com/nimiq/validators-api/actions/workflows/sync-testnet.yml/badge.svg)](https://github.com/nimiq/validators-api/actions/workflows/sync-testnet.yml)

The Nimiq Validators API enables staking pools, based on single validators, to integrate with the Nimiq Wallet and other applications. This helps stakers make informed decisions when choosing where to stake their funds.

**Validators and Staking Pools**:
A validator can operate as a staking pool, allowing multiple users to stake. Pools must provide detailed information such as fees, payout schedules, and contact details to ensure trust and transparency.

Stakers can evaluate a validator’s reliability using the Validator Trust Score (VTS) and review staking pool details like payout schedules to select the best option.

## Add your Validator Information

If you operate a staking pool and want to be displayed in the Nimiq Wallet, follow these steps:

1. [Fork this repository](https://github.com/nimiq/validators-api/fork).
2. Add your Validator File:
   - Create a new JSON file in the `public/validators/main-albatross` directory.
   - Use the provided example template in the directory to structure your data.
3. Review the [Description Guidelines](#recommendations-for-your-validator-information).
4. Learn about the [JSON Schema](#validator-json-schema).
5. Submit a PR to this repository. A Nimiq team member will review your submission within 3 days.
6. Once the PR is submitted, check that the [API endpoint](https://validators-api-mainnet.nuxt.dev/api/v1) returns your information. This process may take a few minutes.

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

Use the following schema to create your validator information file. You can start by copying this [example JSON template](./public/validators/main-albatross/.example.json). When you add your validator information, you'll need to include specific keys in your JSON file. Below is an explanation of each key and its possible values.

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
    - `payoutSchedule`: Specifiy the frequency of payouts using the [cron job format](https://crontab.guru/). Example: `0 */6 * * *` for payouts every 6 hours.
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

- [Read the docs](https://nimiq.com/developers/learn/validator-trustscore)
- [See implementation](./packages/nimiq-validators-trustscore/)

## Validators API

The Validators API provides endpoints to retrieve validator information for integration with tools, dashboards, and other applications.
| Endpoint | Description |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| [/api/v1/validators](https://validators-api-mainnet.pages.dev/api/v1/validators) | Retrieves the validator list. See [query params](./server/utils/schemas.ts#L54) |

## Validators Dashboard

The Validators Dashboard is a simple Nuxt application that displays all validators along with their trust scores. You can access the dashboard here: https://validators-api-mainnet.pages.dev/

## Development

```bash
pnpm install
pnpm dev
```

**Notes on Development**

- The project uses Nuxt Hub, which runs on Cloudflare Pages with a Cloudflare D1 database.
- The database is a SQLite instance, shared remotely in both development and production environments. To change this behavior, modify the configuration in nuxt.config.ts.
- We use Drizzle as the database access layer.

### Score Calculation with Nitro Tasks

To calculate the score, we need to run two processes: the fetcher and the score calculator. We do this using a Nitro Task, which is currently an experimental feature of Nitro. Nitro Task is a feature that allows you to trigger an action in the server programmatically or manually from the Nuxt Dev Center (go to tasks page). Read more about the process of computing the score in the [nimiq-validators-trustscore](./packages/nimiq-validators-trustscore/README.md) package.

### Database

As well as storing the [Validator Details](#validator-details), we also store the data produced by the fetcher in a sqlite database. This data is then used in the score calculator to compute the score. You can see the file [schema.ts](./server/database/schema.ts).

#### Development

Once it is cloned and installed the dependencies, you must run:

```bash
pnpm db:generate
pnpm dev # or pnpm dev:local to use the local database
```
