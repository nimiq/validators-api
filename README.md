<h1 align="center">Nimiq Validators</h1>

<p align="center">
  <a href="https://validators-api.pages.dev">
    <img src="./public/favicon.svg" alt="Nimiq Validators" width="64" />
  </a>

<p align="center">
Details of validators in the Nimiq Blockchain and their scores, calculated using Nimiq's VTS algorithm.
<p>

> [!NOTE]
> If you're a validator and would like to add your data to the API, please open a pull request (PR) with your JSON file, following the structure of `./public/validators/.example` in the `./public/validators` directory.

## Add your validator information

If you run your own validator and want it to be recognized, you can add a name, logo and other publicly available fields. For example, the Nimiq Wallet will use this information to display your validator to users.

In order to do so, follow these steps:

1. [Fork this repository](https://github.com/nimiq/validators-api/fork).
2. Create a new file in the [validators folder](./public/validators/) with the structure explained below:

<details>
  <summary>Validator JSON fields</summary>

When you add your validator information, you'll need to include certain keys in your JSON file. Below is an explanation of each key and its possible values:

- `address` (required): The address of the validator in the format `NQXX XXXX XXXX XXXX XXXX XXXX XXXX XXXX XXXX`.
- `fee` (required): A number between 0 and 1 representing the fee percentage charged by your validator. For example, 0.05 represents a 5% fee.
- `payoutType` (required): The method used to pay out validator rewards. Possible values are:
  - `restake`: Rewards are automatically restaked.
  - `direct`: Rewards are paid directly into the staker's wallet and are not automatically repaid.
  - `none`: No rewards will be paid out.
- `name` (optional): The name of the validator. If not specified, the address of the validator is used by default.
- `description` (optional): A short description of your validator.
- `website` (optional): The URL of your validator's website.
- `icon` (optional): An SVG icon representing your pool, encoded in base64 format. It is preferred that the icon has the Nimiq hexagon shape. For reference, please check the bottom part of the 'Colors' section of our [Nimiq Style Guide on Figma](<https://www.figma.com/design/GU6cdS85S2v13QcdzW9v8Tav/NIMIQ-Style-Guide-(Oct-18)?node-id=0-1&node-type=canvas&t=mNoervj6Kgw0KhKL-0>).

You can also checkout [JSON example](`./public/validators/.example.json`).

</details>

3. Submit a PR to this repo. Someone in the team will review it.
4. Once the PR is submitted, check that the [API endpoint](https://validators-api-nimiq.nuxt.dev/api/v1) is returning your information. It can take a few minutes.

> [!INFO]
> By submitting this information, various Nimiq applications, such as the Nimiq Wallet, will show users the fields you have submitted and the Validator Score associated with your validator in the future. You can read more about the Validator Score in the [Developer's Center (Preview)](https://deploy-preview-21--developer-center.netlify.app/learn/validator-trust-score).

## Validators Dashboard

https://validators-api.pages.dev/

The dashboard is a simple Nuxt application that displays all validators and their scores.

## Validators API

| Endpoint                                                                       | Description                                                       |
| ------------------------------------------------------------------------------ | :---------------------------------------------------------------- |
| [/api/v1/scores](https://validators-api.pages.dev/api/v1/scores)               | An endpoint that returns the list of validators and their scores. |
| [/api/v1/scores/health](https://validators-api.pages.dev/api/v1/scores/health) | An endpoint that returns the state of the database.               |

## Validator Score

[Source code](./packages/nimiq-validators-score/)

This is a npm package that calculates the Trust Score of a validator. You can read more about the Score [here](https://validators-api.pages.dev/scores).

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
