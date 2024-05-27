<!-- @unocss-include -->

# Nimiq's Validator Trust Score

The Nimiq Validator Trust Score helps users to assess how reliable a validator is. The score ranges from 0 to 1, where 0 means not trustworthy at all and 1 means highly trustworthy.

The score updates over time based on the behaviour of the validator, taking into account three factors: reliability, liveliness and size. Each factor also ranges from 0 to 1.

$$
T = R \times L \times S
$$

## Reliability

Reliability measures how consistently a validator produces blocks when expected. To calculate it, we look at the number of slots a validator was assigned and the rewards received.

Reliability is monitored for each batch:

$$
\text{Observation} = \frac{\text{Rewarded Slots}}{\text{Assigned Slots}}
$$

To get the reliability factor, we use a weighted moving average over the last $n$ batches:

$$
\bar{R} = \frac{\sum_{i=0}^{n-1} \left( 1-a\frac{i}{n-1} \right) x_i}{\sum_{i=0}^{n-1} \left( 1-a\frac{i}{n-1} \right)}
$$

Where:

- $x_i$ is the observation for batch $i$.
- $i=0$ is the latest batch
- $a$ is the weight of older observations

### Adjustment for high reliability expectation

The previous formula provides a weighted moving average score for server reliability in block production, where a score of $0.9$ indicates a significant downtime of 10%, highlighting recent performance and the need for improved consistency. (This is not entirely true, but it is a good approximation)

As one block is missing, this is a significant shortfall. To better reflect the high standards required, we will plot the value on a circle, having $c$ as the parameter defining the slope of the arc.

$$
R=-c+1-\sqrt{-\bar{R}^{2}+2c\bar{R}+\left(c-1\right)^{2}}
\\~\\
\text{Center of circle at (c,-c+1), where }
c=-0.16
$$

https://www.desmos.com/calculator/zqemsh7yay

## Liveness

Liveness measures how often a validator is selected to create blocks, encouraging active participation.

For each epoch, the liveness observation is:

$$
\text{Observation} = \frac{\text{Selected Epochs}}{\text{Total Epochs}}
$$

To obtain the liveliness factor, we use a weighted moving average over the last $m$ epochs:

$$
\bar{L} = \frac{\sum_{i=0}^{n-1} \left( 1-a\frac{i}{n-1} \right) x_i}{\sum_{i=0}^{n-1} \left( 1-a\frac{i}{n-1} \right)}
$$

Parameters:

$$
a = 0.5 \\
\text{epochs\_in\_a\_day} = \frac{60 \times 60 \times 24}{\text{batches\_per\_epoch}} \\
d = 9 \times 30 \quad \text{(9 months in days)} \\
n = \text{epochs\_in\_a\_day} \times d
$$

Where $x_i$ is the observation at epoch number $i$ with $i=0$ representing the most recent epoch. And $a$ is a parameter determining how much the observation of the oldest epoch is worth relative to the observation of the newest epoch.

### Supporting Smaller Validators

To better support smaller validators, we use a curve to map the value from the from the previous step. This adjustment aims to reduce the penalty for validators who are not frequently selected for block production, while still incentivising active participation.

The adjusted Liveness score is calculated using the following formula:

$$
L=-\bar{L}^{2}+2\bar{L}
$$

https://www.desmos.com/calculator/oipaneynho

## Size

The size factor penalises validators who control too much of the network's share.

We define the size $s$ of a validator as the fraction of the total stake it controls. The size factor is calculated as

$$
S = \max \left( 0 , 1 - \left( \frac{s}{t} \right)^{k} \right)
$$

Where:

- $t$ is the threshold
- $k$ is the slope of the curve

Parameters:

$$
t = 0.25 \\
k = 4
$$

For example:

- A validator with a size of 0.1 would have a size factor of 0.974.
- A validator with a size of 0.15 would have a size factor of 0.87.

https://www.desmos.com/calculator/89yvaeqxff
