# User-grouped CV on a fixed catalog, followed by independent user holdout and release refit.
source("media-ratings/fit.R")
source("media-ratings/latent_class.R")

candidate_grid <- function(scale, search = list()) {
  allowed <- c("ordinalK","classK","priorStrength","families")
  if (!is.list(search) || length(setdiff(names(search),allowed))) stop("Unknown search grid option.")
  values <- function(name, default, integer = FALSE) {
    x <- if (name %in% names(search)) unlist(search[[name]]) else default
    if (!is.numeric(x) || !length(x) || any(!is.finite(x)) || any(x <= 0) ||
        (integer && any(x != floor(x)))) stop("Invalid grid: ",name)
    sort(unique(x))
  }
  ordinal_k <- values("ordinalK",c(1,2,4),TRUE)
  classes <- expand.grid(k = values("classK",c(1,2,4,8),TRUE),
                         strength = values("priorStrength",c(8,64)))
  classes$model <- paste0("class",classes$k,"_prior",classes$strength)
  classes$family <- "latent-class"
  dense <- data.frame(k = ordinal_k, strength = NA_real_, model = ifelse(ordinal_k == 2, "ordinal", paste0("ordinal",ordinal_k)),
                      family = "ordinal-probit")
  grid <- rbind(dense, classes)
  if (min(scale) > 0) grid <- rbind(grid, data.frame(k = 1L, strength = NA_integer_,
                                                     model = "reference", family = "logit-point"))
  if (!is.null(search$families)) {
    families <- unlist(search$families)
    if (!length(families) || !all(families %in% grid$family)) stop("Unknown model family.")
    grid <- grid[grid$family %in% families,,drop = FALSE]
  }
  grid
}

fit_candidates <- function(y, scale, grid, iterations, seed) {
  design <- rating_design(y, length(scale))
  models <- lapply(seq_len(nrow(grid)), function(i) {
    spec <- grid[i,]
    switch(spec$family,
      "ordinal-probit" = fit_ordinal(y, length(scale), spec$k, iterations, seed),
      "logit-point" = fit_reference(y, scale),
      "latent-class" = fit_latent_class(design, spec$k, spec$strength, seed))
  })
  setNames(models, grid$model)
}

make_profiles <- function(y, rows, scale, seed) {
  set.seed(seed)
  profiles <- lapply(rows, function(i) {
    rated <- which(!is.na(y[i,]))
    if (length(rated) < 2L) return(NULL)
    known <- rated[sample.int(length(rated), min(4L,length(rated)-1L))]
    keyed <- function(j) as.list(setNames(scale[y[i,j]], colnames(y)[j]))
    list(ratings = keyed(known), targets = keyed(setdiff(rated, known)))
  })
  profiles <- Filter(Negate(is.null), profiles)
  if (!length(profiles)) stop("No eligible validation respondents.")
  profiles
}

score_split <- function(y, train, test, template, grid, seed) {
  models <- fit_candidates(y[train,,drop = FALSE], template$scale, grid, template$fit$iterations, template$fit$seed)
  catalog <- list(name = template$name, scale = template$scale, items = template$items, models = models)
  profiles <- make_profiles(y, test, template$scale, seed)
  request <- tempfile(fileext = ".json")
  output <- tempfile(fileext = ".json")
  on.exit(unlink(c(request,output)))
  # JS rounds this positive index half upward.
  cutoff <- template$scale[1L + floor((length(template$scale)-1L)*0.75 + 0.5)]
  jsonlite::write_json(list(catalog = catalog, profiles = profiles, threshold = cutoff), request,
                       auto_unbox = TRUE, digits = 15)
  if (system2("node", c("media-ratings/score.mjs", shQuote(request), shQuote(output))) != 0L)
    stop("Validation scoring failed.")
  jsonlite::fromJSON(output)
}

select_catalog <- function(ratings, items, template_file, out_catalog, out_report, grid_file = NULL) {
  template <- jsonlite::fromJSON(template_file, simplifyVector = FALSE)
  template$scale <- unlist(template$scale)
  ids <- vapply(template$items, "[[", character(1), "itemId")
  data <- read_catalog(ratings, items, template$scale, length(ids), ids)
  template$items <- data$items
  y <- data$y
  search <- if (is.null(grid_file)) list() else jsonlite::fromJSON(grid_file)
  grid <- candidate_grid(template$scale,search)
  # Membership depends only on respondent ID and seed, independent of ratings and row order.
  users <- order(rownames(y), method = "radix")
  set.seed(1789)
  heldout <- sample(users, ceiling(length(users)/5))
  training <- setdiff(users, heldout)
  fold <- sample(rep_len(seq_len(4L), length(training)))
  folds <- do.call(rbind,lapply(seq_len(4L), function(f) {
    message("Validation fold ",f,"/4")
    x <- score_split(y,training[fold != f],training[fold == f],template,grid,2100+f)
    transform(x, fold = f)
  }))
  scores <- do.call(rbind,lapply(grid$model,function(key) {
    x <- folds[folds$model == key,]
    data.frame(model = key, users = sum(x$users), targets = sum(x$targets),
               logLoss = weighted.mean(x$logLoss,x$users), rmse = sqrt(weighted.mean(x$mse,x$users)),
               brier = weighted.mean(x$brier,x$users))
  }))
  winner <- scores$model[which.min(scores$logLoss)]
  best_family <- unname(vapply(unique(grid$family), function(f) {
    eligible <- scores[scores$model %in% grid$model[grid$family == f],]
    eligible$model[which.min(eligible$logLoss)]
  }, character(1)))
  finalists <- grid[grid$model %in% best_family,]
  message("Locked CV winner: ",winner,". Evaluating held-out respondents.")
  test <- score_split(y,training,heldout,template,finalists,2417)
  test$rmse <- sqrt(test$mse)
  test$mse <- NULL
  # Preserve existing public keys and include the CV winner for each family.
  legacy <- candidate_grid(template$scale)
  legacy <- legacy[legacy$family %in% grid$family,]
  keep <- c(best_family,"ordinal","ordinal1","reference")
  release <- grid[grid$model %in% keep,]
  release <- rbind(release,legacy[legacy$model %in% keep & !legacy$model %in% release$model,])
  models <- fit_candidates(y,template$scale,release,template$fit$iterations,template$fit$seed)
  key <- function(x) ifelse(startsWith(x,"class"),"latentClass",x)
  names(models) <- key(names(models))
  template$models <- models
  template$fit$users <- nrow(y)
  template$fit$ratings <- sum(!is.na(y))
  labels <- function(keys) {
    spec <- grid[match(keys,grid$model),]
    ifelse(spec$family == "logit-point", "Historical logit reference",
           ifelse(spec$family == "ordinal-probit", paste0("Ordinal probit, K=",spec$k),
                  paste0("Latent class, K=",spec$k,", prior=",spec$strength)))
  }
  template$selection <- list(model = key(winner), ordinalModel = if ("ordinal-probit" %in% grid$family) key(unname(best_family[1])) else NULL,
    metric = "user-mean category log loss", folds = 4, validationUsers = scores$users[1],
    testUsers = test$users[1], testRatings = test$targets[1],
    cv = transform(scores[order(scores$logLoss),], label = labels(model))[,c("label","logLoss","rmse","brier")],
    holdout = transform(test, label = labels(model))[,c("label","logLoss","rmse","brier")])
  report <- list(catalog = template$name, splitSeed = 1789, winner = winner, grid = grid,
                 cv = scores, folds = folds, holdout = test)
  jsonlite::write_json(report,out_report,auto_unbox = TRUE,pretty = TRUE,digits = 12,na = "null")
  jsonlite::write_json(template,out_catalog,auto_unbox = TRUE,digits = 12)
}
if (sys.nframe() == 0L) {
  args <- commandArgs(trailingOnly = TRUE)
  if (!length(args) %in% 5:6) stop("Usage from repo root: Rscript media-ratings/select.R ratings.csv items.csv template.json selected.json validation.json [grid.json]")
  do.call(select_catalog,as.list(args))
}
