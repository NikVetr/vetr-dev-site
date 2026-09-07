#!/usr/bin/env Rscript
# Extend the existing production registry without changing its fitted models.
project <- normalizePath(commandArgs(trailingOnly = TRUE)[1])
fit_file <- file.path(project, "benchmark/analysis/predictive_salary_models/fit_salary_models.R")
after_functions <- FALSE
for (expression in parse(fit_file)) {
  if (grepl("^if \\(functions_only\\)", paste(deparse(expression), collapse = " "))) { after_functions <- TRUE; next }
  is_function <- is.call(expression) && identical(expression[[1]], as.name("<-")) &&
    is.call(expression[[3]]) && identical(expression[[3]][[1]], as.name("function"))
  if (!after_functions || is_function) eval(expression, .GlobalEnv)
}
source(file.path(analysis_dir, "categorical_gam.R"))
artifact <- fromJSON(artifact_path, simplifyVector = FALSE)
sha256 <- function(path) strsplit(system2("sha256sum", shQuote(path), stdout = TRUE), " ", fixed = TRUE)[[1]][1]
if (!isTRUE(artifact$production) || artifact$provenance$fitScriptSha256 != sha256(fit_file) ||
    artifact$provenance$trainingCsvSha256 != sha256(training_path)) stop("Fit the current production models before extending the registry")
exact <- z[z$observation == "exact_base", ]
original_predict_simple <- predict_simple_model
predict_simple_model <- function(training, test, kind, feature_keys) {
  if (kind == "gam_categorical") predict_categorical_gam(training, test, feature_keys)
  else original_predict_simple(training, test, kind, feature_keys)
}
metrics <- read.csv(cv_path, check.names = FALSE)
predictions <- read.csv(oof_path, check.names = FALSE)
artifact$comparison <- Filter(function(row) row$method != "gamCategorical", artifact$comparison)
for (highest in c(FALSE, TRUE)) {
  label <- paste0("Categorical GAM · ", if (highest) "with" else "without", " other pay")
  message("Fitting ", label, " with nested grouped calibration")
  set.seed(20260906 + as.integer(highest))
  oof <- evaluate_simple_model("gam_categorical", highest)
  metric <- metrics_from_oof(oof, label)
  fitted <- fit_categorical_gam(exact, feature_keys_for(highest))
  key <- paste0("gamCategorical", if (!highest) "NoHighest" else "")
  artifact$models[[key]] <- serialize_categorical_gam(fitted, feature_keys_for(highest), oof, label)
  template <- artifact$comparison[[which(vapply(artifact$comparison, function(row) row$key == if (highest) "gam" else "gam_no_highest", logical(1)))]]
  template$key <- if (highest) "gam_categorical" else "gam_categorical_no_highest"
  template$modelKey <- key; template$method <- "gamCategorical"; template$label <- label
  fields <- c(logRmse = "log_rmse", logMae = "log_mae", oosR2 = "oos_r2", medianAbsPercentError = "median_abs_percent_error",
    meanAbsPercentError = "mean_abs_percent_error", geometricAbsErrorFactor = "geometric_abs_error_factor", logCrps = "log_crps",
    interval90MeanLogWidth = "interval90_mean_log_width", coverage80 = "coverage80", coverage90 = "coverage90",
    cvElpd = "cv_elpd", meanLogPredictiveDensity = "mean_log_predictive_density")
  for (field in names(fields)) template[[field]] <- metric[[fields[[field]]]]
  artifact$comparison[[length(artifact$comparison) + 1L]] <- template
  artifact$method[[key]] <- "REML GAM with numeric cubic regression splines and penalized indicator effects for all seven categorical fields. Exact-base outcomes, training-fold numeric imputation, nested organization-fold residual calibration."
  metrics <- rbind(metrics[metrics$model != label, ], metric)
  oof$model <- label; predictions <- rbind(predictions[predictions$model != label, ], oof[, names(predictions)])
  cache <- file.path(repo, "tmp/categorical-gam"); dir.create(cache, recursive = TRUE, showWarnings = FALSE)
  saveRDS(list(fit = fitted, oof = oof, session = sessionInfo()), file.path(cache, paste0(key, ".rds")))
  print(metric[, c("model", "log_rmse", "mean_abs_percent_error", "coverage90", "mean_log_predictive_density")])
}
artifact$categoricalGamProvenance <- list(fitScriptSha256 = sha256(file.path(analysis_dir, "fit_categorical_gam.R")),
  modelScriptSha256 = sha256(file.path(analysis_dir, "categorical_gam.R")), trainingCsvSha256 = sha256(training_path),
  seed = 20260906L, R = R.version.string, mgcv = as.character(packageVersion("mgcv")))
# Preserve compact scalar arrays when round-tripping the existing JSON registry.
json_arrays <- function(value) {
  if (!is.list(value)) return(value)
  if (is.null(names(value)) && length(value) &&
      all(vapply(value, function(x) is.atomic(x) && length(x) == 1L, logical(1)))) return(I(unlist(value)))
  lapply(value, json_arrays)
}
write_json(json_arrays(artifact), artifact_path, auto_unbox = TRUE, pretty = TRUE, digits = NA, null = "null", na = "null")
write.csv(metrics, cv_path, row.names = FALSE)
write.csv(predictions, oof_path, row.names = FALSE)
