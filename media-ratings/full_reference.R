# Same pairwise-complete logit covariances and nearPD projection as fit_reference.
# Stream respondents in blocks; accumulate only the pairwise sufficient statistics.
args <- commandArgs(trailingOnly = TRUE)
stopifnot(length(args) == 2)
dir <- args[1]
catalog <- jsonlite::fromJSON(args[2], simplifyVector = FALSE)
d <- length(catalog$items)
stopifnot(identical(as.numeric(unlist(catalog$scale)), (1:10) / 2))
n <- nrow(read.csv(file.path(dir, "users.csv")))
stopifnot(file.size(file.path(dir, "ratings.u8")) == n * d)
excluded <- read.csv(file.path(dir, "split.csv"))$row + 1L
fit <- function(holdout, label) {
  counts <- sums <- products <- matrix(0, d, d)
  con <- file(file.path(dir, "ratings.u8"), "rb")
  on.exit(close(con))
  lookup <- c(0, qlogis(pmin((1:10) / 2, 4.875) / 5))
  for (start in seq(1, n, by = 2048)) {
    rows <- start:min(start + 2047, n)
    y <- matrix(readBin(con, integer(), length(rows) * d, size = 1, signed = FALSE), ncol = d, byrow = TRUE)
    if (holdout) y <- y[!rows %in% excluded, , drop = FALSE]
    m <- (y != 0) * 1.0
    z <- matrix(lookup[y + 1L], ncol = d)
    counts <- counts + crossprod(m)
    sums <- sums + crossprod(z, m)
    products <- products + crossprod(z)
  }
  S <- (products - sums * t(sums) / counts) / (counts - 1)
  stopifnot(all(counts > 1))
  model <- list(
    kind = "logit-point", endpoint = 4.875, cuts = qlogis(seq(.75, 4.75, .5) / 5),
    components = list(list(weight = 1, mean = diag(sums) / diag(counts), covariance = as.matrix(Matrix::nearPD(S)$mat)))
  )
  jsonlite::write_json(model, file.path(dir, paste0(label, "-reference.json")), digits = 14, auto_unbox = TRUE)
}
fit(TRUE, "large")
fit(FALSE, "release")
