args <- commandArgs(trailingOnly = FALSE)
script <- normalizePath(sub("^--file=", "", grep("^--file=", args, value = TRUE)[[1]]))
repo <- dirname(dirname(script))
model_dir <- file.path(repo, "benchmark", "analysis", "predictive_salary_models")
suppressPackageStartupMessages(library(mgcv))
scope <- new.env()
source(file.path(model_dir, "model_utils.R"), local = scope)
# Load the actual fitting functions without triggering sampling or writing artifacts.
for (expression in parse(file.path(model_dir, "fit_salary_models.R"))) {
  if (is.call(expression) && identical(expression[[1]], as.name("<-")) &&
      is.call(expression[[3]]) && identical(expression[[3]][[1]], as.name("function"))) {
    eval(expression, scope)
  }
}
scope$continuous_keys <- c("expenses", "revenue", "staff", "highest_other_base")
scope$z <- read.csv(file.path(model_dir, "training_data.csv"))
scope$z$log_mid <- log(scope$z$salary_midpoint)
scope$z$log_low <- log(scope$z$salary_lower)
scope$z$log_high <- log(scope$z$salary_upper)
original <- scope$z
prediction_columns <- c("predicted_log_salary", "predicted_log_lower80",
                        "predicted_log_upper80", "predicted_log_lower90", "predicted_log_upper90")
for (kind in c("intercept", "scale_linear", "gam")) {
  for (include_highest in if (kind == "intercept") FALSE else c(FALSE, TRUE)) {
    scope$z <- original
    before <- scope$evaluate_simple_model(kind, include_highest)
    scope$z$log_mid[scope$z$outer_fold == 1] <- scope$z$log_mid[scope$z$outer_fold == 1] + 1
    after <- scope$evaluate_simple_model(kind, include_highest)
    held_out <- before$fold == 1
    stopifnot(identical(before[held_out, prediction_columns], after[held_out, prediction_columns]))
    cat(kind, "highest-other:", include_highest, "held-out outcome independence passed\n")
  }
}
