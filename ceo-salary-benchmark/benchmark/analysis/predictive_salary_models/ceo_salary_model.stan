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
  int<lower=0> N_missing;
  array[N_missing] int<lower=1, upper=N> missing_row;
  array[N_missing] int<lower=1, upper=K> missing_col;
  vector[N] log_salary_midpoint;
  vector[N] log_salary_lower;
  vector[N] log_salary_upper;
  vector[N] log_cash_proxy;
  array[N] int<lower=0, upper=1> has_cash;
  array[N] int<lower=0, upper=1> cash_equals_base;
  // 1 = exact Schedule J base, 2 = reported cash proxy with latent base,
  // 3 = advertised base-pay point or interval.
  array[N] int<lower=1, upper=3> outcome_type;
  array[N] int<lower=0, upper=1> is_interval;

  int<lower=1> J_focus;
  int<lower=1> J_structure;
  int<lower=1> J_title;
  int<lower=1> J_location;
  int<lower=1> J_remote;
  int<lower=1> J_fiscal_sponsor;
  int<lower=2> J_ea;
  array[N] int<lower=1, upper=J_focus> focus;
  array[N] int<lower=1, upper=J_structure> structure;
  array[N] int<lower=1, upper=J_title> title_group;
  array[N] int<lower=1, upper=J_location> location;
  array[N] int<lower=1, upper=J_remote> remote;
  array[N] int<lower=1, upper=J_fiscal_sponsor> fiscal_sponsor;
  array[N] int<lower=1, upper=J_ea> ea_level;
}

parameters {
  real alpha;
  vector[K] beta;
  vector[N_missing] x_missing;
  real ad_offset;
  // Bounds cover median positive cash increments from 0.7% to 139% while
  // preventing numerically extreme exponentially-modified-normal proposals.
  real<lower=0.5, upper=100> cash_increment_rate;
  real<lower=0, upper=1> cash_zero_probability;
  vector<lower=0.12, upper=1.5>[2] sigma;

  real<lower=0> tau_focus;
  real<lower=0> tau_structure;
  real<lower=0> tau_title;
  real<lower=0> tau_location;
  real<lower=0> tau_remote;
  real<lower=0> tau_fiscal_sponsor;
  vector[J_focus] focus_raw;
  vector[J_structure] structure_raw;
  vector[J_title] title_raw;
  vector[J_location] location_raw;
  vector[J_remote] remote_raw;
  vector[J_fiscal_sponsor] fiscal_sponsor_raw;

  // Functional overlap is the zero point. Signed cumulative increments support
  // the current two-level taxonomy without hard-coding the number of levels.
  vector[J_ea - 1] ea_increment;
}

transformed parameters {
  matrix[N, K] X_complete = X;
  vector[J_focus] focus_effect = tau_focus * (focus_raw - mean(focus_raw));
  vector[J_structure] structure_effect = tau_structure * (structure_raw - mean(structure_raw));
  vector[J_title] title_effect = tau_title * (title_raw - mean(title_raw));
  vector[J_location] location_effect = tau_location * (location_raw - mean(location_raw));
  vector[J_remote] remote_effect = tau_remote * (remote_raw - mean(remote_raw));
  vector[J_fiscal_sponsor] fiscal_sponsor_effect = tau_fiscal_sponsor * (fiscal_sponsor_raw - mean(fiscal_sponsor_raw));
  vector[J_ea] ea_effect;
  vector[N] mu;

  for (m in 1:N_missing) {
    X_complete[missing_row[m], missing_col[m]] = x_missing[m];
  }

  ea_effect[1] = 0;
  for (j in 2:J_ea) {
    ea_effect[j] = ea_effect[j - 1] + ea_increment[j - 1];
  }
  for (n in 1:N) {
    mu[n] = alpha + dot_product(X_complete[n], beta)
      + ad_offset * (outcome_type[n] == 3)
      + focus_effect[focus[n]]
      + structure_effect[structure[n]]
      + title_effect[title_group[n]]
      + location_effect[location[n]]
      + remote_effect[remote[n]]
      + fiscal_sponsor_effect[fiscal_sponsor[n]]
      + ea_effect[ea_level[n]];
  }
}

model {
  alpha ~ normal(12.5, 1);
  beta ~ normal(0, 0.3);
  x_missing ~ std_normal();
  ad_offset ~ normal(0, 0.35);
  cash_increment_rate ~ lognormal(log(10), 0.6);
  cash_zero_probability ~ beta(2, 2);
  // The posting spread is only weakly identified by interval observations.
  // Mildly informative positive priors keep both scales away from the
  // near-zero geometry that otherwise destabilizes sparse CV folds.
  sigma[1] ~ normal(0.35, 0.15);
  sigma[2] ~ normal(0.45, 0.18);

  tau_focus ~ normal(0, 0.25);
  tau_structure ~ normal(0, 0.25);
  tau_title ~ normal(0, 0.25);
  tau_location ~ normal(0, 0.25);
  tau_remote ~ normal(0, 0.2);
  tau_fiscal_sponsor ~ normal(0, 0.2);
  focus_raw ~ std_normal();
  structure_raw ~ std_normal();
  title_raw ~ std_normal();
  location_raw ~ std_normal();
  remote_raw ~ std_normal();
  fiscal_sponsor_raw ~ std_normal();
  ea_increment ~ normal(0, 0.2);

  for (n in 1:N) {
    if (outcome_type[n] == 1) {
      log_salary_midpoint[n] ~ normal(mu[n], sigma[1]);
      if (has_cash[n] == 1) {
        if (cash_equals_base[n] == 1) {
          target += bernoulli_lpmf(1 | cash_zero_probability);
        } else {
          target += bernoulli_lpmf(0 | cash_zero_probability);
          log_cash_proxy[n] - log_salary_midpoint[n] ~ exponential(cash_increment_rate);
        }
      }
    } else if (outcome_type[n] == 2) {
      target += log_mix(
        cash_zero_probability,
        normal_lpdf(log_cash_proxy[n] | mu[n], sigma[1]),
        exp_mod_normal_lpdf(log_cash_proxy[n] | mu[n], sigma[1], cash_increment_rate)
      );
    } else if (is_interval[n] == 0) {
      log_salary_midpoint[n] ~ normal(mu[n], sigma[2]);
    } else {
      target += normal_interval_lprob(
        log_salary_lower[n], log_salary_upper[n], mu[n], sigma[2]
      );
    }
  }
}

generated quantities {
  vector[N] log_lik;
  vector[N] log_salary_rep;
  for (n in 1:N) {
    if (outcome_type[n] == 1) {
      log_lik[n] = normal_lpdf(log_salary_midpoint[n] | mu[n], sigma[1]);
      if (has_cash[n] == 1) {
        if (cash_equals_base[n] == 1) {
          log_lik[n] += bernoulli_lpmf(1 | cash_zero_probability);
        } else {
          log_lik[n] += bernoulli_lpmf(0 | cash_zero_probability)
            + exponential_lpdf(log_cash_proxy[n] - log_salary_midpoint[n] | cash_increment_rate);
        }
      }
    } else if (outcome_type[n] == 2) {
      log_lik[n] = log_mix(
        cash_zero_probability,
        normal_lpdf(log_cash_proxy[n] | mu[n], sigma[1]),
        exp_mod_normal_lpdf(log_cash_proxy[n] | mu[n], sigma[1], cash_increment_rate)
      );
    } else if (is_interval[n] == 0) {
      log_lik[n] = normal_lpdf(log_salary_midpoint[n] | mu[n], sigma[2]);
    } else {
      log_lik[n] = normal_interval_lprob(
        log_salary_lower[n], log_salary_upper[n], mu[n], sigma[2]
      );
    }
    // Replicate the latent annual salary on the evidence stream's scale.
    // For a cash-only filing, mu remains the latent base-pay target rather
    // than an observed-cash replicate.
    log_salary_rep[n] = normal_rng(mu[n], outcome_type[n] == 3 ? sigma[2] : sigma[1]);
  }
}
