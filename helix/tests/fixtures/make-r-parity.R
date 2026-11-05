# R side of the R parity fixture: runs Nik Vetr's draw_DNA (minor_scripts/postdoc/draw_DNA.R)
# and braid_segment (braided_lines.R) on the cases make-r-parity.mjs writes, and records what
# they draw: every polylines() call of draw_DNA (its centreline and widths, and for the first
# strand and base-pair piece the outline polygon() is given) with every base-pair segment, and
# every polygon of braid_segment with the segment breaks. Only the scripts' function
# definitions are run, not their top-level drawing code, with one line added to each to
# keep a value they compute (the breaks, and each base pair's strand point). polylines(), rescale01() and
# rotmat_00() come from the polylines repository (POLYLINES_R); xyrat() is 1, true units.
#   Rscript helix/tests/fixtures/make-r-parity.R cases.json out.json
args <- commandArgs(trailingOnly = TRUE)
scripts <- Sys.getenv("MINOR_SCRIPTS", path.expand("~/repos/minor_scripts"))
source(Sys.getenv("POLYLINES_R", path.expand("~/repos/polylines/R/functions.R")))

define <- function(file, name) {
  for (e in parse(file)) {
    if (is.call(e) && identical(e[[1]], as.name("<-")) && identical(e[[2]], as.name(name))) eval(e, globalenv())
  }
}
define(file.path(scripts, "postdoc/draw_DNA.R"), "draw_DNA")
define(file.path(scripts, "postdoc/braided_lines.R"), "braid_segment")

# keep braid_segment's breaks and the strand point each of draw_DNA's base pairs starts
# from: one line added to each after it computes them
keep <- function(f, after, line) {
  b <- as.list(body(f))
  at <- which(vapply(b, function(e) identical(e, after), logical(1)))
  stopifnot(length(at) == 1)
  body(f) <- as.call(append(b, line, at))
  f
}
braid_segment <- keep(braid_segment, quote(all_breaks <- sort(unique(c(t_breaks_smooth, t_breaks_crossover, 0, L_data)))),
                      quote(assign(".all_breaks", all_breaks, globalenv())))
draw_DNA <- keep(draw_DNA, quote(bp_df <- bp_df[bp_df$w > 1E-6,]),
                 quote(assign(".bp_index", bp_indices[as.integer(rownames(bp_df))] - 1L, globalenv())))

xyrat <- function() 1
calls <- list()
record <- function(x) calls[[length(calls) + 1]] <<- x
polylines_r <- polylines
polygon <- function(x, y = NULL, ...) {
  a <- list(...)
  record(list(kind = "polygon", x = x, y = y, col = if (is.null(a$col)) NA else a$col))
}
polylines <- function(x, y = NULL, lwd, ...) {
  record(list(kind = "polylines", x = x, y = y, lwd = lwd))
  polylines_r(x = x, y = y, lwd = lwd, complex = TRUE, ...) # its outline goes to polygon() above
}
segments <- function(x0, y0, x1, y1, ...) record(list(kind = "segment", x0 = x0, y0 = y0, x1 = x1, y1 = y1))

every <- function(v, k = 10) v[unique(c(seq(1, length(v), by = k), length(v)))]

run_helix <- function(a) {
  calls <<- list()
  do.call(draw_DNA, a)
  pieces <- list(); rings <- list(); segs <- list(); first_bp <- NA
  for (cl in calls) {
    if (cl$kind == "polylines") {
      pieces[[length(pieces) + 1]] <- list(n = length(cl$x), x = every(cl$x), y = every(cl$y), lwd = every(cl$lwd))
    } else if (cl$kind == "segment") {
      segs[[length(segs) + 1]] <- c(cl$x0, cl$y0, cl$x1, cl$y1)
      if (is.na(first_bp)) first_bp <- length(pieces) + 1
    } else if (length(pieces) == 1 || isTRUE(length(pieces) == first_bp)) {
      # the outlines of the first strand piece and the first base pair
      rings[[length(rings) + 1]] <- list(piece = length(pieces) - 1, n = length(cl$x), x = every(cl$x, 25), y = every(cl$y, 25))
    }
  }
  list(pieces = pieces, segments = segs, bp_index = .bp_index, rings = rings)
}

run_braid <- function(a) {
  calls <<- list()
  pdf(NULL, width = 7, height = 7)
  par(mar = c(4, 4, 3, 1))
  plot(0, 0, type = "n", xlim = c(0, 10), ylim = c(0, 10), asp = 1)
  usr <- par("usr"); pin <- par("pin")
  do.call(braid_segment, a)
  dev.off()
  x_scale <- pin[1] / (usr[2] - usr[1])
  cols <- unlist(a$cols)
  quads <- Filter(function(cl) cl$kind == "polygon", calls)
  k <- length(cols)
  n_seg <- length(.all_breaks) - 1
  order <- lapply(seq_len(n_seg), function(j) vapply(quads[(j - 1) * k + seq_len(k)], function(q) match(q$col, cols) - 1L, 0L))
  shown <- unique(c(seq(1, n_seg, by = 4), n_seg))
  list(
    width = a$bwidth / 72.27 / x_scale, x_scale = x_scale, y_scale = pin[2] / (usr[4] - usr[3]),
    breaks = .all_breaks, order = order,
    quads = lapply(shown, function(j) list(segment = j - 1, strands = lapply(quads[(j - 1) * k + seq_len(k)], function(q) c(q$x, q$y))))
  )
}

if (sys.nframe() == 0L) {
  cases <- jsonlite::fromJSON(args[1], simplifyVector = TRUE, simplifyDataFrame = FALSE)
  out <- lapply(cases, function(case) {
    r <- tryCatch(if (case$mode == "helix") run_helix(case$args) else run_braid(case$args),
                  error = function(e) list(error = conditionMessage(e)))
    r$name <- case$name
    r
  })
  writeLines(jsonlite::toJSON(out, auto_unbox = TRUE, digits = I(15), null = "null", na = "null"), args[2])
  cat(sprintf("%d cases written to %s\n", length(out), args[2]))
}
