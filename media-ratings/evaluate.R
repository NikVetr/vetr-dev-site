# Run from repository root with the unzipped MovieLens directory as the argument.
source("media-ratings/fit.R")
args <- commandArgs(trailingOnly = TRUE)
stopifnot(length(args) == 1L)
ratings <- read.csv(file.path(args[1], "ratings.csv"))
set.seed(817)
users <- unique(ratings$userId)
test <- sample(users, ceiling(length(users)/5))
input <- tempfile(fileext = ".csv")
write.csv(ratings[!ratings$userId %in% test, ], input, row.names = FALSE)
scale <- (1:10)/2
train <- read_catalog(input, file.path(args[1], "movies.csv"), scale, 100)
models <- list(reference = fit_reference(train$y, scale), ordinal1 = fit_ordinal(train$y,10,1,180,417),
               ordinal2 = fit_ordinal(train$y,10,2,180,417))
catalog <- list(name = "Training split", items = train$items, scale = scale, models = models)
rows <- ratings[ratings$userId %in% test & ratings$movieId %in% train$items$itemId, ]
set.seed(818)
profiles <- lapply(split(rows, rows$userId), function(block) {
  if (nrow(block) < 2) return(NULL)
  known <- sample.int(nrow(block), min(4L, nrow(block)-1L))
  keyed <- function(rows) as.list(setNames(rows$rating, as.character(rows$movieId)))
  list(ratings = keyed(block[known,]), targets = keyed(block[-known,]))
})
request <- tempfile(fileext = ".json")
jsonlite::write_json(list(catalog = catalog, profiles = Filter(Negate(is.null), profiles)), request,
                     auto_unbox = TRUE, digits = 12)
status <- system2("node", c("media-ratings/evaluate.mjs", shQuote(request)))
if (status != 0L) quit(status = status)
