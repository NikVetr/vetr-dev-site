# Fixed, salary-blind factor vocabularies retain uncertainty for unobserved levels.
gam_category_levels <- function() c(category_levels, list(ea_relationship = ea_levels))

categorical_gam_frame <- function(rows, x) {
  frame <- data.frame(x, check.names = FALSE)
  for (key in names(gam_category_levels())) {
    frame[[key]] <- factor(rows[[key]], levels = gam_category_levels()[[key]])
    if (anyNA(frame[[key]])) stop("Unknown GAM category: ", key)
  }
  frame
}

fit_categorical_gam <- function(rows, feature_keys) {
  pp <- fit_preprocessing(rows, feature_keys)
  x <- transform_continuous(rows, pp, feature_keys)$X
  numeric <- fit_gam_design(rows$log_mid, x, feature_keys)
  frame <- categorical_gam_frame(rows, x)
  frame$y <- rows$log_mid
  terms <- c(paste0("s(", numeric$value_columns, ", k=4, bs='cr')"), numeric$active_missing_columns,
             paste0("s(", names(gam_category_levels()), ", bs='re')"))
  fit <- mgcv::gam(as.formula(paste("y ~", paste(terms, collapse = " + "))),
    data = frame, method = "REML", drop.unused.levels = FALSE)
  if (any(!is.finite(coef(fit))) || !isTRUE(fit$converged) || fit$outer.info$conv != "full convergence") {
    stop("Categorical GAM did not converge")
  }
  list(fit = fit, preprocessing = pp, x = x, frame = frame,
       value_columns = numeric$value_columns, active_missing_columns = numeric$active_missing_columns)
}

predict_categorical_gam <- function(training, test, feature_keys) {
  fitted <- fit_categorical_gam(training, feature_keys)
  frame <- categorical_gam_frame(test, transform_continuous(test, fitted$preprocessing, feature_keys)$X)
  as.numeric(predict(fitted$fit, frame))
}

serialize_categorical_gam <- function(fitted, feature_keys, oof_rows, label) {
  fit <- fitted$fit
  zero <- fitted$frame[1, , drop = FALSE]
  zero[, colnames(fitted$x)] <- 0
  levels <- gam_category_levels()
  for (key in names(levels)) zero[[key]] <- factor(levels[[key]][1], levels = levels[[key]])
  reference_basis <- as.numeric(predict(fit, zero, type = "lpmatrix"))
  baseline_basis <- reference_basis
  category_effects <- list()
  for (key in names(levels)) {
    grid <- zero[rep(1, length(levels[[key]])), , drop = FALSE]
    grid[[key]] <- factor(levels[[key]], levels = levels[[key]])
    raw <- sweep(predict(fit, grid, type = "lpmatrix"), 2, reference_basis, "-")
    center <- if (key == "ea_relationship") rep(0, ncol(raw)) else colMeans(raw)
    baseline_basis <- baseline_basis + center
    basis <- sweep(raw, 2, center, "-")
    category_effects[[key]] <- list(levels = unname(levels[[key]]), basis = unname(basis),
      values = as.numeric(basis %*% coef(fit)))
  }
  effect_names <- c(expenses = "expenses", revenue = "revenue", staff = "staff", highest_other_base = "highestOther")
  effects <- list(); effect_basis <- list()
  for (key in feature_keys) {
    column <- paste0("log_", key)
    support <- range(c(-3.5, 3.5, fitted$x[, column]))
    values <- seq(support[1], support[2], length.out = max(141L, ceiling(diff(support) / .05) + 1L))
    grid <- zero[rep(1, length(values)), , drop = FALSE]; grid[[column]] <- values
    basis <- sweep(predict(fit, grid, type = "lpmatrix"), 2, reference_basis, "-")
    effects[[effect_names[[key]]]] <- list(z = values, effect = as.numeric(basis %*% coef(fit)))
    effect_basis[[length(effect_basis) + 1L]] <- list(key = key, z = values, basis = unname(basis))
  }
  covariance <- vcov(fit, unconditional = TRUE)
  if (is.null(fit$Vc)) stop("Missing smoothing-parameter uncertainty correction")
  coefficient_draws <- coefficient_simulation(coef(fit), covariance)
  oof <- validate_simple_oof(oof_rows, label)
  # Check exported additive decomposition against mgcv on every training profile.
  basis <- matrix(baseline_basis, nrow(exact), length(baseline_basis), byrow = TRUE)
  for (key in feature_keys) {
    grid <- zero[rep(1, nrow(exact)), , drop = FALSE]; grid[[paste0("log_", key)]] <- fitted$x[, paste0("log_", key)]
    basis <- basis + sweep(predict(fit, grid, type = "lpmatrix"), 2, reference_basis, "-")
  }
  for (key in names(levels)) basis <- basis + category_effects[[key]]$basis[match(exact[[key]], levels[[key]]), , drop = FALSE]
  complete_frame <- fitted$frame; complete_frame[, grep("_missing$", names(complete_frame))] <- 0
  if (max(abs(as.numeric(basis %*% coef(fit)) - as.numeric(predict(fit, complete_frame)))) > 1e-8) stop("Exported GAM decomposition differs from mgcv")
  active <- c(fitted$value_columns, fitted$active_missing_columns)
  list(includeAdvertisedRanges = FALSE, includeHighestOtherPay = "highest_other_base" %in% feature_keys,
    preprocessing = json_preprocessing(fitted$preprocessing), candidateDesignColumns = unname(colnames(fitted$x)),
    activeDesignColumns = unname(active), droppedDesignColumns = unname(setdiff(colnames(fitted$x), active)),
    baseline = sum(baseline_basis * coef(fit)), effects = effects, categoryEffects = category_effects,
    uncertainty = list(method = "mgcv Gaussian coefficient approximation with smoothing-parameter correction; organization bootstrap of out-of-fold residuals; fixed preprocessing",
      coefficientDraws = unname(coefficient_draws), baselineBasis = baseline_basis, effectBasis = effect_basis,
      residualDraws = replicate(256L, oof$residuals[bootstrap_indices(exact$organization_group[match(oof$ids, exact$id)])], simplify = FALSE)),
    residuals = oof$residuals, residualRecordIds = oof$ids, trainingRecordIds = unname(exact$id),
    intervalCalibration = "nested organization-fold residual KDE",
    diagnostics = list(trainingN = nrow(exact), edf = sum(fit$edf), residualScale = sqrt(summary(fit)$scale),
      categoryPenalty = as.list(fit$sp), coefficientCount = length(coef(fit)), convergence = fit$outer.info$conv))
}
