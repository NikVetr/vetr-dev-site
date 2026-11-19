# Compare the same categorical fit with and without destination similarities.
source("media-ratings/select.R")
args <- commandArgs(trailingOnly = TRUE)
stopifnot(length(args) == 4L)
catalog <- jsonlite::fromJSON(args[3], simplifyVector = FALSE)
ids <- vapply(catalog$items, "[[", character(1), "itemId")
scale_values <- unlist(catalog$scale)
y <- read_catalog(args[1], args[2], scale_values, length(ids), ids)$y
set.seed(491)
users <- sample(seq_len(nrow(y)))
split <- cut(seq_along(users), c(0, floor(.7 * nrow(y)), floor(.85 * nrow(y)), nrow(y)), labels = FALSE)
fit <- fit_latent_class(
  rating_design(y[users[split == 1], ], length(scale_values)),
  8, catalog$models$latentClass$strength, catalog$fit$seed
)
attributes <- do.call(rbind, lapply(catalog$items, function(it) {
  a <- it$annotations
  data.frame(
    coast = a$coast, region = a$region, country = a$country,
    temperature = a$temperature, rainfall = log(a$precipitation), income = log(a$gdp)
  )
}))
# Equal weight per variable: categorical mismatch, or squared standardized difference.
distance <- matrix(0, length(ids), length(ids))
for (column in attributes) {
  distance <- distance + if (is.numeric(column)) {
    as.matrix(dist(scale(column)))^2
  } else {
    outer(column, column, "!=")
  }
}
kernel <- exp(-distance / median(distance[upper.tri(distance)]))
beta <- c(0, .25, .5, 1, 1.5)
score <- function(profiles, strengths, fitted = fit) {
  components <- fitted$components
  means <- sapply(components, function(c) c$probabilities %*% scale_values)
  prior <- log(vapply(components, "[[", numeric(1), "weight"))

  losses <- array(NA_real_, c(length(profiles), length(strengths), 3L))
  for (i in seq_along(profiles)) {
    p <- profiles[[i]]
    obs <- match(names(p$ratings), ids)
    target <- match(names(p$targets), ids)
    value <- as.numeric(unlist(p$ratings))
    truth <- as.numeric(unlist(p$targets))
    evidence <- vapply(
      components, function(c) log(c$probabilities[cbind(obs, match(value, scale_values))]),
      numeric(length(obs))
    )
    dim(evidence) <- c(length(obs), length(components))
    logw <- prior + colSums(evidence)
    posterior <- function(x) {
      w <- exp(x - max(x))
      w / sum(w)
    }
    base <- Reduce("+", Map(function(c, w) w * c$probabilities[target, , drop = FALSE], components, posterior(logw)))
    residual <- vapply(seq_along(obs), function(j) {
      value[j] - sum(posterior(logw - evidence[j, ]) * means[obs[j], ])
    }, numeric(1))
    signal <- drop(kernel[target, obs, drop = FALSE] %*%
      solve(kernel[obs, obs, drop = FALSE] + diag(.5, length(obs)), residual))
    for (j in seq_along(strengths)) {
      probs <- base * exp(strengths[j] * outer(signal, scale_values - mean(scale_values)))
      probs <- probs / rowSums(probs)
      losses[i, j, ] <- c(
        -mean(log(probs[cbind(seq_along(target), match(truth, scale_values))])),
        mean((drop(probs %*% scale_values) - truth)^2),
        mean((probs[, length(scale_values)] - (truth == max(scale_values)))^2)
      )
    }
  }
  losses
}
validation <- make_profiles(y, users[split == 2], scale_values, 492)
test <- make_profiles(y, users[split == 3], scale_values, 493)
val <- score(validation, beta)
best <- beta[which.min(colMeans(val[, , 1]))]
holdout <- score(test, c(0, best))
metrics <- function(x, b) data.frame(beta = b, logLoss = colMeans(x[, , 1]), rmse = sqrt(colMeans(x[, , 2])), brier = colMeans(x[, , 3]))
# A Cholesky row embedding reproduces the geographic kernel in the shared
# class-similarity scorer. Both the release and the held-out fit use these rows.
geography <- list(kind = "class-similarity", base = "latentClass",
                  features = t(chol(kernel)), ridge = .5, strength = best)
check <- list(name = catalog$name, scale = catalog$scale, items = catalog$items,
              models = list(latentClass = fit, geography = geography))
input <- tempfile(fileext = ".json")
output <- tempfile(fileext = ".json")
jsonlite::write_json(list(catalog = check, profiles = test, threshold = max(scale_values)),
                     input, auto_unbox = TRUE, digits = NA)
status <- system2("node", c("media-ratings/score.mjs", input, output))
if (status != 0L) stop("Shared scorer could not evaluate the held-out destination profiles")
js <- jsonlite::fromJSON(output)
stopifnot(identical(js$model, c("latentClass", "geography")))
r_metrics <- metrics(holdout, c(0, best))
stopifnot(max(abs(js$logLoss - r_metrics$logLoss), abs(sqrt(js$mse) - r_metrics$rmse),
              abs(js$brier - r_metrics$brier)) < 1e-10)
unlink(c(input, output))
delta <- holdout[, 2, 1] - holdout[, 1, 1]
interval <- mean(delta) + c(-1, 1) * 1.96 * sd(delta) / sqrt(length(delta))
# Repeat the locked comparison with one out-of-fold prediction per eligible
# person. This also includes people used in the earlier parameter selection.
set.seed(4632)
fold <- sample(rep_len(seq_len(5L), nrow(y)))
fold_loss <- lapply(seq_len(5L), function(k) {
  f <- fit_latent_class(rating_design(y[fold != k, ], length(scale_values)),
                        8, catalog$models$latentClass$strength, catalog$fit$seed)
  evaluate <- make_profiles(y, which(fold == k), scale_values, 4632L + k)
  s <- score(evaluate, c(0, best), f)
  per_person <- matrix(s, nrow = length(evaluate))
  list(fold = k, users = length(evaluate), targets = sum(lengths(lapply(evaluate, "[[", "targets"))),
       perPerson = per_person)
})
pooled <- do.call(rbind, lapply(fold_loss, "[[", "perPerson"))
cv_delta <- pooled[, 2] - pooled[, 1]
cv_means <- colMeans(pooled)
cv <- list(folds = length(fold_loss), users = nrow(pooled),
           targets = sum(vapply(fold_loss, "[[", numeric(1), "targets")),
           logLoss = unname(cv_means[1:2]), rmse = unname(sqrt(cv_means[3:4])), brier = unname(cv_means[5:6]),
           pairedDifference = mean(cv_delta), ci95 = mean(cv_delta) + c(-1, 1) * 1.96 * sd(cv_delta) / sqrt(nrow(pooled)))
jsonlite::write_json(
  list(
    validationUsers = length(validation), testUsers = length(test),
    selected = best, validation = metrics(val, beta), holdout = r_metrics,
    testRatings = js$targets[1], repeatedOutOfFold = cv,
    pairedLogLossVersusClasses = list(difference = mean(delta), ci95 = interval)
  ),
  args[4],
  auto_unbox = TRUE, digits = 12, pretty = TRUE
)
