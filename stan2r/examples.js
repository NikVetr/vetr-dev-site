export const examples = {
  hierarchical: {
    name: 'Hierarchical normal',
    source: `data {
  int<lower=1> N;
  vector[N] y;
}
parameters {
  real mu;
  real<lower=0> tau;
  vector[N] z;
}
transformed parameters {
  vector[N] theta = mu + tau * z;
}
model {
  mu ~ normal(0, 2);
  tau ~ normal(0, 1);
  z ~ normal(0, 1);
  y ~ normal(theta, 0.5);
}`,
    data: { N: 4, y: [0.4, 1.1, -0.2, 0.8] },
    draws: { mu: [0.5], tau: [0.8], 'z[1]': [0.1], 'z[2]': [0.2], 'z[3]': [-0.3], 'z[4]': [0.4] },
  },
  normal: {
    name: 'Normal observations',
    source: `data {
  int<lower=1> N;
  vector[N] y;
}
parameters {
  real mu;
  real<lower=0> sigma;
}
model {
  mu ~ normal(0, 2);
  sigma ~ normal(0, 1);
  y ~ normal(mu, sigma);
}`,
    data: { N: 4, y: [0.4, 1.1, -0.2, 0.8] },
    draws: { mu: [0.5, 0.6], sigma: [0.8, 0.9] },
  },
  binomial: {
    name: 'Beta–binomial',
    source: `data {
  int<lower=0> trials;
  int<lower=0, upper=trials> successes;
}
parameters {
  real<lower=0, upper=1> theta;
}
model {
  theta ~ beta(2, 2);
  successes ~ binomial(trials, theta);
}`,
    data: { trials: 20, successes: 12 },
    draws: { theta: [0.55, 0.62] },
  },
};
