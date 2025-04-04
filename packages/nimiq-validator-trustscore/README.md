# Nimiq Validator Score

The algorithm to compute the Nimiq's Validator Score. It is a metric that helps to evaluate the trustworthiness of a validator. You can read more about the Algorithm of the Score [here](https://nimiq-validators.pages.dev/scores).

This package is the implementation of such algorithm. Anyone with access to a node should be able to run the same algorithm and get the same result.

The package is implemented with versatility in mind meaning, that it is straightforward to use it in any environment and with different configurations.

The implementation has mainly two parts:

## Fetcher

Retrieves all the necessary data from previous blocks and returns it in a format that is easy to use. It will return an object of type [ActivityEpoch`](./src/types.ts).

## Score Calculator

The score calculator will take the `ActivityEpoch` object and calculate the score of the validator. The score is a number between 0 and 1, where 1 is the best score possible. The score object will be of type [`ScoreValues`](./src/types.ts).

You can change the parameters that the algorithm uses to calculate the score. See [`ScoreParams`](./src/types.ts) for more information.
