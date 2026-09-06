#!/usr/bin/env Rscript
# Export immutable, fold-specific Stan inputs. The ordinary fit script imports
# the returned chain CSVs and applies exactly the same production diagnostics.
args <- commandArgs(trailingOnly = TRUE)
if (length(args) != 1L) stop("Usage: prepare_cluster_fits.R CEO_PROJECT_ROOT")
project <- normalizePath(args[1])
script <- file.path(project, "benchmark/analysis/predictive_salary_models/fit_salary_models.R")
for (expression in parse(script)) {
  if (grepl("^if \\(functions_only\\)", paste(deparse(expression), collapse = " "))) break
  eval(expression, .GlobalEnv)
}
if (!nzchar(Sys.getenv("SALARY_CLUSTER_PREPARE"))) stop("Set SALARY_CLUSTER_PREPARE to the request output directory")
compiled_model <- list()
for (smooth in c(FALSE, TRUE)) for (ads in c(FALSE, TRUE)) for (highest in c(FALSE, TRUE)) {
  offset <- 400L * smooth + 200L * ads + 100L * highest
  for (fold in 1:10) {
    result <- fit_stan(z[z$outer_fold != fold & (ads | z$source == "filing"), ],
      20260903 + fold + offset, highest, smooth = smooth)
    message(if (is.null(result$prepared)) "cached fit; no request needed" else paste("prepared", result$prepared))
  }
  result <- fit_stan(z[ads | z$source == "filing", ],
    20262903 + offset + if (!smooth && ads) 800L else 0L, highest, full = TRUE, smooth = smooth)
  message(if (is.null(result$prepared)) "cached full fit; no request needed" else paste("prepared full", result$prepared))
}
