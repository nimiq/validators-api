# Nimiq's Validator Trust Score

The Nimiq's Validator Trust Score is a metric that helps users to evaluate the trustworthiness of a validator. It is a value between 0 and 1, where 0 means that the validator is not trustworthy at all and 1 means that the validator behaves well and is trustworthy.

> The score is just a value used to help users evaluate the trustworthiness of a validator. It is not a guarantee that the validator is trustworthy and the value of the score can change over time. The value of the score won't affect the protocol in any way.

The score is reactive and changes over time as the validator behaves well or poorly.

This score is a combination of several factors that we believe are important for a validator to be trustworthy. These factors include liveness, uptime and age. In this document, we will explain how the score is calculated and what each factor means.

Feel free to share your feedback and suggestions on how to improve the trust score calculation.

## Liveness

This factor measures how often the validator is online and producing blocks. A validator that is offline for a long time is not trustworthy. The liveness factor is calculated as follows:
