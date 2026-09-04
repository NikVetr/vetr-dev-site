args <- commandArgs(trailingOnly = FALSE)
file_arg <- grep("^--file=", args, value = TRUE)
script_path <- normalizePath(sub("^--file=", "", file_arg[[1]]))
repo <- dirname(dirname(script_path))
source(file.path(repo, "benchmark", "analysis", "predictive_salary_models", "model_utils.R"))

extreme <- log_interval_probability(9, 10, 0, 1)
extreme_reference <- log(pnorm(9, lower.tail = FALSE) - pnorm(10, lower.tail = FALSE))
stopifnot(is.finite(extreme), extreme > -100, abs(extreme - extreme_reference) < 1e-10)

means <- c(-1, 0, 1)
scales <- c(0.5, 1, 2)
stable <- log_interval_probability(-0.5, 0.75, means, scales)
direct <- log(pnorm(0.75, means, scales) - pnorm(-0.5, means, scales))
stopifnot(all(is.finite(stable)), max(abs(stable - direct)) < 1e-10)

mixture <- log_sum_exp_pair(c(-1000, -2), c(-1001, -3))
mixture_reference <- c(-1000 + log1p(exp(-1)), -2 + log1p(exp(-1)))
stopifnot(all(is.finite(mixture)), max(abs(mixture - mixture_reference)) < 1e-12)

emg <- log_exp_mod_normal(1.2, c(0, 0.5), c(0.4, 0.8), c(3, 2))
stopifnot(all(is.finite(emg)))
emg_reference <- integrate(
  function(base) dnorm(base, 0, 0.4) * dexp(1.2 - base, 3),
  lower = -Inf, upper = 1.2
)$value
stopifnot(abs(exp(emg[[1]]) - emg_reference) < 1e-10)

cat("salary-model numerical tests passed\n")
