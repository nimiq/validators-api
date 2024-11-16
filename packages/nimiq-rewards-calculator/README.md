# Nimiq Rewards Calculator

A function that calculates the rewards for Nimiq's validators based on factors such as the total staked amount, staking period, and current stake ratio. It helps determine the share of rewards earned by each validator.

## Installation

```bash
npm install nimiq-rewards-calculator
```

## Usage

```ts
import { calculateStakingRewards } from 'nimiq-rewards-calculator'

const amount = 1_000_000 // In NIM
const durationInDays = 365
const stakedSupplyRatio = 0.5 // [0-1]
const autoRestake = true

const rewards = calculateStakingRewards({ amount, durationInDays, stakedSupplyRatio, autoRestake })
console.log('Rewards:', rewards)
```
