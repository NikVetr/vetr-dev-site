# Fit a catalog from explicit, ordered user ratings. Matrix and jsonlite are the only packages.
read_catalog <- function(ratings_file, items_file, scale, top, ids = NULL) {
  ratings <- read.csv(ratings_file, colClasses = "character", check.names = FALSE)
  items <- read.csv(items_file, colClasses = "character", check.names = FALSE)
  id <- if ("itemId" %in% names(ratings)) "itemId" else "movieId"
  stopifnot(all(c("userId", id, "rating") %in% names(ratings)), all(c(id, "title") %in% names(items)))
  names(ratings)[names(ratings) == id] <- "itemId"
  names(items)[names(items) == id] <- "itemId"
  ratings$rating <- as.numeric(ratings$rating)
  stopifnot(length(scale) >= 3, all(is.finite(scale)), all(diff(scale) > 0),
            all(ratings$rating %in% scale), !anyDuplicated(ratings[c("userId", "itemId")]),
            !anyNA(ratings$userId), all(nzchar(ratings$userId)), !anyNA(items$itemId),
            all(nzchar(items$itemId)), !anyDuplicated(items$itemId), !anyNA(items$title),
            all(nzchar(items$title)), all(ratings$itemId %in% items$itemId), top >= 2)
  if (is.null(ids)) ids <- head(names(sort(table(ratings$itemId), decreasing = TRUE)), top)
  stopifnot(length(ids) > 0, !anyDuplicated(ids), all(ids %in% items$itemId))
  rows <- ratings[ratings$itemId %in% ids, ]
  users <- unique(rows$userId)
  y <- matrix(NA_integer_, length(users), length(ids), dimnames = list(users, ids))
  y[cbind(match(rows$userId, users), match(rows$itemId, ids))] <- match(rows$rating, scale)
  list(y = y, items = items[match(ids, items$itemId), c("itemId", "title")])
}

# The pilot used pairwise covariances, then Higham's nearest positive-definite matrix.
fit_reference <- function(y, scale) {
  if (min(scale) <= 0) stop("The historical logit reference requires a positive rating scale.")
  endpoint <- max(scale) - tail(diff(scale), 1) / 4
  z <- matrix(qlogis(pmin(scale[y], endpoint) / max(scale)), nrow(y))
  S <- cov(z, use = "pairwise.complete.obs")
  S[is.na(S)] <- 0
  if (any(diag(S) <= 0)) stop("Each reference item needs variation in at least two ratings.")
  list(kind = "logit-point", endpoint = unname(endpoint),
       cuts = qlogis((head(scale, -1) + diff(scale)/2) / max(scale)),
       components = list(list(weight = 1, mean = colMeans(z, na.rm = TRUE),
                              covariance = as.matrix(Matrix::nearPD(S)$mat))))
}

# Stochastic-approximation EM: Gibbs draws for class and all liabilities, then
# running expected complete-data sufficient statistics with covariance shrinkage.
fit_ordinal <- function(y, levels, k, iterations, seed) {
  set.seed(seed)
  n <- nrow(y); d <- ncol(y)
  stopifnot(k >= 1, k <= n, iterations >= 20, all(colSums(!is.na(y)) >= 2))
  bounds <- qnorm((0:levels)/levels)
  lo <- matrix(bounds[y], n, d); hi <- matrix(bounds[y + 1L], n, d)
  lo[is.na(lo)] <- -Inf; hi[is.na(hi)] <- Inf
  z <- matrix(qnorm((y - 0.5)/levels), n, d)
  for (j in seq_len(d)) z[is.na(z[, j]), j] <- mean(z[, j], na.rm = TRUE)
  group <- if (k == 1) rep(1L, n) else kmeans(z, k, nstart = 5)$cluster
  params <- lapply(seq_len(k), function(g) list(mean = colMeans(z[group == g,, drop = FALSE]),
                                                  covariance = diag(d), weight = mean(group == g)))
  stats <- lapply(seq_len(k), function(g) list(n = 0, sum = numeric(d), cross = matrix(0, d, d)))
  for (iter in seq_len(iterations)) {
    factors <- lapply(params, function(p) chol(p$covariance))
    for (g in seq_len(k)) {
      p <- params[[g]]
      # Condition each liability on the current values of all the others.
      index <- which(group == g)
      if (!length(index)) next
      Q <- chol2inv(factors[[g]])
      centered <- sweep(z[index,,drop = FALSE], 2, p$mean)
      for (j in sample.int(d)) {
        s <- 1/sqrt(Q[j,j])
        mu <- p$mean[j] + centered[,j] - drop(centered %*% Q[,j])/Q[j,j]
        a <- (lo[index,j] - mu)/s; b <- (hi[index,j] - mu)/s
        # Reflect right-tail intervals before inverse-CDF sampling.
        sign <- ifelse(a > 0, -1, 1)
        left <- pnorm(ifelse(sign < 0, -b, a)); right <- pnorm(ifelse(sign < 0, -a, b))
        u <- left + runif(length(index)) * (right - left)
        draw <- qnorm(u)
        if (any(!is.finite(draw))) stop("Truncated-normal draw exceeded numerical precision.")
        centered[,j] <- mu + sign*s*draw - p$mean[j]
      }
      z[index,] <- sweep(centered, 2, p$mean, "+")
    }
    # One draw per respondent preserves seeded runs, including the K=1 reference.
    uniform <- runif(n)
    if (k > 1L) {
      logp <- matrix(0, n, k)
      for (g in seq_len(k)) {
        p <- params[[g]]
        U <- factors[[g]]
        white <- forwardsolve(t(U), t(sweep(z, 2, p$mean)))
        logp[,g] <- log(p$weight) - sum(log(diag(U))) - colSums(white^2)/2
      }
      largest <- logp[,1]
      for (g in 2:k) largest <- pmax(largest, logp[,g])
      probs <- exp(logp - largest)
      u <- uniform*rowSums(probs)
      group <- rep(1L, n)
      cumulative <- numeric(n)
      for (g in seq_len(k-1L)) {
        cumulative <- cumulative + probs[,g]
        group <- group + as.integer(u > cumulative)
      }
    }
    rate <- max(1, iter - floor(iterations/3))^-0.7
    for (g in seq_len(k)) {
      block <- z[group == g,,drop = FALSE]
      s <- stats[[g]]
      s$n <- (1-rate)*s$n + rate*nrow(block)
      s$sum <- (1-rate)*s$sum + rate*colSums(block)
      s$cross <- (1-rate)*s$cross + rate*crossprod(block)
      if (s$n < 1) stop("Mixture component emptied; reduce K or change the initialization seed.")
      m <- s$sum/s$n
      # A ridge of d+2 identity pseudo-observations stabilizes sparse covariance estimates.
      ridge <- d + 2
      params[[g]] <- list(weight = s$n/n, mean = m,
                          covariance = (s$cross - s$n*tcrossprod(m) + ridge*diag(d))/(s$n + ridge))
      stats[[g]] <- s
    }
  }
  list(kind = "ordinal-probit", cuts = bounds[2:levels], components = params)
}

if (sys.nframe() == 0L) {
  args <- commandArgs(trailingOnly = TRUE)
  if (!length(args) %in% 9:10) stop("Usage: Rscript fit.R ratings.csv items.csv out.json name scale_csv top K iterations seed [scale_labels_csv]")
  scale <- as.numeric(strsplit(args[5], ",", fixed = TRUE)[[1]])
  ints <- as.numeric(args[6:9])
  stopifnot(all(is.finite(ints)), all(ints == floor(ints)))
  catalog <- read_catalog(args[1], args[2], scale, ints[1])
  ordinal <- fit_ordinal(catalog$y, length(scale), ints[2], ints[3], ints[4])
  models <- list(ordinal = ordinal)
  if (ints[2] > 1) models$ordinal1 <- fit_ordinal(catalog$y, length(scale), 1, ints[3], ints[4])
  if (min(scale) > 0) models$reference <- fit_reference(catalog$y, scale)
  bundle <- list(name = args[4], scale = scale, items = catalog$items, models = models,
                 fit = list(users = nrow(catalog$y), ratings = sum(!is.na(catalog$y)),
                            iterations = ints[3], seed = ints[4]))
  if (length(args) == 10) {
    bundle$scaleLabels <- strsplit(args[10], ",", fixed = TRUE)[[1]]
    stopifnot(length(bundle$scaleLabels) == length(scale), all(nzchar(bundle$scaleLabels)))
  }
  jsonlite::write_json(bundle, args[3], auto_unbox = TRUE, digits = 12)
}
