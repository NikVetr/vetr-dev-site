# Natural cubic curvature terms are orthogonal to the intercept and linear
# trend in the observed training inputs. Knots and scaling never use test rows.
curvature_basis <- function(x, knots, adjustment = NULL) {
  last <- pmax(x - knots[4], 0)^3
  reference <- (pmax(x - knots[3], 0)^3 - last) / (knots[4] - knots[3])
  basis <- matrix(vapply(1:2, function(j) (pmax(x - knots[j], 0)^3 - last) / (knots[4] - knots[j]) - reference,
                         numeric(length(x))), nrow = length(x), ncol = 2)
  if (!is.null(adjustment)) for (j in 1:2) {
    basis[, j] <- (basis[, j] - adjustment[j, 1] - adjustment[j, 2] * x) / adjustment[j, 3]
  }
  basis
}

fit_curvature <- function(rows, preprocessing, feature_keys) {
  lapply(feature_keys, function(key) {
    x <- (log(rows[[key]][is.finite(rows[[key]]) & rows[[key]] > 0]) - preprocessing[[key]]$center) / preprocessing[[key]]$scale
    knots <- unname(quantile(x, c(.1, .35, .65, .9)))
    if (any(diff(knots) <= 1e-8)) stop("Insufficient distinct spline knots: ", key)
    raw <- curvature_basis(x, knots)
    adjustment <- t(vapply(1:2, function(j) {
      fit <- lm.fit(cbind(1, x), raw[, j])
      c(fit$coefficients, sd(fit$residuals))
    }, numeric(3)))
    if (any(!is.finite(adjustment)) || any(adjustment[, 3] < 1e-8)) stop("Degenerate spline basis: ", key)
    list(key = key, knots = knots, adjustment = unname(adjustment))
  })
}

# CRPS is a proper score for the entire predictive distribution, in log units.
normal_absolute_moment <- function(delta, scale) {
  delta * (2 * pnorm(delta / scale) - 1) + 2 * scale * dnorm(delta / scale)
}
normal_mixture_crps <- function(y, means, scales, maximum = 256L) {
  keep <- unique(round(seq(1, length(means), length.out = min(maximum, length(means)))))
  means <- means[keep]
  scales <- rep(scales, length.out = max(keep))[keep]
  first <- mean(normal_absolute_moment(y - means, scales))
  second <- mean(normal_absolute_moment(outer(means, means, "-"), sqrt(outer(scales^2, scales^2, "+"))))
  first - second / 2
}

rbf_kernel <- function(x, y, length_scale) {
  distance <- outer(rowSums(x^2), rowSums(y^2), "+") - 2 * tcrossprod(x, y)
  exp(-pmax(distance, 0) / (2 * length_scale^2))
}

fit_gp_design <- function(y, x) {
  objective <- function(theta, details = FALSE) {
    pars <- exp(theta)
    covariance <- 1 + pars[2]^2 * rbf_kernel(x, x, pars[1]) + diag(pars[3]^2, length(y))
    upper <- chol(covariance)
    alpha <- backsolve(upper, forwardsolve(t(upper), y - 12.5))
    value <- sum(log(diag(upper))) + sum((y - 12.5) * alpha) / 2 -
      sum(dnorm(theta, log(c(1, .3, .3)), c(.7, .6, .6), log = TRUE))
    if (details) return(list(trainingX = unname(x), alpha = unname(alpha), cholesky = unname(t(upper)),
                             lengthScale = pars[1], amplitude = pars[2], noise = pars[3], priorMean = 12.5,
                             priorInterceptVariance = 1, objective = value))
    value
  }
  fits <- lapply(c(.4, 1, 3), function(length_scale) optim(log(c(length_scale, .3, .3)), objective,
    method = "L-BFGS-B", lower = log(c(.05, .02, .03)), upper = log(c(20, 2, 1.5))))
  successful <- vapply(fits, function(fit) fit$convergence == 0 && is.finite(fit$value), logical(1))
  if (!all(successful)) stop("GP hyperparameter optimization did not converge in every start")
  best <- fits[[which.min(vapply(fits, `[[`, numeric(1), "value"))]]
  objective(best$par, details = TRUE)
}

predict_gp_design <- function(fit, x, joint = FALSE) {
  kernel <- 1 + fit$amplitude^2 * rbf_kernel(x, fit$trainingX, fit$lengthScale)
  mean <- as.numeric(fit$priorMean + kernel %*% fit$alpha)
  projected <- forwardsolve(fit$cholesky, t(kernel))
  variance <- 1 + fit$amplitude^2 - colSums(projected^2)
  if (any(variance < -1e-8)) stop("Negative GP posterior variance")
  result <- list(mean = mean, variance = pmax(0, variance), sd = sqrt(pmax(0, variance) + fit$noise^2))
  if (joint) result$covariance <- 1 + fit$amplitude^2 * rbf_kernel(x, x, fit$lengthScale) - crossprod(projected)
  result
}

svr_grid <- expand.grid(cost = c(1, 4, 16), gamma = c(.1, .4), epsilon = c(.05, .15))
fit_svr_design <- function(y, x, parameters) {
  e1071::svm(x, y, type = "eps-regression", kernel = "radial", scale = FALSE,
            cost = parameters$cost, gamma = parameters$gamma, epsilon = parameters$epsilon)
}
tune_svr <- function(training, feature_keys) {
  groups <- sort(unique(training$organization_group))
  folds <- setNames(rep(1:4, length.out = length(groups)), groups)
  loss <- matrix(0, nrow(svr_grid), 4L)
  for (fold in 1:4) {
    inside <- folds[training$organization_group] != fold
    pp <- fit_preprocessing(training[inside, ], feature_keys)
    x <- transform_continuous(training[inside, ], pp, feature_keys)$X
    held <- transform_continuous(training[!inside, ], pp, feature_keys)$X
    for (i in seq_len(nrow(svr_grid))) {
      fit <- fit_svr_design(training$log_mid[inside], x, svr_grid[i, ])
      loss[i, fold] <- sum((training$log_mid[!inside] - as.numeric(predict(fit, held)))^2)
    }
  }
  svr_grid[which.min(rowSums(loss)), ]
}

# Group bootstrap keeps filing records for the same organization together.
bootstrap_indices <- function(groups) {
  unique_groups <- unique(groups)
  unlist(lapply(sample(unique_groups, length(unique_groups), replace = TRUE), function(group) which(groups == group)), use.names = FALSE)
}

coefficient_simulation <- function(coefficients, covariance, count = 256L) {
  eigenvalues <- eigen(covariance, symmetric = TRUE)
  if (min(eigenvalues$values) < -1e-8) stop("Coefficient covariance is not positive semidefinite")
  root <- eigenvalues$vectors %*% diag(sqrt(pmax(0, eigenvalues$values)), length(coefficients))
  sweep(matrix(rnorm(count * length(coefficients)), count) %*% t(root), 2, coefficients, "+")
}
