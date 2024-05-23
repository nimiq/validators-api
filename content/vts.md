# Nimiq's Validator Trust Score

The Nimiq's Validator Trust Score is a metric that helps users to evaluate the trustworthiness of a validator. It is a value between 0 and 1, where 0 means that the validator is not trustworthy at all and 1 means that the validator behaves well and is trustworthy.

The score is reactive and changes over time as the validator behaves well or poorly.

The factors are, respectively: reliability, liveness and size. All of the factors are in the range $$[0; 1]$$, so the trust score naturally is also in the range (that then we can transform into whichever range we want of course).

$$
T = R \times L \times S
$$

## Reliability

## Liveness

The Reliability factor penalizes validators that inconsistently produce blocks when expected, assessing their active contribution to the network.

```text
For a single batch, take the number of slots that the validator owns and received a reward for and divide it by the number of slots that the validator owns.
```

We calculate each observation (data point) of the reliability like this:

To calculate the factor we do a weighted moving average over the past $n$ batches:

$$
\bar{R} = \frac{\sum_{i=0}^{n-1} \left( 1-a\frac{i}{n-1} \right) x_i}{\sum_{i=0}^{n-1} \left( 1-a\frac{i}{n-1} \right)}
$$

Where $x_i$ is the observation at batch number $i$ with $i=0$ representing the most recent batch. And $a$ is a parameter determining how much the observation of the oldest batch is worth relative to the observation of the newest batch.

We decided the parameters to be:

$$
a=0.5
batches\_in\_a\_day = 60 * 60 * 24;
d = 9 * 30; \text{ 9 months in days}
$$

$$

n = batches_in_a_day \* d
$$

### **Adjusting for High-Reliability Expectations**

The previous formula provides a weighted moving average score for server reliability in block production, where a score of $0.9$ indicates a significant downtime of 10%, highlighting recent performance and the need for improved consistency. (This is not entirely true, but it is a good approximation)

As one block is missing, this is a significant shortfall. To better reflect the high standards required, we will plot the value on a circle, having $c$ as the parameter defining the slope of the arc.

$$

R=-c+1-\sqrt{-\bar{R}^{2}+2c\bar{R}+\left(c-1\right)^{2}}
\\~\\
\text{Center of circle at (c,-c+1), where }
c=-0.16
$$

<iframe src="https://www.desmos.com/calculator/zqemsh7yay" width="100%" height="500px"></iframe>

Feel free to share your feedback and suggestions on how to improve the trust score calculation.

$$
$$
