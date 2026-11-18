# Compare the same categorical fit with and without destination similarities.
source("media-ratings/select.R")
args <- commandArgs(trailingOnly = TRUE)
stopifnot(length(args) == 4)
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
components <- fit$components
means <- sapply(components, function(c) c$probabilities %*% scale_values)
prior <- log(vapply(components, "[[", numeric(1), "weight"))
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
score <- function(profiles, strengths) {
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
jsonlite::write_json(
  list(
    validationUsers = length(validation), testUsers = length(test),
    selected = best, validation = metrics(val, beta), holdout = metrics(holdout, c(0, best))
  ),
  args[4],
  auto_unbox = TRUE, digits = 12, pretty = TRUE
)
