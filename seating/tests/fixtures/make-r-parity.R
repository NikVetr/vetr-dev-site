# Reference values from the R version for seating/tests/core.test.mjs. Run from the site root:
#
#   Rscript seating/tests/fixtures/make-r-parity.R ~/repos/table-seating
#
# Writes seating/tests/fixtures/r-parity.json: R's sum() of awkward vectors (long double),
# table layouts, score_assignment() of fixed seatings, and whole seat_tables() runs with
# their accepted moves. Every request goes through JSON first, so R and JS read the same one.

args <- commandArgs(TRUE)
if (length(args) != 1) stop("usage: Rscript make-r-parity.R <table-seating repo>")
repo <- normalizePath(args[1])
for (f in list.files(file.path(repo, "R"), "\\.R$", full.names = TRUE)) source(f)
out <- file.path("seating", "tests", "fixtures", "r-parity.json")
as_json_request <- function(req) {
  jsonlite::fromJSON(jsonlite::toJSON(req, auto_unbox = TRUE, dataframe = "rows", digits = I(17)), simplifyVector = FALSE)
}
head_sha <- system2("git", c("-C", repo, "rev-parse", "--short", "HEAD"), stdout = TRUE)

# sum() in long double ----------------------------------------------------------------------
set.seed(1)
sums <- list()
add_sum <- function(x) sums[[length(sums) + 1]] <<- list(x = x, sum = sum(x))
for (k in 1:80) add_sum(sqrt(sample(0:6, sample(2:45, 1), TRUE)) * sample(c(-1, 1), 1))
for (k in 1:50) add_sum(rnorm(sample(2:30, 1)) * 10^runif(1, -6, 6))
for (k in 1:20) add_sum(c(rnorm(sample(2:20, 1)), 1e16, -1e16, runif(3)))
add_sum(c(1, 2^-53, 2^-53))
add_sum(c(1, 2^-64))
add_sum(c(1, 3 * 2^-65, 2^-53))
add_sum(c(-1, -2^-53, -2^-53, 2^-60))
add_sum(c(2^60, 1, 1, -2^60))

# layouts -------------------------------------------------------------------------------------
layouts <- lapply(c(2, 5, 23, 24), function(k) list(n = k, spiral = spiral_layout(k), grid = grid_layout(k),
                                                    closeness = table_closeness(spiral_layout(k))))

# requests --------------------------------------------------------------------------------------
explicit_tables <- lapply(1:6, function(t) list(id = paste0("T", t), capacity = 8, x = t %% 3, y = t %/% 3))
cat_geo <- function(tm, seed = 2) {
  req <- synthetic_request(seed = seed)
  req$geography <- list(cost = "category", tablemates = tm)
  req$tables <- explicit_tables
  req
}
original_style <- function(n = 100, seed = 1) {
  set.seed(seed)
  cat <- sample(1:4, n, replace = TRUE, prob = c(0.4, 0.3, 0.2, 0.1))
  init <- ceiling(seq_len(n) / 6)
  init[(floor(n / 6) * 6 + 1):n] <- seq_len(n %% 6)
  pr <- which(upper.tri(diag(n)) & outer(init, init, "=="), arr.ind = TRUE)
  list(guests = data.frame(id = paste0("g", seq_len(n)), category = cat), tables = list(seats = 6),
       pairs = data.frame(a = paste0("g", pr[, 1]), b = paste0("g", pr[, 2]), score = -10),
       geography = list(cost = "category", tablemates = TRUE))
}
ties <- list(guests = lapply(1:16, function(i) list(id = paste0("t", i))),
             tables = list(seats = 4),
             together = list(c("t1", "t5"), c("t2", "t9"), c("t3", "t13")),
             apart = list(c("t1", "t2")),
             options = list(table_objective = "none"))
single_seats <- list(guests = lapply(1:7, function(i) list(id = paste0("s", i), category = i %% 3)),
                     tables = lapply(1:5, function(t) list(id = LETTERS[t], capacity = c(1, 1, 3, 2, 2)[t])),
                     pairs = list(list(a = "s1", b = "s2", score = 3), list(a = "s3", b = "s4", score = -2)),
                     geography = list(cost = list(list(a = "s1", b = "s3", cost = 5))))
requests <- list(
  party = read_request(file.path(repo, "examples", "synthetic-party.json")),
  cat_geo_false = cat_geo(FALSE),
  cat_geo_true = cat_geo(TRUE),
  geometric = synthetic_request(seed = 3, options = list(table_objective = "geometric", weights = list(table = 2, pairs = 0.5, geography = 3), logit_scale = 4)),
  variance = synthetic_request(seed = 4, options = list(table_objective = "variance", constraint_penalty = 50)),
  grid = synthetic_request(seed = 5, seats = 6, options = list(seed = 3)),
  original = original_style(),
  ties = ties,
  single_seats = single_seats)
requests$grid$tables$layout <- "grid"
requests <- lapply(requests, as_json_request)

# fixed seatings --------------------------------------------------------------------------------
set.seed(2)
scores <- lapply(names(requests), function(name) {
  p <- build_problem(requests[[name]])
  sizes <- lengths(p$initial)
  seatings <- c(list(p$initial), lapply(1:6, function(k) unname(split(sample(p$n_seats), rep(seq_along(sizes), sizes)))))
  list(name = name, seatings = lapply(seatings, function(s) lapply(s, function(x) I(x - 1L))),
       results = lapply(seatings, function(s) {
         r <- score_assignment(p, s)
         list(score = r$score, terms = as.list(r$terms), by_table = lapply(seq_len(nrow(r$by_table)), function(t) as.list(r$by_table[t, ])))
       }))
})

# whole runs --------------------------------------------------------------------------------------
run_cases <- list(
  list(name = "party", seeds = 1:4, options = list()),
  list(name = "cat_geo_false", seeds = 1:2, options = list(iterations = 800)),
  list(name = "cat_geo_true", seeds = 1:2, options = list(iterations = 800)),
  list(name = "geometric", seeds = 3, options = list()),
  list(name = "variance", seeds = 4, options = list()),
  list(name = "grid", seeds = 3, options = list()),
  list(name = "original", seeds = 1, options = list(iterations = 2000)),
  list(name = "ties", seeds = 1:2, options = list()),
  list(name = "single_seats", seeds = 1:2, options = list()))
runs <- list()
for (case in run_cases) for (seed in case$seeds) {
  req <- requests[[case$name]]
  req$options <- modifyList(if (length(req$options)) req$options else list(),
                            c(case$options, list(seed = seed, record = "moves", trace_points = 25)))
  r <- seat_tables(req)
  runs[[length(runs) + 1]] <- list(
    name = case$name, options = req$options,
    response = list(score = r$score, terms = r$terms, seats = lapply(r$tables, function(t) t$seats),
                    search = r$search, violations = r$violations, trace = r$trace,
                    moves = lapply(r$trajectory$moves, function(m) m[c("iteration", "tables", "swaps", "positions")])))
}

# brute force: validation/brute_force.R's first instance and its results --------------------------
party_guests <- function() {
  g <- data.frame(id = c("Fam1a", "Fam1b", "Fam1c", "Cpl1a", "Cpl1b", "Cpl2a", "Cpl2b",
                         "Frd1a", "Frd1b", "Frd1c", "Solo1", "Solo2"),
                  category = c(1, 1, 1, 2, 2, 3, 3, 3, 3, 4, 4, 2))
  set.seed(11)
  g[sample(nrow(g)), ]
}
fam <- utils::combn(c("Fam1a", "Fam1b", "Fam1c"), 2)
frd <- utils::combn(c("Frd1a", "Frd1b", "Frd1c"), 2)
bf_name <- "party: 12 guests, 3 tables of 4"
bf <- utils::read.csv(file.path(repo, "validation", "results", "brute_force.csv"))
bf <- bf[bf$instance == bf_name, ]
brute_force <- list(
  instance = bf_name,
  request = as_json_request(list(guests = party_guests(), tables = list(seats = 4),
    pairs = data.frame(a = c(fam[1, ], frd[1, ]), b = c(fam[2, ], frd[2, ]), score = rep(c(4, 2), each = 3)),
    together = list(c("Cpl1a", "Cpl1b"), c("Cpl2a", "Cpl2b")), apart = list(c("Fam1a", "Frd1b")))),
  n_seatings = bf$n_seatings[1], optimum = bf$optimum[1], median = bf$median[1],
  results = unname(lapply(split(bf, bf$iterations), function(d) list(iterations = d$iterations[1], best = d$best, optimal = d$optimal))))

writeLines(jsonlite::toJSON(list(provenance = sprintf("seating/tests/fixtures/make-r-parity.R against table-seating %s, %s", head_sha, R.version.string),
                                 sums = sums, layouts = layouts, requests = requests, scores = scores, runs = runs,
                                 brute_force = brute_force),
                            auto_unbox = TRUE, digits = I(17), na = "null", null = "null"), out)
cat("wrote", out, sprintf("(%.0f KB)\n", file.size(out) / 1024))
