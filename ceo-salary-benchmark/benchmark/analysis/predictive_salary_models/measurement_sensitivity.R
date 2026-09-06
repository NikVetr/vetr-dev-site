#!/usr/bin/env Rscript
# Matched measurement/cohort/category comparisons, using the production fit
# and predictive scoring functions. Results stay separate from the 17 app fits.
study_args <- commandArgs(trailingOnly = TRUE)
if (!length(study_args)) stop("Usage: measurement_sensitivity.R CEO_PROJECT_ROOT [--prepare]")
study_prepare <- "--prepare" %in% study_args
study_numeric_only <- "--numeric-only" %in% study_args
study_project <- normalizePath(study_args[1])
for (expression in parse(file.path(study_project, "benchmark/analysis/predictive_salary_models/fit_salary_models.R"))) {
  if (grepl("^if \\(functions_only\\)", paste(deparse(expression), collapse = " "))) break
  eval(expression, .GlobalEnv)
}
if (quick) stop("Measurement study requires production sampling")
if (study_prepare != nzchar(Sys.getenv("SALARY_CLUSTER_PREPARE"))) stop("Prepare flag and request directory must agree")
compiled_model <- if (study_prepare || study_numeric_only) list() else cmdstan_model(stan_path, quiet = TRUE)
study_output <- file.path(analysis_dir, "measurement_sensitivity")
dir.create(study_output, showWarnings = FALSE)
original_z <- z
original_levels <- category_levels
signature_file <- tempfile()
saveRDS(list(data = z, provenance = metadata$provenance,
  script = unname(tools::md5sum(file.path(analysis_dir, "measurement_sensitivity.R"))),
  r = R.version.string, mgcv = as.character(packageVersion("mgcv")),
  e1071 = as.character(packageVersion("e1071"))), signature_file)
study_cache <- file.path(repo, "tmp/measurement-study-cache", unname(tools::md5sum(signature_file)))
unlink(signature_file)
dir.create(study_cache, recursive = TRUE, showWarnings = FALSE)
study_predictions <- list()
study_metrics <- list()
study_diagnostics <- list()
study_folds <- list()
study_specs <- list(
  list(key = "bayesian_filing", label = "Bayesian linear: exact + cash, all categories", exact = FALSE, categories = TRUE, repeats = 1:3, offset = 0L),
  list(key = "bayesian_exact", label = "Bayesian linear: exact only, all categories", exact = TRUE, categories = TRUE, repeats = 1:3, offset = 1000L),
  list(key = "bayesian_numeric", label = "Bayesian linear: exact only, numeric inputs", exact = TRUE, categories = FALSE, repeats = 1:3, offset = 2000L),
  list(key = "bayesian_disclosure", label = "Bayesian linear: uncertain other-pay maxima missing", exact = FALSE, categories = TRUE, repeats = 1L, offset = 3000L),
  list(key = "bayesian_reported", label = "Bayesian linear: reported other pay", exact = FALSE, categories = TRUE, repeats = 1L, offset = 4000L)
)

for (replicate_id in 1:3) {
  z <- original_z
  if (replicate_id > 1L) {
    set.seed(20260903 + replicate_id - 1L)
    groups <- sample(sort(unique(z$organization_group)))
    assignment <- setNames(rep(1:10, length.out = length(groups)), groups)
    z$outer_fold <- unname(assignment[z$organization_group])
  }
  repeated_z <- z
  stopifnot(all(tapply(z$outer_fold, z$organization_group, function(x) length(unique(x))) == 1L))
  study_folds[[replicate_id]] <- data.frame(replicate = replicate_id, id = z$id,
    organization_group = z$organization_group, fold = z$outer_fold)
  for (spec in study_specs) {
    if (study_numeric_only) break
    if (!replicate_id %in% spec$repeats) next
    z <- repeated_z
    category_levels <- original_levels
    if (!spec$categories) {
      for (key in categorical_keys) {
        category_levels[[key]] <- "All"
        z[[key]] <- "All"
      }
      z$ea_relationship <- "Functional overlap"
    }
    if (spec$key == "bayesian_disclosure") z$highest_other_base[!z$other_base_maximum_identified] <- NA_real_
    if (spec$key == "bayesian_reported") z$highest_other_base <- z$highest_other_base_reported
    selected <- z$source == "filing" & (!spec$exact | z$observation == "exact_base")
    outputs <- list()
    for (fold in 1:10) {
      training <- z[selected & z$outer_fold != fold, ]
      test <- z[selected & z$outer_fold == fold, ]
      if (length(intersect(training$organization_group, test$organization_group))) stop("Study fold leakage")
      seed <- 20261003 + fold + 10000L * (replicate_id - 1L) + spec$offset
      fitted <- fit_stan(training, seed, TRUE)
      message(spec$key, " replicate ", replicate_id, " fold ", fold, if (study_prepare) " prepared" else " fitted")
      if (study_prepare) next
      diagnostic <- sampler_diagnostic_summary(fitted$fit, fitted$n_missing)
      if (diagnostic$chains != 4L || diagnostic$divergences != 0L || diagnostic$maxTreedepthHits != 0L ||
          !is.finite(diagnostic$maxRhat) || diagnostic$maxRhat > 1.05 || diagnostic$minBulkEss < 100 ||
          diagnostic$minTailEss < 100 || diagnostic$minEbfmi < .2) stop("Study sampler gate failed: ", spec$key, " / ", replicate_id, " / ", fold)
      study_diagnostics[[length(study_diagnostics) + 1L]] <- cbind(
        data.frame(model = spec$key, replicate = replicate_id, fold = fold), as.data.frame(diagnostic))
      design <- make_design(test, fitted$preprocessing, fitted$feature_keys)
      outputs[[fold]] <- evaluate_prediction_draws(test, design,
        posterior_components(fitted$fit, fitted$feature_keys, fitted$curvature), seed + 1000L)
    }
    if (!study_prepare) {
      predictions <- do.call(rbind, outputs)
      predictions <- predictions[predictions$observation == "exact_base", ]
      stopifnot(setequal(predictions$id, original_z$id[original_z$observation == "exact_base"]))
      study_predictions[[length(study_predictions) + 1L]] <- transform(predictions, model = spec$key, replicate = replicate_id)
      study_metrics[[length(study_metrics) + 1L]] <- transform(metrics_from_oof(predictions, spec$key), replicate = replicate_id)
    }
  }
  if (!study_prepare) {
    z <- repeated_z
    category_levels <- original_levels
    for (kind in c("scale_linear", "gam", "svr", "gp")) {
      cache_path <- file.path(study_cache, paste0(kind, "-", replicate_id, ".rds"))
      if (file.exists(cache_path)) predictions <- readRDS(cache_path) else {
        message("Numeric study: ", kind, " replicate ", replicate_id)
        predictions <- evaluate_simple_model(kind, TRUE)
        saveRDS(predictions, cache_path)
      }
      study_predictions[[length(study_predictions) + 1L]] <- transform(predictions, model = kind, replicate = replicate_id)
      study_metrics[[length(study_metrics) + 1L]] <- transform(metrics_from_oof(predictions, kind), replicate = replicate_id)
    }
  }
}
if (study_numeric_only) {
  message("Saved numeric comparison cache to ", study_cache)
  quit(save = "no")
}
write.csv(do.call(rbind, study_folds), file.path(study_output, "fold_assignments.csv"), row.names = FALSE)
write_json(list(repetitions = 3L, foldSeeds = 20260903:20260905,
  firstFoldRule = "Production Python organization shuffle; later repetitions use R sample with stated seeds",
  scoring = "Identical exact-base outcomes in every comparison; all evidence for an organization held out together",
  otherPayBasis = "40-hour equivalents; reported-pay sensitivity re-ranks the original eligible reported amounts",
  disclosureSensitivity = "Set other-pay predictor missing when an eligible disclosed employee with no base disclosure has cash exceeding the known maximum base; use the same joint missing-input model. This discards the known lower bound and does not correct unlisted-employee selection.",
  categoryAblation = "All centered categories collapsed to one level; EA held at the reference; numeric and missingness terms retained",
  specifications = study_specs,
  trainingSha256 = metadata$provenance$trainingCsvSha256,
  fitScriptSha256 = metadata$provenance$fitScriptSha256,
  rVersion = R.version.string), file.path(study_output, "study_design.json"), auto_unbox = TRUE, pretty = TRUE)
if (study_prepare) quit(save = "no")
write.csv(do.call(rbind, study_predictions), file.path(study_output, "predictions.csv"), row.names = FALSE)
write.csv(do.call(rbind, study_metrics), file.path(study_output, "metrics.csv"), row.names = FALSE)
write.csv(do.call(rbind, study_diagnostics), file.path(study_output, "sampler_diagnostics.csv"), row.names = FALSE)
message("Saved matched measurement and repeated-validation study to ", study_output)
