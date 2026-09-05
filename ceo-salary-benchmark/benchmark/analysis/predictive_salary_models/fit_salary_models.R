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
# Historical derived training CSVs can predate the two-level EA taxonomy. Keep
# their source labels archived, but collapse the retired analytical category at
# model ingress so an old CSV cannot reintroduce a third effect.
z$ea_relationship[tolower(trimws(z$ea_relationship)) %in% c("ea-core", "ea core")] <- "EA-adjacent"
metadata <- fromJSON(metadata_path, simplifyVector = FALSE)
if (tolower(trimws(metadata$rpProfile$ea_relationship)) %in% c("ea-core", "ea core")) {
  metadata$rpProfile$ea_relationship <- "EA-adjacent"
}
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
feature_keys_for <- function(include_highest_other_pay) {
  if (isTRUE(include_highest_other_pay)) continuous_keys else continuous_keys[continuous_keys != "highest_other_base"]
}

design_columns_for <- function(feature_keys) {
  c(paste0("log_", feature_keys), paste0(feature_keys, "_missing"))
}
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
ea_levels <- c("Functional overlap", "EA-adjacent")
if (!all(z$ea_relationship %in% ea_levels)) stop("Unexpected EA relationship category")

fit_preprocessing <- function(rows, feature_keys) {
  result <- list()
  for (key in feature_keys) {
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

transform_continuous <- function(rows, preprocessing, feature_keys) {
  x <- matrix(0, nrow(rows), 2L * length(feature_keys))
  colnames(x) <- design_columns_for(feature_keys)
  missing_values <- matrix(FALSE, nrow(rows), length(feature_keys))
  colnames(missing_values) <- feature_keys
  for (j in seq_along(feature_keys)) {
    key <- feature_keys[[j]]
    raw <- ifelse(is.finite(rows[[key]]) & rows[[key]] > 0, log(rows[[key]]), NA_real_)
    missing <- !is.finite(raw)
    missing_values[, j] <- missing
    raw[missing] <- preprocessing[[key]]$center
    x[, j] <- (raw - preprocessing[[key]]$center) / preprocessing[[key]]$scale
    x[, length(feature_keys) + j] <- as.numeric(missing)
  }
  list(X = x, missing = missing_values)
}

category_index <- function(values, levels, key) {
  index <- match(values, levels)
  if (anyNA(index)) stop("Unknown ", key, " level: ", paste(unique(values[is.na(index)]), collapse = ", "))
  as.integer(index)
}

make_design <- function(rows, preprocessing, feature_keys) {
  continuous <- transform_continuous(rows, preprocessing, feature_keys)
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

make_stan_data <- function(rows, preprocessing, feature_keys) {
  design <- make_design(rows, preprocessing, feature_keys)
  missing_locations <- which(design$missing, arr.ind = TRUE)
  list(
    N = nrow(rows), K = ncol(design$X), P = length(feature_keys), X = design$X,
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
    J_ea = length(ea_levels),
    focus = design$focus, structure = design$structure, title_group = design$title,
    location = design$location, remote = design$remote,
    fiscal_sponsor = design$fiscal_sponsor, ea_level = design$ea
  )
}

fit_stan <- function(rows, seed, include_highest_other_pay, full = FALSE) {
  feature_keys <- feature_keys_for(include_highest_other_pay)
  preprocessing <- fit_preprocessing(rows, feature_keys)
  stan_data <- make_stan_data(rows, preprocessing, feature_keys)
  if (!exists("compiled_model", inherits = TRUE)) stop("Stan model was not compiled")
  initial_values <- list(
    alpha = mean(rows$log_mid), beta = rep(0, stan_data$K),
    x_missing = rep(0, stan_data$N_missing), ad_offset = 0,
    x_location = rep(0, stan_data$P), x_scale = rep(1, stan_data$P),
    x_cholesky = diag(stan_data$P),
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
    ea_increment = rep(0.03, stan_data$J_ea - 1L)
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
  list(
    fit = fit, preprocessing = preprocessing, feature_keys = feature_keys,
    include_highest_other_pay = isTRUE(include_highest_other_pay),
    n_missing = stan_data$N_missing
  )
}

sampler_diagnostic_summary <- function(fit, n_missing, max_treedepth = 13L) {
  diagnostics <- fit$sampler_diagnostics(format = "draws_array")
  energies <- diagnostics[, , "energy__", drop = TRUE]
  if (is.null(dim(energies))) energies <- matrix(energies, ncol = 1L)
  ebfmi <- apply(energies, 2L, function(energy) {
    denominator <- var(energy)
    if (!is.finite(denominator) || denominator <= 0) return(NA_real_)
    mean(diff(energy)^2) / denominator
  })
  convergence_variables <- c(
    "x_location", "x_scale", "x_cholesky",
    "alpha", "beta", if (n_missing > 0L) "x_missing", "ad_offset", "cash_increment_rate",
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

posterior_components <- function(fit, feature_keys) {
  variables <- c(
    "x_location", "x_cov_cholesky",
    "alpha", "beta", "ad_offset", "cash_increment_rate", "cash_zero_probability", "sigma",
    "focus_effect", "structure_effect", "title_effect", "location_effect",
    "remote_effect", "fiscal_sponsor_effect", "ea_effect"
  )
  draws <- as.matrix(fit$draws(variables = variables, format = "draws_matrix"))
  p <- length(feature_keys)
  covariance_columns <- unlist(lapply(seq_len(p), function(j) paste0("x_cov_cholesky[", seq_len(p), ",", j, "]")))
  covariance_draws <- draws[, covariance_columns, drop = FALSE]
  list(
    matrix = draws,
    x_location = draw_columns(draws, "x_location", p),
    x_covariance = lapply(seq_len(nrow(draws)), function(i) tcrossprod(matrix(covariance_draws[i, ], p, p))),
    alpha = as.numeric(draws[, "alpha"]),
    beta = draw_columns(draws, "beta", 2L * length(feature_keys)),
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
  for (i in which(rowSums(design$missing) > 0)) {
    missing <- design$missing[i, ]
    columns <- which(missing)
    for (s in seq_len(d)) {
      conditional <- conditional_missing_normal(
        design$X[i, seq_along(missing)], missing,
        components$x_location[s, ], components$x_covariance[[s]]
      )
      latent <- conditional$mean + as.numeric(t(chol(conditional$covariance)) %*% rnorm(length(columns)))
      mu[i, s] <- mu[i, s] + sum((latent - design$X[i, columns]) * components$beta[s, columns])
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

select_estimable_columns <- function(x, tolerance = 1e-8) {
  if (!ncol(x)) return(character())
  selected <- character()
  current <- matrix(1, nrow(x), 1L)
  current_rank <- qr(current, tol = tolerance)$rank
  for (column in colnames(x)) {
    values <- x[, column]
    if (any(!is.finite(values)) || diff(range(values)) <= tolerance) next
    candidate <- cbind(current, values)
    candidate_rank <- qr(candidate, tol = tolerance)$rank
    if (candidate_rank > current_rank) {
      selected <- c(selected, column)
      current <- candidate
      current_rank <- candidate_rank
    }
  }
  selected
}

fit_linear_design <- function(y, x) {
  active_columns <- select_estimable_columns(x)
  design <- cbind("(Intercept)" = 1, x[, active_columns, drop = FALSE])
  fitted <- lm.fit(design, y)
  coefficients <- unname(fitted$coefficients)
  if (length(coefficients) != ncol(design) || any(!is.finite(coefficients))) {
    stop("Scale-linear fit produced non-finite coefficients after explicit rank filtering")
  }
  if (fitted$df.residual < 1L) stop("Scale-linear fit has no residual degrees of freedom")
  list(
    coefficients = coefficients,
    active_columns = active_columns,
    dropped_columns = setdiff(colnames(x), active_columns),
    rank = fitted$rank,
    sigma = sqrt(sum(fitted$residuals^2) / fitted$df.residual)
  )
}

predict_linear_design <- function(fitted, x) {
  design <- cbind("(Intercept)" = 1, x[, fitted$active_columns, drop = FALSE])
  as.numeric(design %*% fitted$coefficients)
}

fit_gam_design <- function(y, x, feature_keys) {
  value_columns <- paste0("log_", feature_keys)
  if (any(vapply(value_columns, function(column) length(unique(x[, column])) < 4L, logical(1)))) {
    stop("GAM continuous input has fewer than four distinct standardized values")
  }
  missing_columns <- paste0(feature_keys, "_missing")
  active_missing <- missing_columns[vapply(
    missing_columns, function(column) length(unique(x[, column])) > 1L, logical(1)
  )]
  formula_terms <- c(
    paste0("s(", value_columns, ", k = 4, bs = 'cr')"),
    active_missing
  )
  frame <- data.frame(y = y, x, check.names = FALSE)
  fitted <- gam(as.formula(paste("y ~", paste(formula_terms, collapse = " + "))), data = frame, method = "REML")
  if (any(!is.finite(coef(fitted)))) stop("GAM fit produced non-finite coefficients")
  list(
    fit = fitted,
    value_columns = value_columns,
    active_missing_columns = active_missing,
    dropped_missing_columns = setdiff(missing_columns, active_missing)
  )
}

predict_simple_model <- function(training, test, kind, feature_keys) {
    if (kind == "intercept") {
      fit <- lm(training$log_mid ~ 1)
      predicted <- rep(unname(coef(fit)[[1]]), nrow(test))
      sigma <- summary(fit)$sigma
    } else {
      pp <- fit_preprocessing(training, feature_keys)
      x_train <- transform_continuous(training, pp, feature_keys)$X
      x_test <- transform_continuous(test, pp, feature_keys)$X
      if (kind == "scale_linear") {
        fit <- fit_linear_design(training$log_mid, x_train)
        predicted <- predict_linear_design(fit, x_test)
        sigma <- fit$sigma
      } else if (kind == "gam") {
        fit <- fit_gam_design(training$log_mid, x_train, feature_keys)
        predicted <- as.numeric(predict(fit$fit, newdata = data.frame(x_test), type = "response"))
        sigma <- sqrt(summary(fit$fit)$scale)
      } else stop("Unknown simple model: ", kind)
    }
    as.numeric(predicted)
}

evaluate_simple_model <- function(kind, include_highest_other_pay = FALSE) {
  feature_keys <- feature_keys_for(include_highest_other_pay)
  output <- list()
  for (fold in sort(unique(z$outer_fold))) {
    training <- z[z$outer_fold != fold & z$observation == "exact_base", ]
    test <- z[z$outer_fold == fold & z$observation == "exact_base", ]
    predicted <- predict_simple_model(training, test, kind, feature_keys)
    # Inner fits and residuals must exclude the entire outer test fold.
    calibration <- unlist(lapply(sort(unique(training$outer_fold)), function(inner_fold) {
      inner_test <- training[training$outer_fold == inner_fold, ]
      inner_train <- training[training$outer_fold != inner_fold, ]
      inner_test$log_mid - predict_simple_model(inner_train, inner_test, kind, feature_keys)
    }), use.names = FALSE)
    bounds <- residual_quantiles(calibration, c(.05, .1, .9, .95))
    lower80 <- predicted + bounds[[2]]
    upper80 <- predicted + bounds[[3]]
    lower90 <- predicted + bounds[[1]]
    upper90 <- predicted + bounds[[4]]
    bandwidth <- residual_bandwidth(calibration)
    log_density <- vapply(test$log_mid - predicted, function(residual) {
      log_mean_exp(dnorm(residual, calibration, bandwidth, log = TRUE))
    }, numeric(1))
    output[[length(output) + 1L]] <- data.frame(
      id = test$id, organization = test$organization, source = test$source,
      observation = test$observation, fold = test$outer_fold,
      target_scale = "latent_base_salary",
      observed_log_salary = test$log_mid, observed_log_lower = test$log_low,
      observed_log_upper = test$log_high, observed_log_cash_proxy = NA_real_,
      predicted_log_salary = as.numeric(predicted),
      predicted_log_lower80 = lower80, predicted_log_upper80 = upper80,
      predicted_log_lower90 = lower90, predicted_log_upper90 = upper90,
      log_predictive_density = log_density,
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
bayesian_specs <- list(
  list(name = "Bayesian multilevel · without other pay", include_ads = FALSE, include_highest = FALSE, seed_offset = 0L),
  list(name = "Bayesian multilevel · with other pay", include_ads = FALSE, include_highest = TRUE, seed_offset = 100L),
  list(name = "Bayesian multilevel + ad ranges · without other pay", include_ads = TRUE, include_highest = FALSE, seed_offset = 200L),
  list(name = "Bayesian multilevel + ad ranges · with other pay", include_ads = TRUE, include_highest = TRUE, seed_offset = 300L)
)
for (spec in bayesian_specs) {
  include_ads <- spec$include_ads
  include_highest <- spec$include_highest
  model_name <- spec$name
  message("Running grouped 10-fold CV: ", model_name)
  fold_outputs <- list()
  for (fold in sort(unique(z$outer_fold))) {
    training <- z[z$outer_fold != fold & (include_ads | z$source == "filing"), ]
    test <- z[z$outer_fold == fold & (include_ads | z$source == "filing"), ]
    fitted <- fit_stan(
      training, 20260903 + fold + spec$seed_offset,
      include_highest_other_pay = include_highest
    )
    fold_diagnostics <- sampler_diagnostic_summary(fitted$fit, fitted$n_missing)
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
    design <- make_design(test, fitted$preprocessing, fitted$feature_keys)
    fold_outputs[[length(fold_outputs) + 1L]] <- evaluate_prediction_draws(
      test, design, posterior_components(fitted$fit, fitted$feature_keys),
      20261903 + fold + spec$seed_offset
    )
    message("  completed fold ", fold, "/10")
  }
  oof_sets[[model_name]] <- do.call(rbind, fold_outputs)
}

message("Running grouped 10-fold CV: simple baselines and GAM")
oof_sets[["Intercept only"]] <- evaluate_simple_model("intercept")
oof_sets[["Scale linear · without other pay"]] <- evaluate_simple_model("scale_linear", FALSE)
oof_sets[["Scale linear · with other pay"]] <- evaluate_simple_model("scale_linear", TRUE)
oof_sets[["Numeric-input GAM · without other pay"]] <- evaluate_simple_model("gam", FALSE)
oof_sets[["Numeric-input GAM · with other pay"]] <- evaluate_simple_model("gam", TRUE)

comparison <- do.call(rbind, lapply(names(oof_sets), function(name) metrics_from_oof(oof_sets[[name]], name)))
comparison_order <- c(
  "Intercept only",
  "Scale linear · without other pay", "Scale linear · with other pay",
  "Numeric-input GAM · without other pay", "Numeric-input GAM · with other pay",
  "Bayesian multilevel · without other pay", "Bayesian multilevel · with other pay",
  "Bayesian multilevel + ad ranges · without other pay",
  "Bayesian multilevel + ad ranges · with other pay"
)
comparison <- comparison[match(comparison_order, comparison$model), ]
write.csv(comparison, cv_path, row.names = FALSE)
oof_export <- do.call(rbind, lapply(names(oof_sets), function(name) transform(oof_sets[[name]], model = name)))
write.csv(oof_export, oof_path, row.names = FALSE)

message("Fitting full Bayesian models")
full_bayesian_no_highest <- fit_stan(
  z[z$source == "filing", ], 20262903, include_highest_other_pay = FALSE, full = TRUE
)
full_bayesian <- fit_stan(
  z[z$source == "filing", ], 20263003, include_highest_other_pay = TRUE, full = TRUE
)
full_bayesian_ads_no_highest <- fit_stan(
  z, 20263903, include_highest_other_pay = FALSE, full = TRUE
)
full_bayesian_ads <- fit_stan(
  z, 20264003, include_highest_other_pay = TRUE, full = TRUE
)
full_bayesian_fits <- list(
  "Bayesian multilevel · without other pay" = full_bayesian_no_highest,
  "Bayesian multilevel · with other pay" = full_bayesian,
  "Bayesian multilevel + ad ranges · without other pay" = full_bayesian_ads_no_highest,
  "Bayesian multilevel + ad ranges · with other pay" = full_bayesian_ads
)
for (model_name in names(full_bayesian_fits)) {
  fitted <- full_bayesian_fits[[model_name]]
  full_diagnostics <- sampler_diagnostic_summary(fitted$fit, fitted$n_missing)
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

message("Fitting full deterministic comparison models and GAM")
exact <- z[z$observation == "exact_base", ]
filing <- z[z$source == "filing", ]

validate_simple_oof <- function(oof, label) {
  if (nrow(oof) != nrow(exact) || anyDuplicated(oof$id) || !setequal(oof$id, exact$id)) {
    stop(label, " out-of-fold residuals do not cover the exact-filing cohort exactly once")
  }
  residuals <- oof$observed_log_salary - oof$predicted_log_salary
  if (any(!is.finite(residuals))) stop(label, " out-of-fold residuals are not finite")
  list(ids = unname(oof$id), residuals = unname(residuals))
}

intercept_fit <- lm(log_mid ~ 1, data = exact)
intercept_baseline <- unname(coef(intercept_fit)[[1]])
intercept_oof <- validate_simple_oof(oof_sets[["Intercept only"]], "Intercept-only")

fit_full_linear <- function(include_highest_other_pay) {
  feature_keys <- feature_keys_for(include_highest_other_pay)
  preprocessing <- fit_preprocessing(exact, feature_keys)
  x <- transform_continuous(exact, preprocessing, feature_keys)$X
  fitted <- fit_linear_design(exact$log_mid, x)
  oof_name <- if (include_highest_other_pay) {
    "Scale linear · with other pay"
  } else {
    "Scale linear · without other pay"
  }
  oof <- validate_simple_oof(oof_sets[[oof_name]], oof_name)
  list(
    include_highest_other_pay = include_highest_other_pay,
    feature_keys = feature_keys, preprocessing = preprocessing, x = x,
    fitted = fitted, oof = oof
  )
}

fit_full_gam <- function(include_highest_other_pay) {
  feature_keys <- feature_keys_for(include_highest_other_pay)
  preprocessing <- fit_preprocessing(exact, feature_keys)
  x <- transform_continuous(exact, preprocessing, feature_keys)$X
  fitted <- fit_gam_design(exact$log_mid, x, feature_keys)
  zero <- as.data.frame(as.list(setNames(rep(0, ncol(x)), colnames(x))))
  baseline <- as.numeric(predict(fitted$fit, zero, type = "response"))
  effects <- list()
  effect_names <- c(
    expenses = "expenses", revenue = "revenue", staff = "staff",
    highest_other_base = "highestOther"
  )
  for (key in feature_keys) {
    column <- paste0("log_", key)
    support <- range(c(-3.5, 3.5, x[, column]), finite = TRUE)
    grid_points <- max(141L, ceiling(diff(support) / 0.05) + 1L)
    values <- seq(support[[1]], support[[2]], length.out = grid_points)
    grid <- zero[rep(1, length(values)), , drop = FALSE]
    grid[[column]] <- values
    effects[[effect_names[[key]]]] <- list(
      z = values,
      effect = as.numeric(predict(fitted$fit, grid, type = "response") - baseline)
    )
  }
  oof_name <- if (include_highest_other_pay) {
    "Numeric-input GAM · with other pay"
  } else {
    "Numeric-input GAM · without other pay"
  }
  oof_rows <- oof_sets[[oof_name]]
  oof <- validate_simple_oof(oof_rows, oof_name)
  list(
    include_highest_other_pay = include_highest_other_pay,
    feature_keys = feature_keys, preprocessing = preprocessing, x = x,
    fitted = fitted, baseline = baseline, effects = effects, oof = oof
  )
}

linear_no_highest <- fit_full_linear(FALSE)
linear_with_highest <- fit_full_linear(TRUE)
gam_no_highest <- fit_full_gam(FALSE)
gam_with_highest <- fit_full_gam(TRUE)

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
  components <- posterior_components(fitted$fit, fitted$feature_keys)
  total <- length(components$alpha)
  keep <- unique(round(seq(1, total, length.out = min(total, maximum_draws))))
  set.seed(if (include_ads) 20264903 else 20265903)
  summary_table <- fitted$fit$summary(variables = c(
    "x_location", "x_scale", "x_cholesky",
    "alpha", "beta", if (fitted$n_missing > 0L) "x_missing", "ad_offset", "cash_increment_rate",
    "cash_zero_probability", "sigma",
    "tau_focus", "tau_structure", "tau_title", "tau_location", "tau_remote", "tau_fiscal_sponsor",
    "focus_raw", "structure_raw", "title_raw", "location_raw", "remote_raw", "fiscal_sponsor_raw",
    "ea_increment", "focus_effect", "structure_effect", "title_effect", "location_effect",
    "remote_effect", "fiscal_sponsor_effect", "ea_effect"
  ))
  sampler <- sampler_diagnostic_summary(fitted$fit, fitted$n_missing)
  list(
    includeAdvertisedRanges = include_ads,
    includeHighestOtherPay = fitted$include_highest_other_pay,
    designColumns = design_columns_for(fitted$feature_keys),
    preprocessing = json_preprocessing(fitted$preprocessing),
    missingInputs = list(
      distribution = "joint_normal_standardized_log_inputs",
      conditioning = "observed continuous inputs; training-fold posterior only",
      correlationPrior = "LKJ(2)",
      featureKeys = unname(fitted$feature_keys),
      posteriorMeanCorrelation = unname(Reduce(`+`, lapply(components$x_covariance, cov2cor)) / total)
    ),
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

serialize_linear_model <- function(result) {
  fitted <- result$fitted
  list(
    includeAdvertisedRanges = FALSE,
    includeHighestOtherPay = result$include_highest_other_pay,
    preprocessing = json_preprocessing(result$preprocessing),
    candidateDesignColumns = unname(colnames(result$x)),
    activeDesignColumns = unname(fitted$active_columns),
    droppedDesignColumns = unname(fitted$dropped_columns),
    designColumns = unname(fitted$active_columns),
    baseline = fitted$coefficients[[1]],
    coefficients = unname(fitted$coefficients[-1]),
    residuals = result$oof$residuals,
    residualRecordIds = result$oof$ids,
    trainingRecordIds = unname(exact$id),
    intervalCalibration = "nested organization-fold residual KDE",
    diagnostics = list(
      trainingN = nrow(exact), residualScale = fitted$sigma, rank = fitted$rank
    )
  )
}

serialize_gam_model <- function(result) {
  fitted <- result$fitted
  active_columns <- c(fitted$value_columns, fitted$active_missing_columns)
  list(
    includeAdvertisedRanges = FALSE,
    includeHighestOtherPay = result$include_highest_other_pay,
    preprocessing = json_preprocessing(result$preprocessing),
    candidateDesignColumns = unname(colnames(result$x)),
    activeDesignColumns = unname(active_columns),
    droppedDesignColumns = unname(setdiff(colnames(result$x), active_columns)),
    baseline = result$baseline,
    effects = result$effects,
    residuals = result$oof$residuals,
    residualRecordIds = result$oof$ids,
    trainingRecordIds = unname(exact$id),
    intervalCalibration = "nested organization-fold residual KDE",
    diagnostics = list(
      trainingN = nrow(exact), edf = sum(fitted$fit$edf),
      residualScale = sqrt(summary(fitted$fit)$scale)
    )
  )
}

comparison_keys <- c(
  "Intercept only" = "intercept",
  "Scale linear · without other pay" = "linear_no_highest",
  "Scale linear · with other pay" = "linear",
  "Numeric-input GAM · without other pay" = "gam_no_highest",
  "Numeric-input GAM · with other pay" = "gam",
  "Bayesian multilevel · without other pay" = "bayesian_no_highest",
  "Bayesian multilevel · with other pay" = "bayesian",
  "Bayesian multilevel + ad ranges · without other pay" = "bayesian_ranges_no_highest",
  "Bayesian multilevel + ad ranges · with other pay" = "bayesian_ranges"
)
comparison_json <- lapply(seq_len(nrow(comparison)), function(i) {
  row <- comparison[i, ]
  include_highest <- grepl("with other pay$", row$model)
  include_ads <- grepl("+ ad ranges", row$model, fixed = TRUE)
  list(
    key = unname(comparison_keys[[row$model]]),
    label = row$model,
    includeHighestOtherPay = include_highest,
    includeAdvertisedRanges = include_ads,
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
    filingCounts = unname(as.integer(table(factor(filing[[key]], levels = levels)))),
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
  eaFilingCounts = unname(as.integer(table(factor(filing$ea_relationship, levels = ea_levels)))),
  eaExactCounts = unname(as.integer(table(factor(exact$ea_relationship, levels = ea_levels)))),
  exclusions = list(
    "Peer group and similarity score are excluded because they are RP-relative judgments built from overlapping inputs.",
    "Partial-year, transition, part-time, unresolved-measurement, and nonpositive records are excluded because they do not share the annual organization-leadership-pay target.",
    "Missing continuous inputs follow a regularized joint normal model on standardized logs; held-out imputations condition on observed inputs using only the training-fold posterior.",
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
    bayesianNoHighest = thin_components(full_bayesian_no_highest, FALSE),
    bayesianRanges = thin_components(full_bayesian_ads, TRUE),
    bayesianRangesNoHighest = thin_components(full_bayesian_ads_no_highest, TRUE),
    intercept = list(
      includeAdvertisedRanges = FALSE,
      includeHighestOtherPay = FALSE,
      baseline = intercept_baseline,
      residuals = intercept_oof$residuals,
      residualRecordIds = intercept_oof$ids,
      trainingRecordIds = unname(exact$id),
      diagnostics = list(
        trainingN = nrow(exact),
        residualScale = unname(summary(intercept_fit)$sigma),
        rank = unname(intercept_fit$rank)
      ),
      intervalCalibration = "nested organization-fold residual KDE"
    ),
    linear = serialize_linear_model(linear_with_highest),
    linearNoHighest = serialize_linear_model(linear_no_highest),
    gam = serialize_gam_model(gam_with_highest),
    gamNoHighest = serialize_gam_model(gam_no_highest)
  ),
  method = list(
    intercept = "Exact-filing comparison model with one mean log base salary and no organization predictors. Predictive uncertainty uses organization-grouped out-of-fold residuals.",
    linear = "Exact-filing linear model for log base salary using standardized log expenses, revenue, staff, and non-CEO highest reported base pay plus active missing-value indicators. Predictive uncertainty uses organization-grouped out-of-fold residuals.",
    linearNoHighest = "Exact-filing linear model for log base salary using standardized log expenses, revenue, and staff plus active missing-value indicators; non-CEO pay and its missingness indicator are omitted. Predictive uncertainty uses organization-grouped out-of-fold residuals.",
    bayesian = "Filing-only multilevel normal model for log base salary with signed regularized scale and non-CEO-pay slopes; multilevel focus, type, title, location, remote-work, and fiscal-sponsor effects; a signed EA effect; jointly modeled missing continuous inputs conditional on observed inputs; and a cash-proxy measurement model.",
    bayesianNoHighest = "Filing-only multilevel normal model matching the main Bayesian specification but omitting non-CEO pay and its missingness indicator.",
    bayesianRanges = "Range-augmented multilevel normal model matching the main Bayesian specification and incorporating advertised salary points and intervals through a separate posting measurement model.",
    bayesianRangesNoHighest = "Range-augmented multilevel normal model incorporating advertised salary evidence while omitting non-CEO pay and its missingness indicator.",
    gam = "Low-complexity additive smooths for log expenses, revenue, staff, and non-CEO highest reported base pay, with fold-specific centering and active missing-value indicators. Predictive uncertainty uses organization-grouped out-of-fold residuals; cash-only records, advertised ranges, and categorical profile fields are not used.",
    gamNoHighest = "Low-complexity additive smooths for log expenses, revenue, and staff, with fold-specific centering and active missing-value indicators; non-CEO pay and its missingness indicator are omitted.",
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
