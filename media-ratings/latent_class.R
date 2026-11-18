# Product-categorical mixture of explicit ratings. One row per respondent, one
# sparse column per item/category. Missing items contribute no likelihood term.
rating_design <- function(y, levels) {
  observed <- which(!is.na(y), arr.ind = TRUE)
  if (!nrow(observed) || any(colSums(!is.na(y)) == 0)) stop("Each training item needs observations.")
  d <- ncol(y)
  X <- Matrix::sparseMatrix(i = observed[,1], j = (observed[,2]-1L)*levels + y[observed],
                            x = 1, dims = c(nrow(y), d*levels))
  counts <- matrix(Matrix::colSums(X), levels, d)
  global <- (rowSums(counts) + 0.5)/(sum(counts) + levels/2)
  pooled <- sweep(counts + 5*global, 2, colSums(counts) + 5, "/")
  list(X = X, pooled = pooled, levels = levels, d = d, n = nrow(y), observed = nrow(observed))
}

# MAP-EM with a pooled item distribution supplying 'strength' pseudo-ratings
# per item and class. Choose the best penalized objective across seeded starts.
fit_latent_class <- function(design, k, strength, seed = 417L, starts = 2L, max_iter = 1200L) {
  with(design, {
    stopifnot(k >= 1, k <= n, k == as.integer(k), strength > 0, starts >= 1, max_iter >= 2)
    set.seed(seed)
    best <- NULL
    for (start in seq_len(if (k == 1) 1L else starts)) {
      resp <- matrix(rexp(n*k), n, k)
      resp <- resp/rowSums(resp)
      previous <- -Inf
      converged <- FALSE
      for (iter in seq_len(max_iter)) {
        weights <- (colSums(resp) + 1)/(n+k)
        counts <- as.matrix(Matrix::crossprod(X, resp)) + strength*as.vector(pooled)
        # Each column of this reshape represents one item in one class.
        dim(counts) <- c(levels,d*k)
        emission <- sweep(counts,2,colSums(counts),"/")
        dim(emission) <- c(levels*d,k)
        log_emission <- log(emission)
        joint <- sweep(as.matrix(X %*% log_emission),2,log(weights),"+")
        largest <- joint[,1]
        if (k > 1) for (g in 2:k) largest <- pmax(largest, joint[,g])
        shifted <- exp(joint-largest)
        mass <- rowSums(shifted)
        objective <- sum(largest + log(mass)) + sum(log(weights)) +
          strength*sum(as.vector(pooled)*log_emission)
        if (objective < previous - 1e-7*max(1,abs(objective))) stop("Latent-class EM objective decreased.")
        converged <- objective - previous <= 1e-7*observed
        if (converged) break
        resp <- shifted/mass
        previous <- objective
      }
      if (is.null(best) || objective > best$objective) {
        components <- lapply(order(weights, decreasing = TRUE), function(g)
          list(weight = weights[g], probabilities = t(matrix(emission[,g], levels, d))))
        best <- list(kind = "latent-class", components = components, strength = strength,
                     objective = objective, iterations = iter, converged = converged)
      }
    }
    if (!best$converged) stop("Latent-class EM reached its iteration limit for K=", k, ", strength=", strength)
    best
  })
}
