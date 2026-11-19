# Fit the categorical baseline and a larger class count for the city transfer study.
source("media-ratings/select.R")
args <- commandArgs(trailingOnly = TRUE)
if (length(args) != 4L) stop("Expected ratings.csv, items.csv, catalog.json and work directory.")
catalog <- jsonlite::fromJSON(args[3], simplifyVector = FALSE)
ids <- vapply(catalog$items, "[[", character(1), "itemId")
scale <- unlist(catalog$scale)
y <- read_catalog(args[1], args[2], scale, length(ids), ids)$y
dir.create(args[4], showWarnings = FALSE, recursive = TRUE)
# Use the existing class-selection test people as an outer holdout. Every new
# comparison uses only the four development folds until its settings are locked.
users <- order(rownames(y), method = "radix")
set.seed(1789)
test <- sample(users, ceiling(length(users)/5))
development <- setdiff(users, test)
fold <- integer(nrow(y))
fold[development] <- sample(rep_len(1:4, length(development)))
write.csv(data.frame(user = rownames(y), fold), file.path(args[4], "folds.csv"), row.names = FALSE)
read_ints <- function(name) {
  file <- file.path(args[4], paste0("swipes-", name, ".bin"))
  readBin(file, integer(), n = file.size(file) / 4, size = 4L, endian = "little")
}
ix <- read_ints("i")
wide <- Matrix::sparseMatrix(i = ix, p = read_ints("p"), x = 1,
                             dims = read_ints("dims"), index1 = FALSE)
with_swipes <- which(Matrix::rowSums(wide) > 0)
panel_users <- as.integer(rownames(y)) + 1L
for (j in seq_along(ids)) {
  columns <- as.integer(ids[j]) * length(scale) + seq_along(scale)
  raw <- as.vector(wide[panel_users, columns] %*% seq_along(scale))
  stopifnot(all(raw == ifelse(is.na(y[,j]), 0L, y[,j])))
}
for (f in c(1:4, 0L)) {
  train <- if (f == 0L) development else development[fold[development] != f]
  design <- rating_design(y[train, , drop = FALSE], length(scale))
  models <- list()
  for (k in c(8L, 16L)) {
    message("Fold ", f, ", K=", k, ", training users=", length(train))
    models[[paste0("K", k)]] <- fit_latent_class(design, k, 8, catalog$fit$seed, max_iter = 2400L)
  }
  jsonlite::write_json(models, file.path(args[4], paste0("classes-", f, ".json")),
                       auto_unbox = TRUE, digits = 15)

  withheld <- setdiff(panel_users, panel_users[train])
  rows <- setdiff(with_swipes, withheld)
  design <- categorical_design(wide[rows, ], length(scale))
  message("Fold ", f, ", wider K=8, training users=", length(rows), ", swipes=", design$observed)
  fit <- fit_latent_class(design, 8, 8, catalog$fit$seed)
  fit$components <- lapply(fit$components, function(c) {
    c$probabilities <- c$probabilities[as.integer(ids) + 1L, , drop = FALSE]
    c
  })
  jsonlite::write_json(list(model = fit, trainingUsers = length(rows),
                            trainingSwipes = design$observed),
                       file.path(args[4], paste0("wide-", f, ".json")), auto_unbox = TRUE, digits = 15)
}
