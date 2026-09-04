#!/usr/bin/env Rscript

suppressPackageStartupMessages({
  library(cmdstanr)
  library(jsonlite)
  library(mgcv)
})

args <- commandArgs(trailingOnly = TRUE)
quick <- "--quick" %in% args
args <- args[args != "--quick"]
repo <- if (length(args)) normalizePath(args[[1]]) else normalizePath(getwd())
analysis_dir <- file.path(repo, "benchmark", "analysis", "predictive_salary_models")
training_path <- file.path(analysis_dir, "training_data.csv")
metadata_path <- file.path(analysis_dir, "training_metadata.json")
stan_path <- file.path(analysis_dir, "ceo_salary_model.stan")
utils_path <- file.path(analysis_dir, "model_utils.R")
artifact_path <- file.path(analysis_dir, "model_artifact.json")
cv_path <- file.path(analysis_dir, "cross_validation_results.csv")
oof_path <- file.path(analysis_dir, "cross_validation_predictions.csv")
sampler_path <- file.path(analysis_dir, "sampler_diagnostics.csv")

if (!file.exists(training_path)) stop("Missing prepared model data: ", training_path)
if (!file.exists(stan_path)) stop("Missing Stan model: ", stan_path)
if (!file.exists(utils_path)) stop("Missing model utilities: ", utils_path)
source(utils_path, local = TRUE)

set.seed(20260903)
z <- read.csv(training_path, stringsAsFactors = FALSE, check.names = FALSE)
metadata <- fromJSON(metadata_path, simplifyVector = FALSE)
if (nrow(z) != metadata$counts$records) stop("Training-data count does not match metadata")
if (anyDuplicated(z$id)) stop("Predictive-model training IDs are not unique")
required_columns <- c(
  "id", "organization", "organization_group", "source", "observation",
  "salary_midpoint", "salary_lower", "salary_upper", "cash_proxy", "outer_fold"
)
if (!all(required_columns %in% names(z))) stop("Predictive-model training data is missing required columns")
if (any(!nzchar(trimws(z$id))) || any(!nzchar(trimws(z$organization_group)))) {
  stop("Predictive-model training data contains blank IDs or organization groups")
}
allowed_observations <- c("exact_base", "cash_proxy", "interval", "advertised_point")
if (any(!z$source %in% c("filing", "job_ad")) || any(!z$observation %in% allowed_observations)) {
  stop("Predictive-model training data contains an unknown source or observation type")
}
if (any(z$source == "filing" & !z$observation %in% c("exact_base", "cash_proxy")) ||
    any(z$source == "job_ad" & !z$observation %in% c("interval", "advertised_point"))) {
  stop("Predictive-model source and observation types are inconsistent")
}
if (any(!is.finite(z$salary_midpoint) | z$salary_midpoint <= 0) ||
    any(!is.finite(z$salary_lower) | z$salary_lower <= 0) ||
    any(!is.finite(z$salary_upper) | z$salary_upper <= 0) ||
    any(z$salary_lower > z$salary_midpoint | z$salary_midpoint > z$salary_upper)) {
  stop("Predictive-model salary amounts or bounds are invalid")
}
exact_rows <- z$observation == "exact_base"
cash_rows <- z$observation == "cash_proxy"
interval_rows <- z$observation == "interval"
point_rows <- z$observation == "advertised_point"
if (any(exact_rows & (z$salary_lower != z$salary_midpoint | z$salary_upper != z$salary_midpoint)) ||
    any(cash_rows & (!is.finite(z$cash_proxy) | z$cash_proxy <= 0)) ||
    any(interval_rows & z$salary_lower >= z$salary_upper) ||
    any(point_rows & (z$salary_lower != z$salary_midpoint | z$salary_upper != z$salary_midpoint))) {
  stop("Predictive-model observation-specific amount rules failed")
}
if (!identical(sort(unique(z$outer_fold)), 1:10)) stop("Predictive-model outer folds must be exactly 1 through 10")
if (any(tapply(z$outer_fold, z$organization_group, function(x) length(unique(x))) != 1L)) {
  stop("Organization leakage detected across outer folds")
}
z$log_mid <- log(z$salary_midpoint)
z$log_low <- log(z$salary_lower)
z$log_high <- log(z$salary_upper)
z$log_cash <- ifelse(is.finite(z$cash_proxy) & z$cash_proxy > 0, log(z$cash_proxy), NA_real_)

continuous_keys <- c("expenses", "revenue", "staff", "highest_other_base")
missing_indicator_keys <- c("expenses", "revenue", "staff", "highest_other_base")
categorical_keys <- c(
  "focus_area", "organization_type", "title_group", "location_scope",
  "remote_category", "fiscal_sponsor_category"
)
category_levels <- list(
  focus_area = c(
    "AI / technology", "Animal welfare / food", "Climate / environment",
    "Education / public engagement", "Global health / development", "Other focus",
    "Philanthropy / nonprofit support", "Research / evidence", "Security / governance"
  ),
  organization_type = c(
    "Affiliated group", "Fiscal sponsor / umbrella", "Fiscally sponsored project",
    "Independent nonprofit", "Membership / network", "Other organization type"
  ),
  title_group = c("CEO", "Co-leadership", "Executive Director", "Other executive title", "President"),
  location_scope = c("International / multi-country", "Location not reported", "Outside United States", "United States"),
  remote_category = c("In-person / hybrid", "Remote", "Unknown"),
  fiscal_sponsor_category = c("Does not serve as fiscal sponsor", "Serves as fiscal sponsor", "Unknown")
)
for (key in categorical_keys) {
  unexpected <- setdiff(unique(z[[key]]), category_levels[[key]])
  if (length(unexpected)) stop("Unexpected fixed-taxonomy ", key, " level: ", paste(unexpected, collapse = ", "))
}
ea_levels <- c("Functional overlap", "EA-adjacent", "EA-core")
if (!all(z$ea_relationship %in% ea_levels)) stop("Unexpected EA relationship category")

fit_preprocessing <- function(rows) {
  result <- list()
  for (key in continuous_keys) {
    raw <- ifelse(is.finite(rows[[key]]) & rows[[key]] > 0, log(rows[[key]]), NA_real_)
    observed <- raw[is.finite(raw)]
    if (!length(observed)) stop("No observed values for ", key)
    impute <- median(observed)
    center <- mean(observed)
    scale <- sd(observed)
    if (!is.finite(scale) || scale < 1e-8) scale <- 1
    result[[key]] <- list(impute = impute, center = center, scale = scale,
                          minimum = min(observed), maximum = max(observed))
  }
  result
}

transform_continuous <- function(rows, preprocessing) {
  x <- matrix(0, nrow(rows), 8L)
  colnames(x) <- c(
    "log_expenses", "log_revenue", "log_staff", "log_highest_other_base",
    "expenses_missing", "revenue_missing", "staff_missing", "highest_other_base_missing"
  )
  missing_values <- matrix(FALSE, nrow(rows), length(continuous_keys))
  colnames(missing_values) <- continuous_keys
  for (j in seq_along(continuous_keys)) {
    key <- continuous_keys[[j]]
    raw <- ifelse(is.finite(rows[[key]]) & rows[[key]] > 0, log(rows[[key]]), NA_real_)
    missing <- !is.finite(raw)
    missing_values[, j] <- missing
    raw[missing] <- preprocessing[[key]]$center
    x[, j] <- (raw - preprocessing[[key]]$center) / preprocessing[[key]]$scale
    indicator_index <- match(key, missing_indicator_keys)
    if (!is.na(indicator_index)) x[, length(continuous_keys) + indicator_index] <- as.numeric(missing)
  }
  list(X = x, missing = missing_values)
}

category_index <- function(values, levels, key) {
  index <- match(values, levels)
  if (anyNA(index)) stop("Unknown ", key, " level: ", paste(unique(values[is.na(index)]), collapse = ", "))
  as.integer(index)
}

make_design <- function(rows, preprocessing) {
  continuous <- transform_continuous(rows, preprocessing)
  list(
    X = continuous$X,
    missing = continuous$missing,
    focus = category_index(rows$focus_area, category_levels$focus_area, "focus"),
    structure = category_index(rows$organization_type, category_levels$organization_type, "structure"),
    title = category_index(rows$title_group, category_levels$title_group, "title"),
    location = category_index(rows$location_scope, category_levels$location_scope, "location"),
    remote = category_index(rows$remote_category, category_levels$remote_category, "remote"),
    fiscal_sponsor = category_index(
      rows$fiscal_sponsor_category, category_levels$fiscal_sponsor_category, "fiscal sponsor"
    ),
    ea = category_index(rows$ea_relationship, ea_levels, "EA relationship"),
    source = ifelse(rows$source == "job_ad", 2L, 1L)
  )
}

make_stan_data <- function(rows, preprocessing) {
  design <- make_design(rows, preprocessing)
  missing_locations <- which(design$missing, arr.ind = TRUE)
  list(
    N = nrow(rows), K = ncol(design$X), X = design$X,
    N_missing = nrow(missing_locations),
    missing_row = as.integer(missing_locations[, "row"]),
    missing_col = as.integer(missing_locations[, "col"]),
    log_salary_midpoint = rows$log_mid,
    log_salary_lower = rows$log_low,
    log_salary_upper = rows$log_high,
    log_cash_proxy = ifelse(is.finite(rows$log_cash), rows$log_cash, 0),
    has_cash = as.integer(is.finite(rows$log_cash)),
    cash_equals_base = as.integer(
      rows$observation == "exact_base" & is.finite(rows$cash_proxy) &
        abs(rows$cash_proxy - rows$salary_midpoint) < 0.5
    ),
    outcome_type = ifelse(
      rows$observation == "exact_base", 1L,
      ifelse(rows$observation == "cash_proxy", 2L, 3L)
    ),
    is_interval = as.integer(rows$observation == "interval"),
    J_focus = length(category_levels$focus_area),
    J_structure = length(category_levels$organization_type),
    J_title = length(category_levels$title_group),
    J_location = length(category_levels$location_scope),
    J_remote = length(category_levels$remote_category),
    J_fiscal_sponsor = length(category_levels$fiscal_sponsor_category),
    focus = design$focus, structure = design$structure, title_group = design$title,
    location = design$location, remote = design$remote,
    fiscal_sponsor = design$fiscal_sponsor, ea_level = design$ea
  )
}

fit_stan <- function(rows, seed, full = FALSE) {
  preprocessing <- fit_preprocessing(rows)
  stan_data <- make_stan_data(rows, preprocessing)
  if (!exists("compiled_model", inherits = TRUE)) stop("Stan model was not compiled")
  initial_values <- list(
    alpha = mean(rows$log_mid), beta = rep(0, stan_data$K),
    x_missing = rep(0, stan_data$N_missing), ad_offset = 0,
    cash_increment_rate = 10, cash_zero_probability = 0.5,
    sigma = c(0.35, 0.45),
    tau_focus = 0.1, tau_structure = 0.1, tau_title = 0.1, tau_location = 0.1,
    tau_remote = 0.1, tau_fiscal_sponsor = 0.1,
    focus_raw = rep(0, stan_data$J_focus),
    structure_raw = rep(0, stan_data$J_structure),
    title_raw = rep(0, stan_data$J_title),
    location_raw = rep(0, stan_data$J_location),
    remote_raw = rep(0, stan_data$J_remote),
    fiscal_sponsor_raw = rep(0, stan_data$J_fiscal_sponsor),
    ea_increment = c(0.03, 0.03)
  )
  chains <- if (quick) 1L else 4L
  fit <- compiled_model$sample(
    data = stan_data,
    seed = seed,
    chains = chains,
    parallel_chains = chains,
    iter_warmup = if (full && !quick) 800L else if (quick) 80L else 400L,
    iter_sampling = if (full && !quick) 1000L else if (quick) 80L else 500L,
    init = rep(list(initial_values), chains),
    refresh = 0,
    adapt_delta = if (quick) 0.99 else if (full) 0.999 else 0.995,
    max_treedepth = 13,
    show_messages = quick
  )
  list(fit = fit, preprocessing = preprocessing)
}

sampler_diagnostic_summary <- function(fit, max_treedepth = 13L) {
  diagnostics <- fit$sampler_diagnostics(format = "draws_array")
  energies <- diagnostics[, , "energy__", drop = TRUE]
  if (is.null(dim(energies))) energies <- matrix(energies, ncol = 1L)
  ebfmi <- apply(energies, 2L, function(energy) {
    denominator <- var(energy)
    if (!is.finite(denominator) || denominator <= 0) return(NA_real_)
    mean(diff(energy)^2) / denominator
  })
  convergence_variables <- c(
    "alpha", "beta", "x_missing", "ad_offset", "cash_increment_rate",
    "cash_zero_probability", "sigma",
    "tau_focus", "tau_structure", "tau_title", "tau_location", "tau_remote", "tau_fiscal_sponsor",
    "focus_raw", "structure_raw", "title_raw", "location_raw", "remote_raw", "fiscal_sponsor_raw",
    "ea_increment", "focus_effect", "structure_effect", "title_effect", "location_effect",
    "remote_effect", "fiscal_sponsor_effect", "ea_effect"
  )
  convergence <- fit$summary(variables = convergence_variables)
  finite_rhat <- convergence$rhat[is.finite(convergence$rhat)]
  finite_bulk <- convergence$ess_bulk[is.finite(convergence$ess_bulk)]
  finite_tail <- convergence$ess_tail[is.finite(convergence$ess_tail)]
  list(
    chains = dim(diagnostics)[[2]],
    drawsPerChain = dim(diagnostics)[[1]],
    divergences = sum(diagnostics[, , "divergent__"]),
    maxTreedepthHits = sum(diagnostics[, , "treedepth__"] >= max_treedepth),
    minEbfmi = min(ebfmi, na.rm = TRUE),
    maxRhat = if (length(finite_rhat)) max(finite_rhat) else NA_real_,
    minBulkEss = if (length(finite_bulk)) min(finite_bulk) else NA_real_,
    minTailEss = if (length(finite_tail)) min(finite_tail) else NA_real_
  )
}

draw_columns <- function(draws, prefix, count) {
  columns <- paste0(prefix, "[", seq_len(count), "]")
  if (!all(columns %in% colnames(draws))) stop("Missing posterior columns for ", prefix)
  draws[, columns, drop = FALSE]
}

posterior_components <- function(fit) {
  variables <- c(
    "alpha", "beta", "ad_offset", "cash_increment_rate", "cash_zero_probability", "sigma",
    "focus_effect", "structure_effect", "title_effect", "location_effect",
    "remote_effect", "fiscal_sponsor_effect", "ea_effect"
  )
  draws <- as.matrix(fit$draws(variables = variables, format = "draws_matrix"))
  list(
    matrix = draws,
    alpha = as.numeric(draws[, "alpha"]),
    beta = draw_columns(draws, "beta", length(continuous_keys) + length(missing_indicator_keys)),
    ad_offset = as.numeric(draws[, "ad_offset"]),
    cash_increment_rate = as.numeric(draws[, "cash_increment_rate"]),
    cash_zero_probability = as.numeric(draws[, "cash_zero_probability"]),
    sigma = draw_columns(draws, "sigma", 2L),
    focus = draw_columns(draws, "focus_effect", length(category_levels$focus_area)),
    structure = draw_columns(draws, "structure_effect", length(category_levels$organization_type)),
    title = draw_columns(draws, "title_effect", length(category_levels$title_group)),
    location = draw_columns(draws, "location_effect", length(category_levels$location_scope)),
    remote = draw_columns(draws, "remote_effect", length(category_levels$remote_category)),
    fiscal_sponsor = draw_columns(
      draws, "fiscal_sponsor_effect", length(category_levels$fiscal_sponsor_category)
    ),
    ea = draw_columns(draws, "ea_effect", length(ea_levels))
  )
}

posterior_mu <- function(components, design) {
  n <- nrow(design$X)
  d <- length(components$alpha)
  mu <- design$X %*% t(components$beta)
  missing_locations <- which(design$missing, arr.ind = TRUE)
  if (nrow(missing_locations)) {
    for (m in seq_len(nrow(missing_locations))) {
      row_index <- missing_locations[m, "row"]
      column_index <- missing_locations[m, "col"]
      latent_value <- rnorm(d)
      mu[row_index, ] <- mu[row_index, ] + latent_value * components$beta[, column_index]
    }
  }
  mu <- mu + matrix(components$alpha, nrow = n, ncol = d, byrow = TRUE)
  mu <- mu + t(components$focus[, design$focus, drop = FALSE])
  mu <- mu + t(components$structure[, design$structure, drop = FALSE])
  mu <- mu + t(components$title[, design$title, drop = FALSE])
  mu <- mu + t(components$location[, design$location, drop = FALSE])
  mu <- mu + t(components$remote[, design$remote, drop = FALSE])
  mu <- mu + t(components$fiscal_sponsor[, design$fiscal_sponsor, drop = FALSE])
  mu <- mu + t(components$ea[, design$ea, drop = FALSE])
  ad_rows <- design$source == 2L
  if (any(ad_rows)) mu[ad_rows, ] <- mu[ad_rows, , drop = FALSE] +
    matrix(components$ad_offset, nrow = sum(ad_rows), ncol = d, byrow = TRUE)
  mu
}

log_mean_exp <- function(x) {
  maximum <- max(x)
  maximum + log(mean(exp(x - maximum)))
}

evaluate_prediction_draws <- function(test, design, components, seed) {
  set.seed(seed)
  mu <- posterior_mu(components, design)
  sigma <- components$sigma
  n <- nrow(test)
  prediction <- coverage80 <- coverage90 <- log_density <- rep(NA_real_, n)
  lower80 <- upper80 <- lower90 <- upper90 <- rep(NA_real_, n)
  for (i in seq_len(n)) {
    prediction[[i]] <- mean(mu[i, ])
    predictive_sd <- if (test$source[[i]] == "job_ad") sigma[, 2] else sigma[, 1]
    predictive <- rnorm(ncol(mu), mu[i, ], predictive_sd)
    interval80 <- quantile(predictive, c(.1, .9), names = FALSE)
    interval90 <- quantile(predictive, c(.05, .95), names = FALSE)
    lower80[[i]] <- interval80[[1]]
    upper80[[i]] <- interval80[[2]]
    lower90[[i]] <- interval90[[1]]
    upper90[[i]] <- interval90[[2]]
    if (test$observation[[i]] == "exact_base") {
      log_density[[i]] <- log_mean_exp(dnorm(test$log_mid[[i]], mu[i, ], sigma[, 1], log = TRUE))
      coverage80[[i]] <- test$log_mid[[i]] >= interval80[[1]] && test$log_mid[[i]] <= interval80[[2]]
      coverage90[[i]] <- test$log_mid[[i]] >= interval90[[1]] && test$log_mid[[i]] <= interval90[[2]]
    } else if (test$observation[[i]] == "cash_proxy") {
      no_increment <- dnorm(test$log_cash[[i]], mu[i, ], sigma[, 1], log = TRUE)
      positive_increment <- log_exp_mod_normal(
        test$log_cash[[i]], mu[i, ], sigma[, 1], components$cash_increment_rate
      )
      log_density[[i]] <- log_mean_exp(log_sum_exp_pair(
        log(components$cash_zero_probability) + no_increment,
        log1p(-components$cash_zero_probability) + positive_increment
      ))
    } else {
      ad_mu <- mu[i, ]
      if (test$observation[[i]] == "interval") {
        log_density[[i]] <- log_mean_exp(log_interval_probability(
          test$log_low[[i]], test$log_high[[i]], ad_mu, sigma[, 2]
        ))
      } else {
        log_density[[i]] <- log_mean_exp(dnorm(test$log_mid[[i]], ad_mu, sigma[, 2], log = TRUE))
      }
    }
  }
  data.frame(
    id = test$id, organization = test$organization, source = test$source,
    observation = test$observation, fold = test$outer_fold,
    target_scale = "latent_base_salary",
    observed_log_salary = ifelse(test$observation == "cash_proxy", NA_real_, test$log_mid),
    observed_log_cash_proxy = ifelse(test$observation == "cash_proxy", test$log_cash, NA_real_),
    observed_log_lower = ifelse(test$observation == "cash_proxy", NA_real_, test$log_low),
    observed_log_upper = ifelse(test$observation == "cash_proxy", NA_real_, test$log_high),
    predicted_log_salary = prediction,
    predicted_log_lower80 = lower80, predicted_log_upper80 = upper80,
    predicted_log_lower90 = lower90, predicted_log_upper90 = upper90,
    log_predictive_density = log_density, coverage80 = coverage80,
    coverage90 = coverage90, stringsAsFactors = FALSE
  )
}

metrics_from_oof <- function(oof, model_name) {
  exact <- oof[oof$observation == "exact_base", ]
  residual <- exact$observed_log_salary - exact$predicted_log_salary
  denominator <- sum((exact$observed_log_salary - mean(exact$observed_log_salary))^2)
  ad_intervals <- oof[oof$source == "job_ad" & oof$observation == "interval", ]
  ad_points <- oof[oof$source == "job_ad" & oof$observation != "interval", ]
  cash_proxy <- oof[oof$observation == "cash_proxy", ]
  data.frame(
    model = model_name,
    exact_n = nrow(exact),
    cash_proxy_n = sum(oof$observation == "cash_proxy"),
    ad_range_n = nrow(ad_intervals),
    ad_point_n = nrow(ad_points),
    log_rmse = sqrt(mean(residual^2)),
    log_mae = mean(abs(residual)),
    oos_r2 = 1 - sum(residual^2) / denominator,
    median_abs_percent_error = median(abs(exp(-residual) - 1)),
    coverage80 = mean(exact$coverage80, na.rm = TRUE),
    coverage90 = mean(exact$coverage90, na.rm = TRUE),
    cv_elpd = sum(exact$log_predictive_density),
    mean_log_predictive_density = mean(exact$log_predictive_density),
    cash_proxy_mean_log_score = if (nrow(cash_proxy)) mean(cash_proxy$log_predictive_density) else NA_real_,
    ad_interval_mean_log_score = if (nrow(ad_intervals)) mean(ad_intervals$log_predictive_density) else NA_real_,
    ad_point_mean_log_score = if (nrow(ad_points)) mean(ad_points$log_predictive_density) else NA_real_,
    stringsAsFactors = FALSE
  )
}

evaluate_simple_model <- function(kind) {
  output <- list()
  for (fold in sort(unique(z$outer_fold))) {
    training <- z[z$outer_fold != fold & z$observation == "exact_base", ]
    test <- z[z$outer_fold == fold & z$observation == "exact_base", ]
    pp <- fit_preprocessing(training)
    x_train <- transform_continuous(training, pp)$X
    x_test <- transform_continuous(test, pp)$X
    if (kind == "intercept") {
      fit <- lm(training$log_mid ~ 1)
      predicted <- rep(unname(coef(fit)[[1]]), nrow(test))
      sigma <- summary(fit)$sigma
    } else if (kind == "scale_linear") {
      fit <- lm(training$log_mid ~ x_train)
      coefficients <- coef(fit)
      coefficients[!is.finite(coefficients)] <- 0
      predicted <- cbind(1, x_test) %*% coefficients
      sigma <- summary(fit)$sigma
    } else if (kind == "gam") {
      train_frame <- data.frame(y = training$log_mid, x_train)
      test_frame <- data.frame(x_test)
      names(train_frame) <- c(
        "y", "x_expenses", "x_revenue", "x_staff", "x_highest_other",
        "missing_expenses", "missing_revenue", "missing_staff", "missing_highest_other"
      )
      names(test_frame) <- names(train_frame)[-1]
      fit <- gam(y ~ s(x_expenses, k = 4, bs = "cr") + s(x_revenue, k = 4, bs = "cr") +
                   s(x_staff, k = 4, bs = "cr") + s(x_highest_other, k = 4, bs = "cr") +
                   missing_expenses + missing_revenue + missing_staff + missing_highest_other,
                 data = train_frame, method = "REML")
      predicted <- as.numeric(predict(fit, newdata = test_frame, type = "response"))
      sigma <- sqrt(summary(fit)$scale)
    } else stop("Unknown simple model: ", kind)
    lower80 <- predicted + qnorm(.1) * sigma
    upper80 <- predicted + qnorm(.9) * sigma
    lower90 <- predicted + qnorm(.05) * sigma
    upper90 <- predicted + qnorm(.95) * sigma
    output[[length(output) + 1L]] <- data.frame(
      id = test$id, organization = test$organization, source = test$source,
      observation = test$observation, fold = test$outer_fold,
      target_scale = "latent_base_salary",
      observed_log_salary = test$log_mid, observed_log_lower = test$log_low,
      observed_log_upper = test$log_high, observed_log_cash_proxy = NA_real_,
      predicted_log_salary = as.numeric(predicted),
      predicted_log_lower80 = lower80, predicted_log_upper80 = upper80,
      predicted_log_lower90 = lower90, predicted_log_upper90 = upper90,
      log_predictive_density = dnorm(test$log_mid, predicted, sigma, log = TRUE),
      coverage80 = test$log_mid >= lower80 & test$log_mid <= upper80,
      coverage90 = test$log_mid >= lower90 & test$log_mid <= upper90,
      stringsAsFactors = FALSE
    )
  }
  do.call(rbind, output)
}

message("Compiling Bayesian salary model")
compiled_model <- cmdstan_model(stan_path, quiet = TRUE)

oof_sets <- list()
sampler_records <- list()
for (include_ads in c(FALSE, TRUE)) {
  model_name <- if (include_ads) "Bayesian multilevel + ad ranges" else "Bayesian multilevel"
  message("Running grouped 10-fold CV: ", model_name)
  fold_outputs <- list()
  for (fold in sort(unique(z$outer_fold))) {
    training <- z[z$outer_fold != fold & (include_ads | z$source == "filing"), ]
    test <- z[z$outer_fold == fold & (include_ads | z$source == "filing"), ]
    fitted <- fit_stan(training, 20260903 + fold + if (include_ads) 100L else 0L)
    fold_diagnostics <- sampler_diagnostic_summary(fitted$fit)
    sampler_records[[length(sampler_records) + 1L]] <- data.frame(
      phase = "cross_validation", model = model_name, fold = fold,
      chains = fold_diagnostics$chains, draws_per_chain = fold_diagnostics$drawsPerChain,
      divergences = fold_diagnostics$divergences,
      max_treedepth_hits = fold_diagnostics$maxTreedepthHits,
      min_ebfmi = fold_diagnostics$minEbfmi,
      max_rhat = fold_diagnostics$maxRhat,
      min_bulk_ess = fold_diagnostics$minBulkEss,
      min_tail_ess = fold_diagnostics$minTailEss,
      stringsAsFactors = FALSE
    )
    design <- make_design(test, fitted$preprocessing)
    fold_outputs[[length(fold_outputs) + 1L]] <- evaluate_prediction_draws(
      test, design, posterior_components(fitted$fit), 20261903 + fold + if (include_ads) 100L else 0L
    )
    message("  completed fold ", fold, "/10")
  }
  oof_sets[[model_name]] <- do.call(rbind, fold_outputs)
}

message("Running grouped 10-fold CV: simple baselines and GAM")
oof_sets[["Intercept only"]] <- evaluate_simple_model("intercept")
oof_sets[["Scale linear"]] <- evaluate_simple_model("scale_linear")
oof_sets[["Numeric-input GAM"]] <- evaluate_simple_model("gam")

comparison <- do.call(rbind, lapply(names(oof_sets), function(name) metrics_from_oof(oof_sets[[name]], name)))
comparison <- comparison[match(c("Intercept only", "Scale linear", "Numeric-input GAM", "Bayesian multilevel", "Bayesian multilevel + ad ranges"), comparison$model), ]
write.csv(comparison, cv_path, row.names = FALSE)
oof_export <- do.call(rbind, lapply(names(oof_sets), function(name) transform(oof_sets[[name]], model = name)))
write.csv(oof_export, oof_path, row.names = FALSE)

message("Fitting full Bayesian models")
full_bayesian <- fit_stan(z[z$source == "filing", ], 20262903, full = TRUE)
full_bayesian_ads <- fit_stan(z, 20263903, full = TRUE)
for (model_name in c("Bayesian multilevel", "Bayesian multilevel + ad ranges")) {
  fitted <- if (model_name == "Bayesian multilevel") full_bayesian else full_bayesian_ads
  full_diagnostics <- sampler_diagnostic_summary(fitted$fit)
  sampler_records[[length(sampler_records) + 1L]] <- data.frame(
    phase = "full", model = model_name, fold = NA_integer_,
    chains = full_diagnostics$chains, draws_per_chain = full_diagnostics$drawsPerChain,
    divergences = full_diagnostics$divergences,
    max_treedepth_hits = full_diagnostics$maxTreedepthHits,
    min_ebfmi = full_diagnostics$minEbfmi,
    max_rhat = full_diagnostics$maxRhat,
    min_bulk_ess = full_diagnostics$minBulkEss,
    min_tail_ess = full_diagnostics$minTailEss,
    stringsAsFactors = FALSE
  )
}
sampler_table <- do.call(rbind, sampler_records)
write.csv(sampler_table, sampler_path, row.names = FALSE)

message("Fitting full GAM")
exact <- z[z$observation == "exact_base", ]
gam_pp <- fit_preprocessing(exact)
gam_x <- transform_continuous(exact, gam_pp)$X
gam_frame <- data.frame(y = exact$log_mid, gam_x)
names(gam_frame) <- c(
  "y", "x_expenses", "x_revenue", "x_staff", "x_highest_other",
  "missing_expenses", "missing_revenue", "missing_staff", "missing_highest_other"
)
gam_fit <- gam(y ~ s(x_expenses, k = 4, bs = "cr") + s(x_revenue, k = 4, bs = "cr") +
                 s(x_staff, k = 4, bs = "cr") + s(x_highest_other, k = 4, bs = "cr") +
                 missing_expenses + missing_revenue + missing_staff + missing_highest_other,
               data = gam_frame, method = "REML")
gam_zero <- data.frame(
  x_expenses = 0, x_revenue = 0, x_staff = 0, x_highest_other = 0,
  missing_expenses = 0, missing_revenue = 0, missing_staff = 0, missing_highest_other = 0
)
gam_baseline <- as.numeric(predict(gam_fit, gam_zero, type = "response"))
gam_effects <- list()
gam_effect_keys <- c("expenses", "revenue", "staff", "highestOther")
gam_effect_columns <- c("x_expenses", "x_revenue", "x_staff", "x_highest_other")
for (j in seq_along(gam_effect_keys)) {
  key <- gam_effect_keys[[j]]
  column <- gam_effect_columns[[j]]
  support <- range(c(-3.5, 3.5, gam_x[, j]), finite = TRUE)
  grid_points <- max(141L, ceiling(diff(support) / 0.05) + 1L)
  values <- seq(support[[1]], support[[2]], length.out = grid_points)
  grid <- gam_zero[rep(1, length(values)), ]
  grid[[column]] <- values
  gam_effects[[key]] <- list(
    z = values,
    effect = as.numeric(predict(gam_fit, grid, type = "response") - gam_baseline)
  )
}
gam_oof <- oof_sets[["Numeric-input GAM"]]
gam_residuals <- gam_oof$observed_log_salary - gam_oof$predicted_log_salary

json_preprocessing <- function(preprocessing) {
  lapply(names(preprocessing), function(key) {
    item <- preprocessing[[key]]
    raw_min <- exp(item$minimum)
    raw_max <- exp(item$maximum)
    list(key = key, center = item$center, scale = item$scale, impute = item$impute,
         minimum = raw_min, maximum = raw_max, transform = "log")
  })
}

thin_components <- function(fitted, include_ads, maximum_draws = if (quick) 80L else 512L) {
  components <- posterior_components(fitted$fit)
  total <- length(components$alpha)
  keep <- unique(round(seq(1, total, length.out = min(total, maximum_draws))))
  set.seed(if (include_ads) 20264903 else 20265903)
  summary_table <- fitted$fit$summary(variables = c(
    "alpha", "beta", "x_missing", "ad_offset", "cash_increment_rate",
    "cash_zero_probability", "sigma",
    "tau_focus", "tau_structure", "tau_title", "tau_location", "tau_remote", "tau_fiscal_sponsor",
    "focus_raw", "structure_raw", "title_raw", "location_raw", "remote_raw", "fiscal_sponsor_raw",
    "ea_increment", "focus_effect", "structure_effect", "title_effect", "location_effect",
    "remote_effect", "fiscal_sponsor_effect", "ea_effect"
  ))
  sampler <- sampler_diagnostic_summary(fitted$fit)
  list(
    includeAdvertisedRanges = include_ads,
    preprocessing = json_preprocessing(fitted$preprocessing),
    draws = list(
      alpha = unname(components$alpha[keep]),
      beta = unname(components$beta[keep, , drop = FALSE]),
      adOffset = unname(components$ad_offset[keep]),
      sigma = unname(components$sigma[keep, , drop = FALSE]),
      focus = unname(components$focus[keep, , drop = FALSE]),
      organizationType = unname(components$structure[keep, , drop = FALSE]),
      title = unname(components$title[keep, , drop = FALSE]),
      location = unname(components$location[keep, , drop = FALSE]),
      remote = unname(components$remote[keep, , drop = FALSE]),
      fiscalSponsor = unname(components$fiscal_sponsor[keep, , drop = FALSE]),
      ea = unname(components$ea[keep, , drop = FALSE]),
      residualZ = rnorm(length(keep))
    ),
    diagnostics = list(
      posteriorDraws = length(keep),
      chains = sampler$chains,
      drawsPerChain = sampler$drawsPerChain,
      maxRhat = max(summary_table$rhat, na.rm = TRUE),
      minBulkEss = min(summary_table$ess_bulk, na.rm = TRUE),
      minTailEss = min(summary_table$ess_tail, na.rm = TRUE),
      divergences = sampler$divergences,
      maxTreedepthHits = sampler$maxTreedepthHits,
      minEbfmi = sampler$minEbfmi,
      cashZeroProbabilityMedian = median(components$cash_zero_probability),
      positiveCashLogIncrementMedian = median(log(2) / components$cash_increment_rate)
    )
  )
}

comparison_json <- lapply(seq_len(nrow(comparison)), function(i) {
  row <- comparison[i, ]
  list(
    key = c("intercept", "linear", "gam", "bayesian", "bayesian_ranges")[[i]],
    label = row$model,
    exactN = row$exact_n,
    advertisedRangeN = row$ad_range_n,
    advertisedPointN = row$ad_point_n,
    cashProxyN = row$cash_proxy_n,
    logRmse = row$log_rmse,
    logMae = row$log_mae,
    oosR2 = row$oos_r2,
    medianAbsPercentError = row$median_abs_percent_error,
    coverage80 = row$coverage80,
    coverage90 = row$coverage90,
    cvElpd = row$cv_elpd,
    meanLogPredictiveDensity = row$mean_log_predictive_density,
    cashProxyMeanLogScore = if (is.na(row$cash_proxy_mean_log_score)) NA_real_ else row$cash_proxy_mean_log_score,
    advertisedIntervalMeanLogScore = if (is.na(row$ad_interval_mean_log_score)) NA_real_ else row$ad_interval_mean_log_score,
    advertisedPointMeanLogScore = if (is.na(row$ad_point_mean_log_score)) NA_real_ else row$ad_point_mean_log_score
  )
})

category_schema <- lapply(categorical_keys, function(key) {
  levels <- category_levels[[key]]
  list(
    key = key,
    levels = unname(levels),
    counts = unname(as.integer(table(factor(z[[key]], levels = levels)))),
    exactCounts = unname(as.integer(table(factor(exact[[key]], levels = levels))))
  )
})
names(category_schema) <- NULL

artifact <- list(
  schemaVersion = 2,
  production = !quick,
  fitConfiguration = list(
    cvChains = if (quick) 1L else 4L,
    cvWarmupPerChain = if (quick) 80L else 400L,
    cvSamplingPerChain = if (quick) 80L else 500L,
    fullChains = if (quick) 1L else 4L,
    fullWarmupPerChain = if (quick) 80L else 800L,
    fullSamplingPerChain = if (quick) 80L else 1000L,
    exportedPosteriorDraws = if (quick) 80L else 512L
  ),
  generatedAt = format(Sys.time(), "%Y-%m-%dT%H:%M:%SZ", tz = "UTC"),
  target = "July 2026-adjusted annual CEO base salary",
  responseScale = "natural logarithm of positive annual USD",
  training = list(
    exactFilings = nrow(exact), cashProxyFilings = sum(z$observation == "cash_proxy"),
    advertisedRecords = sum(z$source == "job_ad"),
    advertisedRanges = sum(z$observation == "interval"),
    organizations = length(unique(z$organization_group)),
    rpExcluded = TRUE,
    cohort = "All reviewed positive annual organization-leadership records",
    foldRule = metadata$foldRule,
    records = lapply(seq_len(nrow(z)), function(i) list(
      id = z$id[[i]], organization = z$organization[[i]], source = z$source[[i]],
      observation = z$observation[[i]]
    ))
  ),
  rpProfile = metadata$rpProfile,
  continuousFeatures = list(
    list(key = "expenses", label = "Annual expenses", unit = "USD"),
    list(key = "revenue", label = "Annual revenue", unit = "USD"),
    list(key = "staff", label = "Employees", unit = "people"),
    list(key = "highest_other_base", label = "Non-CEO highest reported base pay", unit = "USD")
  ),
  categoricalFeatures = category_schema,
  eaLevels = ea_levels,
  eaCounts = unname(as.integer(table(factor(z$ea_relationship, levels = ea_levels)))),
  eaExactCounts = unname(as.integer(table(factor(exact$ea_relationship, levels = ea_levels)))),
  exclusions = list(
    "Peer group and similarity score are excluded because they are RP-relative judgments built from overlapping inputs.",
    "Partial-year, transition, part-time, unresolved-measurement, and nonpositive records are excluded because they do not share the annual organization-leadership-pay target.",
    "Missing continuous inputs are estimated as latent standardized values rather than filled with a single fixed number.",
    "Cash-only filing observations (Form 990 Part VII and one Form 990-EZ officer-compensation record) inform latent base pay through a separately estimated cash-to-base measurement model; they are never relabeled as base salary.",
    "Remote-work and fiscal-sponsor categories reflect reviewed current status, which can differ from status in older compensation years; their effects are descriptive rather than causal.",
    "Advertised policy ranges are experimental evidence about a role's intended pay, not classical censoring intervals for realized incumbent compensation.",
    "RP compensation is displayed only as a reference and is never a training outcome."
  ),
  validationDiagnostics = list(
    crossValidationFits = sum(sampler_table$phase == "cross_validation"),
    crossValidationDivergences = sum(sampler_table$divergences[sampler_table$phase == "cross_validation"]),
    crossValidationMaxTreedepthHits = sum(sampler_table$max_treedepth_hits[sampler_table$phase == "cross_validation"]),
    crossValidationMinEbfmi = min(sampler_table$min_ebfmi[sampler_table$phase == "cross_validation"], na.rm = TRUE),
    crossValidationMaxRhat = max(sampler_table$max_rhat[sampler_table$phase == "cross_validation"], na.rm = TRUE),
    crossValidationMinBulkEss = min(sampler_table$min_bulk_ess[sampler_table$phase == "cross_validation"], na.rm = TRUE),
    crossValidationMinTailEss = min(sampler_table$min_tail_ess[sampler_table$phase == "cross_validation"], na.rm = TRUE)
  ),
  comparison = comparison_json,
  models = list(
    bayesian = thin_components(full_bayesian, FALSE),
    bayesianRanges = thin_components(full_bayesian_ads, TRUE),
    gam = list(
      includeAdvertisedRanges = FALSE,
      preprocessing = json_preprocessing(gam_pp),
      baseline = gam_baseline,
      effects = gam_effects,
      residuals = unname(gam_residuals),
      diagnostics = list(edf = sum(gam_fit$edf), scale = sqrt(summary(gam_fit)$scale))
    )
  ),
  method = list(
    bayesian = "Multilevel normal model for log base salary with signed regularized scale and non-CEO-pay slopes; multilevel focus, type, title, location, remote-work, and fiscal-sponsor effects; ordered cumulative EA increments; latent missing continuous inputs; and distinct cash-proxy and posting measurement models. Advertised salaries enter through an interval likelihood.",
    gam = "Low-complexity additive smooths for log expenses, revenue, staff, and non-CEO highest reported base pay, with fold-specific centering and missing-value indicators. Predictive uncertainty uses organization-grouped out-of-fold residuals; cash-only records, advertised ranges, and categorical profile fields are not used.",
    validation = "One deterministic organization-grouped 10-fold cross-validation. Every transform is estimated inside its training fold; filing and posting records with the same normalized organization name never cross folds."
  ),
  provenance = c(
    list(trainingInputSha256 = metadata$trainingInputSha256),
    metadata$provenance,
    list(
      seed = metadata$seed,
      rVersion = R.version.string,
      cmdstanVersion = as.character(cmdstan_version()),
      packageVersions = list(
        cmdstanr = as.character(packageVersion("cmdstanr")),
        jsonlite = as.character(packageVersion("jsonlite")),
        mgcv = as.character(packageVersion("mgcv"))
      ),
      samplerDiagnosticsPath = "benchmark/analysis/predictive_salary_models/sampler_diagnostics.csv"
    )
  )
)

write_json(artifact, artifact_path, auto_unbox = TRUE, pretty = TRUE, digits = 7, na = "null")
message("Wrote ", artifact_path)
print(comparison[, c("model", "exact_n", "ad_range_n", "ad_point_n", "log_rmse", "oos_r2", "median_abs_percent_error", "coverage90", "mean_log_predictive_density", "ad_interval_mean_log_score", "ad_point_mean_log_score")])
