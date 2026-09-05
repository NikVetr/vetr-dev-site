args <- commandArgs(trailingOnly = FALSE)
script <- normalizePath(sub("^--file=", "", grep("^--file=", args, value = TRUE)[[1]]))
repo <- dirname(dirname(script))
model_dir <- file.path(repo, "benchmark", "analysis", "predictive_salary_models")
scope <- new.env()
source(file.path(model_dir, "model_utils.R"), local = scope)
for (expression in parse(file.path(model_dir, "fit_salary_models.R"))) {
  if (is.call(expression) && identical(expression[[1]], as.name("<-")) &&
      is.call(expression[[3]]) && identical(expression[[3]][[1]], as.name("function"))) {
    eval(expression, scope)
  }
}

covariance <- matrix(c(1, .8, .8, 1), 2)
conditional <- scope$conditional_missing_normal(c(2, NA), c(FALSE, TRUE), c(0, 0), covariance)
stopifnot(abs(conditional$mean - 1.6) < 1e-12,
          abs(conditional$covariance[1, 1] - .36) < 1e-12)
partial <- scope$conditional_missing_normal(
  c(2, NA, NA), c(FALSE, TRUE, TRUE), rep(0, 3),
  matrix(c(1, .8, .4, .8, 1, .4, .4, .4, 1), 3)
)
stopifnot(max(abs(partial$mean - c(1.6, .8))) < 1e-12,
          max(abs(partial$covariance - matrix(c(.36, .08, .08, .84), 2))) < 1e-12)
all_missing <- scope$conditional_missing_normal(c(NA, NA), c(TRUE, TRUE), c(1, 2), covariance)
stopifnot(identical(all_missing$mean, c(1, 2)), identical(all_missing$covariance, covariance))
stopifnot(length(scope$conditional_missing_normal(c(1, 2), c(FALSE, FALSE), c(0, 0), covariance)$mean) == 0)
stopifnot(inherits(try(scope$conditional_missing_normal(c(NA, NA), c(FALSE, TRUE), c(0, 0), covariance), silent = TRUE), "try-error"))

# Exercise actual held-out salary prediction, including two jointly missing inputs.
draws <- 12000L
zero <- matrix(0, draws, 1)
components <- list(alpha = rep(0, draws), beta = matrix(rep(c(1, 1, 0, 0), each = draws), draws),
                   x_location = matrix(0, draws, 2), x_covariance = rep(list(covariance), draws),
                   ad_offset = rep(0, draws), sigma = matrix(.3, draws, 2),
                   focus = zero, structure = zero, title = zero, location = zero,
                   remote = zero, fiscal_sponsor = zero, ea = zero)
design <- list(X = rbind(c(2, 0, 0, 1), c(-2, 0, 0, 1), c(0, 0, 1, 1), c(2, 3, 0, 0)),
               missing = rbind(c(FALSE, TRUE), c(FALSE, TRUE), c(TRUE, TRUE), c(FALSE, FALSE)),
               focus = rep(1, 4), structure = rep(1, 4), title = rep(1, 4), location = rep(1, 4),
               remote = rep(1, 4), fiscal_sponsor = rep(1, 4), ea = rep(1, 4), source = rep(1, 4))
set.seed(8203)
mu <- scope$posterior_mu(components, design)
stopifnot(abs(mean(mu[1, ]) - 3.6) < .025, abs(var(mu[1, ]) - .36) < .025,
          abs(mean(mu[2, ]) + 3.6) < .025, abs(var(mu[3, ]) - 3.6) < .15,
          all(mu[4, ] == 5))
test <- data.frame(id = letters[1:4], organization = letters[1:4], source = "filing",
                   observation = "exact_base", outer_fold = 1L, log_mid = 1:4, log_low = 1:4, log_high = 1:4)
before <- scope$evaluate_prediction_draws(test, design, components, 123)
test$log_mid <- test$log_mid + 10
after <- scope$evaluate_prediction_draws(test, design, components, 123)
columns <- grep("^predicted_", names(before), value = TRUE)
stopifnot(identical(before[columns], after[columns]))
cat("Conditional means, variances, joint missingness, complete inputs, and held-out outcome independence passed\n")

if ("--stan" %in% commandArgs(trailingOnly = TRUE)) {
  suppressPackageStartupMessages(library(cmdstanr))
  set.seed(8204)
  n <- 90L
  p <- 3L
  correlation <- matrix(c(1, .8, .4, .8, 1, .4, .4, .4, 1), p)
  x <- matrix(rnorm(n * p), n, p) %*% chol(correlation)
  salary <- 12 + .2 * x[, 1] + rnorm(n, 0, .3)
  missing <- matrix(FALSE, n, p)
  missing[1:10, 1] <- TRUE
  missing[11:20, 2:3] <- TRUE
  locations <- which(missing, arr.ind = TRUE)
  x[missing] <- 0
  data <- list(N = n, K = 2L * p, P = p, X = cbind(x, 1L * missing),
               N_missing = nrow(locations), missing_row = locations[, 1], missing_col = locations[, 2],
               log_salary_midpoint = salary, log_salary_lower = salary, log_salary_upper = salary,
               log_cash_proxy = rep(0, n), has_cash = rep(0L, n), cash_equals_base = rep(0L, n),
               outcome_type = rep(1L, n), is_interval = rep(0L, n),
               J_focus = 1L, J_structure = 1L, J_title = 1L, J_location = 1L, J_remote = 1L,
               J_fiscal_sponsor = 1L, J_ea = 2L, focus = rep(1L, n), structure = rep(1L, n),
               title_group = rep(1L, n), location = rep(1L, n), remote = rep(1L, n),
               fiscal_sponsor = rep(1L, n), ea_level = rep(1L, n))
  model <- cmdstan_model(file.path(model_dir, "ceo_salary_model.stan"), quiet = TRUE)
  fit <- model$sample(data = data, seed = 8205, chains = 1, iter_warmup = 150, iter_sampling = 150,
                      refresh = 0, adapt_delta = .99, max_treedepth = 13)
  rho <- as.numeric(fit$draws("x_cholesky[2,1]", format = "draws_matrix"))
  stopifnot(all(is.finite(rho)), median(rho) > .5,
            sum(fit$sampler_diagnostics(format = "draws_matrix")[, "divergent__"]) == 0)
  scope$category_levels <- setNames(rep(list("toy"), 6), c(
    "focus_area", "organization_type", "title_group", "location_scope",
    "remote_category", "fiscal_sponsor_category"
  ))
  scope$ea_levels <- c("Functional overlap", "EA-adjacent")
  extracted <- scope$posterior_components(fit, c("expenses", "revenue", "staff"))
  scales <- as.matrix(fit$draws("x_scale", format = "draws_matrix"))
  for (s in seq_along(extracted$x_covariance)) {
    stopifnot(max(abs(diag(extracted$x_covariance[[s]]) - scales[s, ]^2)) < 1e-4,
              abs(cov2cor(extracted$x_covariance[[s]])[1, 2] - rho[s]) < 1e-4)
  }
  cat("Stan correlated-input toy smoke test passed; median expense/revenue correlation:", median(rho), "\n")
}
