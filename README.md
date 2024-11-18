<h1 align="center">Nimiq Validators</h1>

<p align="center">
  <a href="https://validators-api-mainnet.pages.dev">
    <img src="./public/favicon.svg" alt="Nimiq Validators" width="64" />
  </a>

<p align="center">
Details of validators in the Nimiq Blockchain and their scores, calculated using Nimiq's VTS algorithm.
<p>

[![Fetch Missing Epochs](https://github.com/nimiq/validators-api/actions/workflows/fetch-epochs.yml/badge.svg)](https://github.com/nimiq/validators-api/actions/workflows/fetch-epochs.yml)

## Add your validator information

If you run your own validator and want it to be recognized, you can add a name, logo and other publicly available fields. For example, the Nimiq Wallet will use this information to display your validator to users.

In order to do so, follow these steps:

1. [Fork this repository](https://github.com/nimiq/validators-api/fork).
2. Create a new file in the [validators folder](./public/validators/main-albatross).
   2.1 Read the [Recommendations for Writing Your Validator Information](#recommendations-for-your-validator-information)
   2.2 Learn about the [JSON schema](#validator-json-schema)
3. Submit a PR to this repo. Someone in the team will review it.
4. Once the PR is submitted, check that the [API endpoint](https://validators-api-mainnet.nuxt.dev/api/v1) is returning your information. It can take a few minutes.

> [!WARNING]
> Nimiq reserves the right to make minor adjustments to the content submitted by validator owners, if deemed necessary.

### Recommendations for Your Validator Information

#### Description

This information will be displayed in mainly the wallet to help stakers decide which pool they want to stake in. Use this opportunity to make a great impression:

- **Length**: Keep it short and to the point - 1-2 sentences, ideally 20-40 words.
- **Be concise and clear**: Highlight what makes your pool stand out. Focus on stakeholder values such as reliability, transparency or low fees.
- **Play to your strengths**: Mention features such as high uptime, low fees, strong community support or environmentally friendly practices.
- **Avoid financial advice**: Refrain from promising potential returns or financial outcomes.
- **Use a Friendly Tone**: Make your message approachable and welcoming, while maintaining professionalism.

##### Good Example

> "Our pool offers 99.9% uptime, low fees, and strong security, ensuring a seamless staking experience. Join us for a reliable, transparent, and staker-focused service."

##### Bad Example

> "Stake with us for unmatched rewards and the highest profits! Don’t miss your chance to earn big — this is the ultimate opportunity for stakers!"

#### Payout Schedule

- **Use simple and clear language**: Avoid technical terms like "epoch" or "batch."
- **Keep it short**: Aim for 5-8 words.

##### Good Example

> "Every 12 hours"

##### Bad Example

> "Every 2 epochs"

#### Icon

- **Shape**: It is preferred that the icon follows the Nimiq hexagon shape. For reference, please refer to the bottom of the 'Colours' section of our [Nimiq Style Guide on Figma](<https://www.figma.com/design/GU6cdS85S2v13QcdzW9v8Tav/NIMIQ-Style-Guide-(Oct-18)?node-id=0-1&node-type=canvas&t=mNoervj6Kgw0KhKL-0>).
- **Background**: Do not add a background colour to the image.
- **Format**: Prefer to use SVG. File size isn't an issue as we will optimise and serve the best performing version (e.g. PNG, JPG, SVG) for each validator.

### Validator JSON schema

You can use the [example JSON](./public/validators/main-albatross/.example.json) as a template.

When you add your validator information, you'll need to include certain keys in your JSON file. Below is an explanation of each key and its possible values:

- `address` (required): The address of the validator in the format `NQXX XXXX XXXX XXXX XXXX XXXX XXXX XXXX XXXX`.
- `fee` (required): A number between 0 and 1 representing the fee percentage charged by your validator. For example, 0.05 represents a 5% fee.
- `payoutType` (required): The method used to pay out validator rewards. Possible values are:
  - `restake`: Rewards are automatically restaked.
  - `direct`: Rewards are paid directly into the staker's wallet and are not automatically restaked.
  - `none`: No rewards will be paid out.
- `payoutSchedule` (optional): A string to indicate the payout schedule. This could be helpful for users to know when to expect rewards. Any string is valid. e.g: 'Daily', 'Every 12 hours'...
- `name` (optional): The name of the validator. If not specified, the address of the validator is used by default.
- `description` (optional): A short description of your validator.
- `website` (optional): The URL of your validator's website.
- `icon` (optional): An SVG icon representing your pool, encoded in base64 format.
- `accentColor` (optional). Required if `icon` is set. An optional color to align with the validator's branding, defaulting to the identicon background color if left blank. Needs to be in hexadecimal. e.g. '#1f2348'.
- `contact` (optional). An optional field allowing validators to share contact details so users can easily get in touch. The structure would look like this:
  - `email` (optional)
  - `telegram` (optional). e.g. `@nimiq`
  - `twitter` (optional). e.g. `@nimiq`
  - `discordInvitationUrl` (optional). A URL to your Discord invitation.
  - `bluesky` (optional). e.g. `@nimiq`
  - `github` (optional). e.g. `nimiq`
  - `linkedin` (optional). e.g. `nimiq`
  - `facebook` (optional). e.g. `nimiq`
  - `instagram` (optional). e.g. `@nimiq`
  - `youtube` (optional). e.g. `nimiq`

## Validators Dashboard

https://validators-api-mainnet.pages.dev/

The dashboard is a simple Nuxt application that displays all validators and their scores.

## Validators API

| Endpoint                                                                               | Description                                                       |
| -------------------------------------------------------------------------------------- | :---------------------------------------------------------------- |
| [/api/v1/scores](https://validators-api-mainnet.pages.dev/api/v1/scores)               | An endpoint that returns the list of validators and their scores. |
| [/api/v1/scores/health](https://validators-api-mainnet.pages.dev/api/v1/scores/health) | An endpoint that returns the state of the database.               |

## Validator Score

[Source code](./packages/nimiq-validators-score/)

This is a npm package that calculates the Trust Score of a validator. You can read more about the Score [here](https://validators-api-mainnet.pages.dev/scores).

## Validator Details

The validator details are hardcoded into the [server/database/seed.ts](./server/database/seed.ts) file. If you are responsible for a validator and want to update the information, please open a PR with your information. This process may change in the future.

### Development

```bash
pnpm install
pnpm dev
```

> [!Note]
> We use [Nuxt Hub](https://hub.nuxt.dev) which uses Cloudflare Pages + Cloudflare D1 databases. The database is a sqlite instance and currently the database is remote for both development and production. You can change this behavior in nuxt.config.ts.

We use Drizzle to access the database.

### Calculating the score using Nitro Tasks

To calculate the score, we need to run two processes: the fetcher and the score calculator. We do this using a Nitro Task, which is currently an experimental feature of Nitro. Nitro Task is a feature that allows you to trigger an action in the server programmatically or manually from the Nuxt Dev Center(go to tasks page).

Read more about the process of computing the score in the [nimiq-validators-score](./packages/nimiq-validators-score/README.md) package.

#### Database

As well as storing the [Validator Details](#validator-details), we also store the data produced by the fetcher in a sqlite database. This data is then used in the score calculator to compute the score. You can see the file [schema.ts](./server/database/schema.ts).

## Development

Once it is cloned and installed the dependencies, you must run:

```bash
pnpm db:generate
pnpm dev # or pnpm dev:local to use the local database
```
