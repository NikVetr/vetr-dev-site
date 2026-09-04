functions {
  real normal_interval_lprob(real lo, real hi, real mu, real sigma) {
    if (lo > mu) {
      return log_diff_exp(
        normal_lccdf(lo | mu, sigma),
        normal_lccdf(hi | mu, sigma)
      );
    }
    return log_diff_exp(
      normal_lcdf(hi | mu, sigma),
      normal_lcdf(lo | mu, sigma)
    );
  }
}

data {
  int<lower=1> N;
  int<lower=1> K;
  matrix[N, K] X;
  vector[N] log_salary_midpoint;
  vector[N] log_salary_lower;
  vector[N] log_salary_upper;
  array[N] int<lower=0, upper=1> is_exact;
  array[N] int<lower=1, upper=2> source;

  int<lower=1> J_focus;
  int<lower=1> J_structure;
  int<lower=1> J_title;
  int<lower=1> J_location;
  array[N] int<lower=1, upper=J_focus> focus;
  array[N] int<lower=1, upper=J_structure> structure;
  array[N] int<lower=1, upper=J_title> title_group;
  array[N] int<lower=1, upper=J_location> location;
  array[N] int<lower=1, upper=3> ea_level;
}

parameters {
  real alpha;
  vector[K] beta;
  real ad_offset;
  vector<lower=0.12>[2] sigma;

  real<lower=0> tau_focus;
  real<lower=0> tau_structure;
  real<lower=0> tau_title;
  real<lower=0> tau_location;
  vector[J_focus] focus_raw;
  vector[J_structure] structure_raw;
  vector[J_title] title_raw;
  vector[J_location] location_raw;

  // Functional overlap is the zero point. Signed cumulative increments keep
  // the predeclared order without forcing a salary direction unsupported by data.
  vector[2] ea_increment;
}

transformed parameters {
  vector[J_focus] focus_effect = tau_focus * (focus_raw - mean(focus_raw));
  vector[J_structure] structure_effect = tau_structure * (structure_raw - mean(structure_raw));
  vector[J_title] title_effect = tau_title * (title_raw - mean(title_raw));
  vector[J_location] location_effect = tau_location * (location_raw - mean(location_raw));
  vector[3] ea_effect;
  vector[N] mu;

  ea_effect[1] = 0;
  ea_effect[2] = ea_increment[1];
  ea_effect[3] = ea_increment[1] + ea_increment[2];
  for (n in 1:N) {
    mu[n] = alpha + dot_product(X[n], beta)
      + ad_offset * (source[n] == 2)
      + focus_effect[focus[n]]
      + structure_effect[structure[n]]
      + title_effect[title_group[n]]
      + location_effect[location[n]]
      + ea_effect[ea_level[n]];
  }
}

model {
  alpha ~ normal(12.5, 1);
  beta ~ normal(0, 0.3);
  ad_offset ~ normal(0, 0.35);
  // The posting spread is only weakly identified by interval observations.
  // Mildly informative positive priors keep both scales away from the
  // near-zero geometry that otherwise destabilizes sparse CV folds.
  sigma[1] ~ normal(0.35, 0.15);
  sigma[2] ~ normal(0.45, 0.18);

  tau_focus ~ normal(0, 0.25);
  tau_structure ~ normal(0, 0.25);
  tau_title ~ normal(0, 0.25);
  tau_location ~ normal(0, 0.25);
  focus_raw ~ std_normal();
  structure_raw ~ std_normal();
  title_raw ~ std_normal();
  location_raw ~ std_normal();
  ea_increment ~ normal(0, 0.2);

  for (n in 1:N) {
    if (is_exact[n] == 1) {
      log_salary_midpoint[n] ~ normal(mu[n], sigma[source[n]]);
    } else {
      target += normal_interval_lprob(
        log_salary_lower[n], log_salary_upper[n], mu[n], sigma[source[n]]
      );
    }
  }
}

generated quantities {
  vector[N] log_lik;
  vector[N] log_salary_rep;
  for (n in 1:N) {
    if (is_exact[n] == 1) {
      log_lik[n] = normal_lpdf(log_salary_midpoint[n] | mu[n], sigma[source[n]]);
    } else {
      log_lik[n] = normal_interval_lprob(
        log_salary_lower[n], log_salary_upper[n], mu[n], sigma[source[n]]
      );
    }
    log_salary_rep[n] = normal_rng(mu[n], sigma[source[n]]);
  }
}
