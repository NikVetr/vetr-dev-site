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
artifact_path <- file.path(analysis_dir, "model_artifact.json")
cv_path <- file.path(analysis_dir, "cross_validation_results.csv")
oof_path <- file.path(analysis_dir, "cross_validation_predictions.csv")
sampler_path <- file.path(analysis_dir, "sampler_diagnostics.csv")

if (!file.exists(training_path)) stop("Missing prepared model data: ", training_path)
if (!file.exists(stan_path)) stop("Missing Stan model: ", stan_path)

set.seed(20260903)
z <- read.csv(training_path, stringsAsFactors = FALSE, check.names = FALSE)
metadata <- fromJSON(metadata_path, simplifyVector = FALSE)
if (nrow(z) != metadata$counts$records) stop("Training-data count does not match metadata")
if (anyDuplicated(z$id)) stop("Predictive-model training IDs are not unique")
if (any(tapply(z$outer_fold, z$organization_group, function(x) length(unique(x))) != 1L)) {
  stop("Organization leakage detected across outer folds")
}
z$log_mid <- log(z$salary_midpoint)
z$log_low <- log(z$salary_lower)
z$log_high <- log(z$salary_upper)

continuous_keys <- c("expenses", "revenue", "staff", "compensation_year")
categorical_keys <- c("focus_area", "organization_type", "title_group", "location_scope")
category_levels <- lapply(categorical_keys, function(key) sort(unique(z[[key]])))
names(category_levels) <- categorical_keys
ea_levels <- c("Functional overlap", "EA-adjacent", "EA-core")
if (!all(z$ea_relationship %in% ea_levels)) stop("Unexpected EA relationship category")

fit_preprocessing <- function(rows) {
  result <- list()
  for (key in continuous_keys) {
    raw <- rows[[key]]
    if (key != "compensation_year") raw <- ifelse(is.finite(raw) & raw > 0, log(raw), NA_real_)
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
  x <- matrix(0, nrow(rows), 7L)
  colnames(x) <- c("log_expenses", "log_revenue", "log_staff", "year",
                   "expenses_missing", "revenue_missing", "staff_missing")
  for (j in seq_along(continuous_keys)) {
    key <- continuous_keys[[j]]
    raw <- rows[[key]]
    if (key != "compensation_year") raw <- ifelse(is.finite(raw) & raw > 0, log(raw), NA_real_)
    missing <- !is.finite(raw)
    raw[missing] <- preprocessing[[key]]$impute
    x[, j] <- (raw - preprocessing[[key]]$center) / preprocessing[[key]]$scale
    if (j <= 3L) x[, 4L + j] <- as.numeric(missing)
  }
  x
}

category_index <- function(values, levels, key) {
  index <- match(values, levels)
  if (anyNA(index)) stop("Unknown ", key, " level: ", paste(unique(values[is.na(index)]), collapse = ", "))
  as.integer(index)
}

make_design <- function(rows, preprocessing) {
  list(
    X = transform_continuous(rows, preprocessing),
    focus = category_index(rows$focus_area, category_levels$focus_area, "focus"),
    structure = category_index(rows$organization_type, category_levels$organization_type, "structure"),
    title = category_index(rows$title_group, category_levels$title_group, "title"),
    location = category_index(rows$location_scope, category_levels$location_scope, "location"),
    ea = category_index(rows$ea_relationship, ea_levels, "EA relationship"),
    source = ifelse(rows$source == "job_ad", 2L, 1L)
  )
}

make_stan_data <- function(rows, preprocessing) {
  design <- make_design(rows, preprocessing)
  list(
    N = nrow(rows), K = ncol(design$X), X = design$X,
    log_salary_midpoint = rows$log_mid,
    log_salary_lower = rows$log_low,
    log_salary_upper = rows$log_high,
    is_exact = as.integer(rows$observation != "interval"),
    source = as.integer(design$source),
    J_focus = length(category_levels$focus_area),
    J_structure = length(category_levels$organization_type),
    J_title = length(category_levels$title_group),
    J_location = length(category_levels$location_scope),
    focus = design$focus, structure = design$structure, title_group = design$title,
    location = design$location, ea_level = design$ea
  )
}

fit_stan <- function(rows, seed, full = FALSE) {
  preprocessing <- fit_preprocessing(rows)
  stan_data <- make_stan_data(rows, preprocessing)
  if (!exists("compiled_model", inherits = TRUE)) stop("Stan model was not compiled")
  initial_values <- list(
    alpha = mean(rows$log_mid), beta = rep(0, stan_data$K), ad_offset = 0,
    sigma = c(0.35, 0.45),
    tau_focus = 0.1, tau_structure = 0.1, tau_title = 0.1, tau_location = 0.1,
    focus_raw = rep(0, stan_data$J_focus),
    structure_raw = rep(0, stan_data$J_structure),
    title_raw = rep(0, stan_data$J_title),
    location_raw = rep(0, stan_data$J_location),
    ea_increment = c(0.03, 0.03)
  )
  chains <- if (full && !quick) 4L else 1L
  fit <- compiled_model$sample(
    data = stan_data,
    seed = seed,
    chains = chains,
    parallel_chains = chains,
    iter_warmup = if (full && !quick) 600L else if (quick) 80L else 250L,
    iter_sampling = if (full && !quick) 600L else if (quick) 80L else 250L,
    init = rep(list(initial_values), chains),
    refresh = 0,
    adapt_delta = 0.99,
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
  list(
    chains = dim(diagnostics)[[2]],
    drawsPerChain = dim(diagnostics)[[1]],
    divergences = sum(diagnostics[, , "divergent__"]),
    maxTreedepthHits = sum(diagnostics[, , "treedepth__"] >= max_treedepth),
    minEbfmi = min(ebfmi, na.rm = TRUE)
  )
}

draw_columns <- function(draws, prefix, count) {
  columns <- paste0(prefix, "[", seq_len(count), "]")
  if (!all(columns %in% colnames(draws))) stop("Missing posterior columns for ", prefix)
  draws[, columns, drop = FALSE]
}

posterior_components <- function(fit) {
  variables <- c("alpha", "beta", "ad_offset", "sigma", "focus_effect", "structure_effect",
                 "title_effect", "location_effect", "ea_effect")
  draws <- as.matrix(fit$draws(variables = variables, format = "draws_matrix"))
  list(
    matrix = draws,
    alpha = draws[, "alpha"],
    beta = draw_columns(draws, "beta", 7L),
    ad_offset = draws[, "ad_offset"],
    sigma = draw_columns(draws, "sigma", 2L),
    focus = draw_columns(draws, "focus_effect", length(category_levels$focus_area)),
    structure = draw_columns(draws, "structure_effect", length(category_levels$organization_type)),
    title = draw_columns(draws, "title_effect", length(category_levels$title_group)),
    location = draw_columns(draws, "location_effect", length(category_levels$location_scope)),
    ea = draw_columns(draws, "ea_effect", length(ea_levels))
  )
}

posterior_mu <- function(components, design) {
  n <- nrow(design$X)
  d <- length(components$alpha)
  mu <- design$X %*% t(components$beta)
  mu <- mu + matrix(components$alpha, nrow = n, ncol = d, byrow = TRUE)
  mu <- mu + t(components$focus[, design$focus, drop = FALSE])
  mu <- mu + t(components$structure[, design$structure, drop = FALSE])
  mu <- mu + t(components$title[, design$title, drop = FALSE])
  mu <- mu + t(components$location[, design$location, drop = FALSE])
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
    source_index <- design$source[[i]]
    prediction[[i]] <- mean(mu[i, ])
    predictive <- rnorm(ncol(mu), mu[i, ], sigma[, source_index])
    interval80 <- quantile(predictive, c(.1, .9), names = FALSE)
    interval90 <- quantile(predictive, c(.05, .95), names = FALSE)
    lower80[[i]] <- interval80[[1]]
    upper80[[i]] <- interval80[[2]]
    lower90[[i]] <- interval90[[1]]
    upper90[[i]] <- interval90[[2]]
    if (test$observation[[i]] != "interval") {
      log_density[[i]] <- log_mean_exp(dnorm(test$log_mid[[i]], mu[i, ], sigma[, source_index], log = TRUE))
      coverage80[[i]] <- test$log_mid[[i]] >= interval80[[1]] && test$log_mid[[i]] <= interval80[[2]]
      coverage90[[i]] <- test$log_mid[[i]] >= interval90[[1]] && test$log_mid[[i]] <= interval90[[2]]
    } else {
      probability <- pnorm(test$log_high[[i]], mu[i, ], sigma[, source_index]) -
        pnorm(test$log_low[[i]], mu[i, ], sigma[, source_index])
      log_density[[i]] <- log_mean_exp(log(pmax(probability, 1e-300)))
    }
  }
  data.frame(
    id = test$id, organization = test$organization, source = test$source,
    observation = test$observation, fold = test$outer_fold,
    observed_log_salary = test$log_mid, observed_log_lower = test$log_low,
    observed_log_upper = test$log_high, predicted_log_salary = prediction,
    predicted_log_lower80 = lower80, predicted_log_upper80 = upper80,
    predicted_log_lower90 = lower90, predicted_log_upper90 = upper90,
    log_predictive_density = log_density, coverage80 = coverage80,
    coverage90 = coverage90, stringsAsFactors = FALSE
  )
}

metrics_from_oof <- function(oof, model_name) {
  exact <- oof[oof$source == "filing", ]
  residual <- exact$observed_log_salary - exact$predicted_log_salary
  denominator <- sum((exact$observed_log_salary - mean(exact$observed_log_salary))^2)
  ad_intervals <- oof[oof$source == "job_ad" & oof$observation == "interval", ]
  ad_points <- oof[oof$source == "job_ad" & oof$observation != "interval", ]
  data.frame(
    model = model_name,
    exact_n = nrow(exact),
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
    ad_interval_mean_log_score = if (nrow(ad_intervals)) mean(ad_intervals$log_predictive_density) else NA_real_,
    ad_point_mean_log_score = if (nrow(ad_points)) mean(ad_points$log_predictive_density) else NA_real_,
    stringsAsFactors = FALSE
  )
}

evaluate_simple_model <- function(kind) {
  output <- list()
  for (fold in sort(unique(z$outer_fold))) {
    training <- z[z$outer_fold != fold & z$source == "filing", ]
    test <- z[z$outer_fold == fold & z$source == "filing", ]
    pp <- fit_preprocessing(training)
    x_train <- transform_continuous(training, pp)[, 1:4, drop = FALSE]
    x_test <- transform_continuous(test, pp)[, 1:4, drop = FALSE]
    if (kind == "intercept") {
      fit <- lm(training$log_mid ~ 1)
      predicted <- rep(unname(coef(fit)[[1]]), nrow(test))
      sigma <- summary(fit)$sigma
    } else if (kind == "scale_linear") {
      fit <- lm(training$log_mid ~ x_train)
      predicted <- cbind(1, x_test) %*% coef(fit)
      sigma <- summary(fit)$sigma
    } else if (kind == "gam") {
      train_frame <- data.frame(y = training$log_mid, x_train)
      test_frame <- data.frame(x_test)
      names(train_frame) <- c("y", "x_expenses", "x_revenue", "x_staff", "x_year")
      names(test_frame) <- c("x_expenses", "x_revenue", "x_staff", "x_year")
      fit <- gam(y ~ s(x_expenses, k = 4, bs = "cr") + s(x_revenue, k = 4, bs = "cr") +
                   s(x_staff, k = 4, bs = "cr") + x_year,
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
      observed_log_salary = test$log_mid, observed_log_lower = test$log_low,
      observed_log_upper = test$log_high, predicted_log_salary = as.numeric(predicted),
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
  model_name <- if (include_ads) "Bayesian partial pooling + ad ranges" else "Bayesian partial pooling"
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
oof_sets[["Scale GAM"]] <- evaluate_simple_model("gam")

comparison <- do.call(rbind, lapply(names(oof_sets), function(name) metrics_from_oof(oof_sets[[name]], name)))
comparison <- comparison[match(c("Intercept only", "Scale linear", "Scale GAM", "Bayesian partial pooling", "Bayesian partial pooling + ad ranges"), comparison$model), ]
write.csv(comparison, cv_path, row.names = FALSE)
oof_export <- do.call(rbind, lapply(names(oof_sets), function(name) transform(oof_sets[[name]], model = name)))
write.csv(oof_export, oof_path, row.names = FALSE)

message("Fitting full Bayesian models")
full_bayesian <- fit_stan(z[z$source == "filing", ], 20262903, full = TRUE)
full_bayesian_ads <- fit_stan(z, 20263903, full = TRUE)
for (model_name in c("Bayesian partial pooling", "Bayesian partial pooling + ad ranges")) {
  fitted <- if (model_name == "Bayesian partial pooling") full_bayesian else full_bayesian_ads
  full_diagnostics <- sampler_diagnostic_summary(fitted$fit)
  sampler_records[[length(sampler_records) + 1L]] <- data.frame(
    phase = "full", model = model_name, fold = NA_integer_,
    chains = full_diagnostics$chains, draws_per_chain = full_diagnostics$drawsPerChain,
    divergences = full_diagnostics$divergences,
    max_treedepth_hits = full_diagnostics$maxTreedepthHits,
    min_ebfmi = full_diagnostics$minEbfmi,
    stringsAsFactors = FALSE
  )
}
sampler_table <- do.call(rbind, sampler_records)
write.csv(sampler_table, sampler_path, row.names = FALSE)

message("Fitting full GAM")
exact <- z[z$source == "filing", ]
gam_pp <- fit_preprocessing(exact)
gam_x <- transform_continuous(exact, gam_pp)[, 1:4, drop = FALSE]
gam_frame <- data.frame(y = exact$log_mid, gam_x)
names(gam_frame) <- c("y", "x_expenses", "x_revenue", "x_staff", "x_year")
gam_fit <- gam(y ~ s(x_expenses, k = 4, bs = "cr") + s(x_revenue, k = 4, bs = "cr") +
                 s(x_staff, k = 4, bs = "cr") + x_year,
               data = gam_frame, method = "REML")
gam_zero <- data.frame(x_expenses = 0, x_revenue = 0, x_staff = 0, x_year = 0)
gam_baseline <- as.numeric(predict(gam_fit, gam_zero, type = "response"))
gam_effects <- list()
for (j in seq_along(c("expenses", "revenue", "staff", "year"))) {
  key <- c("expenses", "revenue", "staff", "year")[[j]]
  column <- paste0("x_", key)
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
gam_oof <- oof_sets[["Scale GAM"]]
gam_residuals <- gam_oof$observed_log_salary - gam_oof$predicted_log_salary

json_preprocessing <- function(preprocessing) {
  lapply(names(preprocessing), function(key) {
    item <- preprocessing[[key]]
    raw_min <- if (key == "compensation_year") item$minimum else exp(item$minimum)
    raw_max <- if (key == "compensation_year") item$maximum else exp(item$maximum)
    list(key = key, center = item$center, scale = item$scale, impute = item$impute,
         minimum = raw_min, maximum = raw_max, transform = if (key == "compensation_year") "identity" else "log")
  })
}

thin_components <- function(fitted, include_ads, maximum_draws = if (quick) 80L else 512L) {
  components <- posterior_components(fitted$fit)
  total <- length(components$alpha)
  keep <- unique(round(seq(1, total, length.out = min(total, maximum_draws))))
  set.seed(if (include_ads) 20264903 else 20265903)
  summary_table <- fitted$fit$summary(variables = c(
    "alpha", "beta", "ad_offset", "sigma", "tau_focus", "tau_structure", "tau_title", "tau_location",
    "focus_raw", "structure_raw", "title_raw", "location_raw", "ea_increment",
    "focus_effect", "structure_effect", "title_effect", "location_effect", "ea_effect"
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
      ea = unname(components$ea[keep, , drop = FALSE]),
      residualZ = rnorm(length(keep))
    ),
    diagnostics = list(
      posteriorDraws = length(keep),
      maxRhat = max(summary_table$rhat, na.rm = TRUE),
      minBulkEss = min(summary_table$ess_bulk, na.rm = TRUE),
      divergences = sampler$divergences,
      maxTreedepthHits = sampler$maxTreedepthHits,
      minEbfmi = sampler$minEbfmi
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
    logRmse = row$log_rmse,
    logMae = row$log_mae,
    oosR2 = row$oos_r2,
    medianAbsPercentError = row$median_abs_percent_error,
    coverage80 = row$coverage80,
    coverage90 = row$coverage90,
    cvElpd = row$cv_elpd,
    meanLogPredictiveDensity = row$mean_log_predictive_density,
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
  schemaVersion = 1,
  generatedAt = format(Sys.time(), "%Y-%m-%dT%H:%M:%SZ", tz = "UTC"),
  target = "July 2026-adjusted annual CEO base salary",
  responseScale = "natural logarithm of positive annual USD",
  training = list(
    exactFilings = nrow(exact), advertisedRecords = sum(z$source == "job_ad"),
    advertisedRanges = sum(z$observation == "interval"),
    organizations = length(unique(z$organization_group)),
    rpExcluded = TRUE,
    cohort = "Recommended CEO records",
    foldRule = metadata$foldRule
  ),
  rpProfile = metadata$rpProfile,
  continuousFeatures = list(
    list(key = "expenses", label = "Annual expenses", unit = "USD"),
    list(key = "revenue", label = "Annual revenue", unit = "USD"),
    list(key = "staff", label = "Employees", unit = "people"),
    list(key = "compensation_year", label = "Compensation year", unit = "year")
  ),
  categoricalFeatures = category_schema,
  eaLevels = ea_levels,
  eaCounts = unname(as.integer(table(factor(z$ea_relationship, levels = ea_levels)))),
  eaExactCounts = unname(as.integer(table(factor(exact$ea_relationship, levels = ea_levels)))),
  exclusions = list(
    "Peer group and similarity score are excluded because they are RP-relative judgments built from overlapping inputs.",
    "Remote status is excluded because Form 990 filings do not report it.",
    "RP compensation is displayed only as a reference and is never a training outcome."
  ),
  validationDiagnostics = list(
    crossValidationFits = sum(sampler_table$phase == "cross_validation"),
    crossValidationDivergences = sum(sampler_table$divergences[sampler_table$phase == "cross_validation"]),
    crossValidationMaxTreedepthHits = sum(sampler_table$max_treedepth_hits[sampler_table$phase == "cross_validation"]),
    crossValidationMinEbfmi = min(sampler_table$min_ebfmi[sampler_table$phase == "cross_validation"], na.rm = TRUE)
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
    bayesian = "Normal model for log salary with signed regularized scale slopes, partially pooled focus/type/title/location effects, ordered cumulative EA increments, and separate posting level and spread. Advertised salaries enter through an interval likelihood.",
    gam = "Low-complexity additive smooths for log expenses, revenue, staff, and year. Predictive uncertainty uses organization-grouped out-of-fold residuals; advertised ranges are not used.",
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
