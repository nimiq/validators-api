# Nimiq Supply Calculator

A utility library to calculate cryptocurrency supply for Nimiq during the transition from Proof-of-Work (PoW) to Proof-of-Stake (PoS).

## Features

- Compute supply for PoW and PoS mechanisms.
- Handle supply decay and block-based rewards.
- Includes parameters for Nimiq's specific PoS and PoW logic.

---

## Installation

To add the library to your project, install it via npm:

```bash
npm install nimiq-supply-calculator
```

## Usage

Here’s an example of how to use the library to compute the supply:

### Calculate PoS Supply

```ts
import { posSupplyAt } from 'nimiq-supply-calculator'

const duration = 31556952000 // One year in milliseconds

const posSupply = posSupplyAt(duration)
console.log('PoS Supply:', posSupply)
```

### Calculate PoW Supply

```ts
import { powBlockHeightAt, powSupplyAfter } from 'nimiq-supply-calculator'

const blockHeight = powBlockHeightAt(new Date('2024-01-01'))

const powSupply = powSupplyAfter(blockHeight)
console.log('PoW Supply:', powSupply)
```

### Other utils

You can check [`utils.ts`](./src/utils.ts), [`pow.ts`](./src/pow.ts) and [`pos.ts`](./src/pos.ts) to see other constants that you can import.
