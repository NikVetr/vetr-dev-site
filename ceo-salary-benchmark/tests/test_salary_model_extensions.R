script <- normalizePath(sub("^--file=", "", grep("^--file=", commandArgs(FALSE), value = TRUE)[1]))
model_dir <- file.path(dirname(dirname(script)), "benchmark/analysis/predictive_salary_models")
source(file.path(model_dir, "model_extensions.R"))
knots <- c(-1, -.3, .3, 1)
adjustment <- cbind(c(.1, .2), c(.2, .3), c(1, 2))
stopifnot(identical(dim(curvature_basis(.5, knots, adjustment)), c(1L, 2L)),
  max(abs(curvature_basis(.5, knots, adjustment) - curvature_basis(c(.5, 1), knots, adjustment)[1, ])) < 1e-12)
set.seed(521)
x <- matrix(rnorm(60), 30, 2)
y <- 12.5 + .2 * sin(x[, 1]) + rnorm(30, 0, .2)
fit <- fit_gp_design(y, x)
prediction <- predict_gp_design(fit, x, joint = TRUE)
stopifnot(all(prediction$variance > 0), all(prediction$sd > sqrt(prediction$variance)),
  max(abs(diag(prediction$covariance) - prediction$variance)) < 1e-10,
  min(eigen(prediction$covariance, symmetric = TRUE)$values) > -1e-8)
# A proper CRPS rewards a correctly located narrow distribution over either a
# displaced or needlessly diffuse distribution at the same observed outcome.
crps <- normal_mixture_crps(0, 0, .2)
stopifnot(crps < normal_mixture_crps(0, 1, .2), crps < normal_mixture_crps(0, 0, 2),
  abs(normal_mixture_crps(0, rep(0, 5), rep(.2, 5)) - crps) < 1e-12)
cat("GP posterior covariance and proper-distribution scoring checks passed\n")
