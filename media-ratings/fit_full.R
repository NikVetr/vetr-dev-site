# Full-profile learning curve for the established MAP categorical mixture.
# Run from repository root after prepare_full.py. Folds are respondent-disjoint.
source("media-ratings/latent_class.R")
args <- commandArgs(trailingOnly = TRUE)
stopifnot(length(args) == 2L)
dir <- args[1]
catalog <- jsonlite::fromJSON(args[2], simplifyVector = FALSE)
users <- read.csv(file.path(dir, "users.csv"))
d <- length(catalog$items)
n <- nrow(users)
stopifnot(identical(as.numeric(unlist(catalog$scale)), (1:10) / 2), file.size(file.path(dir, "ratings.u8")) == n * d)
con <- file(file.path(dir, "ratings.u8"), "rb")
y <- matrix(readBin(con, integer(), n * d, size = 1, signed = FALSE), ncol = d, byrow = TRUE)
close(con)
set.seed(8331)
eligible <- which(users$bucket >= 8 & rowSums(y != 0) >= 5)
split <- sample(eligible, 5000)
write.csv(data.frame(row = split - 1L, partition = rep(c("validation", "test"), c(2000, 3000))),
  file.path(dir, "split.csv"),
  row.names = FALSE
)
train <- setdiff(seq_len(n), split)
fit <- function(rows, label) {
  message(format(Sys.time()), " ", label, " users=", length(rows))
  block <- y[rows, , drop = FALSE]
  block[block == 0L] <- NA_integer_
  design <- rating_design(block, 10L)
  model <- fit_latent_class(design, 8, 8, 417L)
  jsonlite::write_json(list(model = model, users = length(rows), ratings = design$observed),
    file.path(dir, paste0(label, ".json")),
    auto_unbox = TRUE, digits = 14
  )
}
# The original 1/32 contains no validation or test users by construction.
fit(which(users$bucket < 8), "small")
fit(intersect(train, which(users$bucket < 64)), "quarter")
fit(train, "large")
fit(seq_len(n), "release")
