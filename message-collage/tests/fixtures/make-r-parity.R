# R side of the R parity fixture: runs the R version (NikVetr/message-collage, a clone given by
# MESSAGE_COLLAGE_R, default ~/repos/message-collage) on requests that name this tool's bundled
# font files, and writes its layout JSON plus every run's measurements, font draws and empty
# fraction. make-r-parity.mjs calls it and writes r-parity.json. Needs showtext and jsonlite.
#   Rscript message-collage/tests/fixtures/make-r-parity.R cases.json out.json
args <- commandArgs(trailingOnly = TRUE)
r_repo <- Sys.getenv("MESSAGE_COLLAGE_R", path.expand("~/repos/message-collage"))
site <- normalizePath(file.path(dirname(sub("^--file=", "", grep("^--file=", commandArgs(FALSE), value = TRUE))), "../../.."))
source(file.path(r_repo, "collage.R"))  # the R/ stages and collage_json()
suppressMessages(library(showtext))

# The face files of message-collage/core/catalogue.js, as R font objects.
mc <- file.path(site, "message-collage")
nt <- file.path(site, "name-tags", "fonts")
catalogue <- list(
  "Source Serif Pro" = c(file.path(nt, "SourceSerifPro-Regular.ttf"), file.path(nt, "SourceSerifPro-Bold.ttf"),
                         file.path(mc, "fonts/SourceSerifPro-It.woff2"), file.path(mc, "fonts/SourceSerifPro-BoldIt.woff2")),
  "Inter" = c(file.path(nt, "Inter-Regular.ttf"), file.path(nt, "Inter-Bold.ttf"),
              file.path(mc, "fonts/Inter-Italic.woff2"), file.path(mc, "fonts/Inter-BoldItalic.woff2")),
  "Courier Prime" = file.path(mc, "fonts", paste0("CourierPrime-", c("Regular", "Bold", "Italic", "BoldItalic"), ".woff2")),
  "Lobster Two" = file.path(mc, "fonts", paste0("LobsterTwo-", c("Regular", "Bold", "Italic", "BoldItalic"), ".woff2")),
  "Playfair Display" = file.path(mc, "fonts", paste0("PlayfairDisplay-", c("Regular", "Bold", "Italic", "BoldItalic"), ".woff2"))
)
font_object <- function(family) {
  p <- catalogue[[family]]
  list(family = family, regular = p[1], bold = p[2], italic = p[3], bold_italic = p[4])
}

run_case <- function(case) {
  req <- case
  req$fonts <- lapply(if (is.null(case$fonts)) names(catalogue) else unlist(case$fonts), font_object)
  t0 <- proc.time()[[3]]
  # make_collage, keeping every run's measurements as well
  v <- validate_request(req)
  register_fonts(resolve_fonts(v$fonts, v$styles))
  set.seed(v$seed)
  order <- if (v$shuffle) sample.int(length(v$messages)) else seq_along(v$messages)
  messages <- v$messages[order]
  grid_res <- v$grid_res %||% ceiling(sqrt(sum(nchar(messages)) / sqrt(v$width_in * v$height_in)))
  n_cols <- round(v$width_in * grid_res)
  n_rows <- round(v$height_in * grid_res)
  runs <- lapply(v$seed + seq_len(v$runs), function(s) collage_run(messages, v, s, n_cols, n_rows))
  x <- make_collage(req)
  stopifnot(identical(x$lines$text, {
    best <- runs[[which.min(vapply(runs, `[[`, 0, "empty_fraction"))]]
    best$lines$string
  }))
  j <- collage_json(x)
  j$request <- NULL
  j$regions <- lapply(x$regions, function(r) list(label = as.list(r$label)))
  j$timing <- NULL
  j$r_runs <- lapply(runs, function(r) list(
    seed = r$seed, empty_fraction = r$empty_fraction, cex_scale = r$cex_scale, n_rows = nrow(r$grid),
    fonts = list(family = r$fonts$family, style = r$fonts$style, size = r$fonts$size),
    dims = lapply(r$dims, function(d) list(words = d$words, w = unname(d$w), ws = d$ws, h = d$h, total = d$total))))
  j$seconds <- proc.time()[[3]] - t0
  j
}

if (sys.nframe() == 0L) {
cases <- jsonlite::fromJSON(args[1], simplifyVector = TRUE, simplifyDataFrame = FALSE)
out <- lapply(cases, function(case) {
  name <- case$name
  case$name <- NULL
  r <- tryCatch(run_case(case), error = function(e) list(error = conditionMessage(e)))
  case$name <- name
  r$case <- case
  r
})
writeLines(jsonlite::toJSON(out, auto_unbox = TRUE, digits = I(17), null = "null", na = "null"), args[2])
cat(sprintf("%d cases written to %s\n", length(out), args[2]))
}
