script <- normalizePath(sub("^--file=", "", grep("^--file=", commandArgs(FALSE), value = TRUE)[1]))
suppressPackageStartupMessages(library(mgcv))
model_dir <- file.path(dirname(dirname(script)), "benchmark/analysis/predictive_salary_models")
source(file.path(model_dir, "model_utils.R"))
source(file.path(model_dir, "model_extensions.R"))
for (expression in parse(file.path(model_dir, "fit_salary_models.R"))) {
  if (is.call(expression) && identical(expression[[1]], as.name("<-")) &&
      is.call(expression[[3]]) && identical(expression[[3]][[1]], as.name("function"))) eval(expression)
}
source(file.path(model_dir, "categorical_gam.R"))
artifact <- jsonlite::fromJSON(file.path(model_dir, "model_artifact.json"), simplifyVector = FALSE)
category_levels <- setNames(lapply(artifact$categoricalFeatures, function(f) unlist(f$levels)),
                           vapply(artifact$categoricalFeatures, `[[`, "", "key"))
ea_levels <- unlist(artifact$eaLevels)
continuous_keys <- c("expenses", "revenue", "staff", "highest_other_base")
rows <- read.csv(file.path(model_dir, "training_data.csv"))
exact <- rows[rows$observation == "exact_base", ]; exact$log_mid <- log(exact$salary_midpoint)

# Compare serialized browser predictions to independent mgcv predictions, including
# every category and profiles with imputed numeric inputs set to their fold centers.
for (highest in c(FALSE, TRUE)) {
  fitted <- fit_categorical_gam(exact, feature_keys_for(highest))
  exported <- artifact$models[[if (highest) "gamCategorical" else "gamCategoricalNoHighest"]]
  frame <- fitted$frame; frame[, grep("_missing$", names(frame))] <- 0
  predicted <- rep(exported$baseline, nrow(exact))
  for (effect in exported$uncertainty$effectBasis) {
    key <- c(highest_other_base = "highestOther", expenses = "expenses", revenue = "revenue", staff = "staff")[[effect$key]]
    curve <- exported$effects[[key]]
    predicted <- predicted + approx(unlist(curve$z), unlist(curve$effect), frame[[paste0("log_", effect$key)]], rule = 2)$y
  }
  for (key in names(exported$categoryEffects)) {
    effect <- exported$categoryEffects[[key]]
    predicted <- predicted + unlist(effect$values)[match(exact[[key]], unlist(effect$levels))]
  }
  stopifnot(max(abs(predicted - as.numeric(predict(fitted$fit, frame)))) < .001)
}

# A vocabulary level absent from training remains a random effect with uncertainty.
heldout_level <- category_levels$focus_area[1]
training <- exact[exact$focus_area != heldout_level, ]
test <- exact[exact$focus_area == heldout_level, ]
fitted <- fit_categorical_gam(training, continuous_keys)
smooth <- Filter(function(s) identical(s$term, "focus_area"), fitted$fit$smooth)[[1]]
coefficient <- smooth$first.para
stopifnot(abs(coef(fitted$fit)[coefficient]) < 1e-8, fitted$fit$Vp[coefficient, coefficient] > 0)
before <- predict_categorical_gam(training, test, continuous_keys)
test$log_mid <- test$log_mid + 10
after <- predict_categorical_gam(training, test, continuous_keys)
stopifnot(all(is.finite(before)), identical(before, after))
test$focus_area[1] <- "Unsupported category"
stopifnot(inherits(try(predict_categorical_gam(training, test, continuous_keys), silent = TRUE), "try-error"))
cat("Categorical GAM export parity, absent-level uncertainty and held-out outcome independence passed\n")
