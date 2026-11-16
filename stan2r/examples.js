export const examples = {
  multilevel: {
    name: 'Multilevel beta–binomial',
    // Original Stan2R README model, unchanged.
    source: `data {
  int<lower=0> n;
  array[n] int<lower=1> k;
  array[n] int<lower=0, upper=k> x;
  int<lower=1> n_groups;
  array[n] int<lower=1, upper=n_groups> group;
}

transformed data {
  vector<lower=0>[n] k_scaled = to_vector(k) ./ (max(k) * 1.0);
}

parameters {
  real theta_intercept;
  real theta_slope;
  vector[n_groups] theta_group; //this is a test comment
  real<lower=0> theta_group_sd;
  real<lower=0> conc_offset;
}

transformed parameters {
  vector[n] theta = theta_intercept + rep_vector(theta_slope, n) .* k_scaled + theta_group[group] * theta_group_sd;
  vector<lower=0, upper=1>[n] mu = inv_logit(theta);
  real<lower=2> conc = conc_offset * 3 + 40;
  vector<lower=0>[n] shape1 = 1 + mu .* rep_vector(conc, n); //this is another test comment
  vector<lower=0>[n] shape2 = 1 + (1-mu) .* rep_vector(conc, n);
}

model {
  //priors
  theta_intercept ~ std_normal();
  theta_slope ~ std_normal();
  theta_group ~ std_normal();
  theta_group_sd ~ std_normal();
  conc_offset ~ exponential(0.1);
\x20\x20
  //likelihood
  x ~ beta_binomial(k, shape1, shape2);
}
`,
    data: { n: 8, k: [10,20,30,40,10,20,30,40], x: [2,8,18,25,1,9,16,30], n_groups: 3, group: [1,1,2,2,3,3,1,2] },
    draws: { theta_intercept: [0], theta_slope: [0.4], 'theta_group[1]': [-0.2], 'theta_group[2]': [0.3], 'theta_group[3]': [0.1], theta_group_sd: [0.5], conc_offset: [5] },
  },
  grouped: {
    name: 'Grouped normal',
    source: `data {
  int<lower=1> N;
  int<lower=1> J;
  array[N] int<lower=1, upper=J> group;
  vector[N] y;
}
parameters {
  real mu;
  real<lower=0> tau;
  vector[J] z;
  real<lower=0> sigma;
}
transformed parameters {
  vector[J] theta = mu + tau * z;
  vector[N] eta = theta[group];
}
model {
  mu ~ normal(0, 2);
  tau ~ normal(0, 1);
  z ~ std_normal();
  sigma ~ normal(0, 1);
  y ~ normal(eta, sigma);
}`,
    data: { N: 6, J: 3, group: [1,1,2,2,3,3], y: [0.4,0.8,-0.2,-0.1,1.2,1.5] },
    draws: { mu: [0.5], tau: [0.8], sigma: [0.4], 'z[1]': [0.1], 'z[2]': [-0.3], 'z[3]': [0.4] },
  },

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
