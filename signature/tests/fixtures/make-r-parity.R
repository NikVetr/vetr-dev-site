# Reference values for the signature core, from the original R script's own
# functions (minor_scripts/postdoc/interpolate_signature_frequency_series.R,
# sourced; its example section is guarded by plot_example <- F, so sourcing only
# defines functions). Writes r-parity.json beside this file; the JS tests
# (tests/core.test.mjs) compare against it. The inputs are synthetic strokes
# and the first strokes of the synthetic example signatures in ../../examples.
#   Rscript signature/tests/fixtures/make-r-parity.R [path/to/the/script.R]
#
# Where the script has a bug, the reference here is the corrected function
# (named *_fixed below), and bugs.json records the script's own output next to
# the corrected one.

args <- commandArgs(trailingOnly = TRUE)
script <- if (length(args)) args[1] else "~/repos/minor_scripts/postdoc/interpolate_signature_frequency_series.R"
here <- dirname(normalizePath(sub("--file=", "", grep("--file=", commandArgs(FALSE), value = TRUE))))
suppressPackageStartupMessages(source(script))
library(jsonlite)

set.seed(1)
# three synthetic strokes: a loop, a wave and a short hook, with sampling jitter
t1 <- seq(0, 2 * pi, length.out = 40)
s1 <- data.frame(x = 30 * cos(t1) + rnorm(40, 0, 0.8), y = 18 * sin(2 * t1) + rnorm(40, 0, 0.8))
t2 <- seq(0, 1, length.out = 55)
s2 <- data.frame(x = 80 + 120 * t2 + rnorm(55, 0, 0.6), y = 15 * sin(9 * t2) + rnorm(55, 0, 0.6))
s3 <- data.frame(x = c(150, 152, 156, 161, 163, 162, 160), y = c(-30, -36, -40, -38, -33, -28, -25))
xy <- rbind(s1, s2, s3)
segs <- rep(1:3, c(40, 55, 7))

read_first <- function(f) {
  d <- read.csv(f)
  d$i <- c(1, cumsum(diff(d$t) > 50) + 1)
  d[d$i == 1, ]
}
ex_a <- read_first(file.path(here, "../../examples/avery-quill.csv"))
ex_b <- read_first(file.path(here, "../../examples/juno-marsh.csv"))

out <- list(source = paste("R", getRversion(), "waveslim", packageVersion("waveslim"), "script", basename(script)))

# ---- arc-length resampling ----
rs <- interpolate_to_length_kd(x = xy, n = 150, segs = segs, equal_increments = TRUE)
out$resample <- list(x = xy$x, y = xy$y, segs = segs, n = 150, out_x = rs[, "x"], out_y = rs[, "y"], out_i = rs[, "i"])
out$break_integer <- list(
  list(x = 150, p = c(0.31, 0.5, 0.19), out = break_integer(150, c(0.31, 0.5, 0.19))),
  list(x = 10, p = c(0.25, 0.25, 0.25, 0.25), out = break_integer(10, rep(0.25, 4))),
  list(x = 7, p = c(0.5, 0.5), out = break_integer(7, c(0.5, 0.5))),
  list(x = 100, p = c(0.333, 0.333, 0.334), out = break_integer(100, c(0.333, 0.333, 0.334)))
)

# one resampled stroke per series, centred as the script centres a signature
stroke <- function(d, n) {
  r <- interpolate_to_length_kd(x = d[, c("x", "y")], n = n, segs = rep(1, nrow(d)), equal_increments = TRUE)
  r[, "x"] <- r[, "x"] - min(r[, "x"]) - diff(range(r[, "x"])) / 2
  r[, "y"] <- r[, "y"] - min(r[, "y"]) - diff(range(r[, "y"])) / 2
  r
}
sa <- stroke(ex_a, 160)
mirror <- function(v) c(v, rev(v))

# ---- wavelet smoothing (energy rule, script: smooth thresholded; fixed: details only) ----
wavelet_smooth_details <- function(d, wavelet_filter = "mb4", var_thresh = 0.98) {
  n_levels <- max(1, floor(log2(length(d)) / 2))
  waveout <- waveslim::modwt(d, wf = wavelet_filter, n.levels = n_levels)
  squares <- unlist(waveout)^2
  total_ss <- sum(squares)
  sorted_squares <- sort(squares, T)
  threshold <- sqrt(sorted_squares[sum(cumsum(sorted_squares) / total_ss <= max(c(var_thresh, sorted_squares[1] / total_ss * 1.01)))])
  for (level_name in paste0("d", 1:n_levels)) {
    waveout[[level_name]] <- sign(waveout[[level_name]]) * (abs(waveout[[level_name]]) - threshold) * (abs(waveout[[level_name]]) > threshold)
  }
  data.frame(waveslim::imodwt(waveout))
}
n <- nrow(sa)
cases <- list()
for (filter in c("mb4", "haar", "la8")) for (keep in c(0.999, 0.99)) for (coord in c("x", "y")) {
  v <- mirror(sa[, coord])
  cases[[length(cases) + 1]] <- list(filter = filter, keep = keep, coord = coord, x = sa[, coord],
    smooth_thresholded = unlist(wavelet_smooth(v, wavelet_filter = filter, var_thresh = keep))[1:n],
    details_only = unlist(wavelet_smooth_details(v, wavelet_filter = filter, var_thresh = keep))[1:n])
}
out$wavelet_energy <- cases

# ---- wavelet smoothing (noise rule) ----
out$wavelet_noise <- lapply(c(3, 50), function(m) list(multiplier = m, x = sa[, "x"],
  out = unlist(wavelet_smooth_noise_thresh(mirror(sa[, "x"]), threshold_multiplier = m))[1:n]))

# ---- Fourier smoothing (the script returns the mirrored series; the tool keeps the first half) ----
out$fourier <- lapply(c("x", "y"), function(coord) list(coord = coord, x = sa[, coord],
  out = unlist(fourier_smooth(mirror(sa[, coord])))[1:n]))

# ---- morph: coefficient interpolation and linear interpolation ----
sb <- stroke(ex_b, 160)
props <- 0:4 / 4
mult <- c(50, 50) / c(1, 0.8)
wi <- wavelet_smooth_interpolate(d1 = mirror(sa[, "x"]), d2 = mirror(sb[, "x"]), threshold_multipliers = mult, props = props)
li <- linear_smooth_interpolate(d1 = fourier_smooth(mirror(sa[, "x"])), d2 = fourier_smooth(mirror(sb[, "x"])), props = props)
# wavelet_smooth_interpolate weights d1 by prop: prop = 1 is d1; the tool's p weights its target (d2 here) instead
out$morph <- list(a = sa[, "x"], b = sb[, "x"], multipliers = mult, props = props,
  wavelet = lapply(unname(wi), function(f) unlist(f)[1:n]), linear = lapply(unname(li), function(f) unlist(f)[1:n]))

# ---- normalisation for the morph: centre, then equal ink length (fixed: divide, not multiply) ----
norm_fixed <- function(d, len, longest) { d[, c("x", "y")] <- d[, c("x", "y")] * (longest / len); d }
la <- sum(line_lengths(sa[, c("x", "y")], rep(1, n)))
lb <- sum(line_lengths(sb[, c("x", "y")], rep(1, n)))
out$normalize <- list(a_x = sa[, "x"], a_y = sa[, "y"], b_x = sb[, "x"], b_y = sb[, "y"], len_a = la, len_b = lb,
  a_scaled_x = norm_fixed(sa, la, max(la, lb))[, "x"], b_scaled_x = norm_fixed(sb, lb, max(la, lb))[, "x"])

# ---- segment intersection (fixed) ----
intersect_fixed <- function(line1, line2) {
  r <- unlist(line1[2, ] - line1[1, ]); s <- unlist(line2[2, ] - line2[1, ]); qp <- unlist(line2[1, ] - line1[1, ])
  den <- r[1] * s[2] - r[2] * s[1]
  if (den == 0) return(NULL)
  a <- (qp[1] * s[2] - qp[2] * s[1]) / den; b <- (qp[1] * r[2] - qp[2] * r[1]) / den
  if (a < 0 || a > 1 || b < 0 || b > 1) return(NULL)
  unlist(line1[1, ] + a * r)
}
seg_cases <- list(
  list(name = "crossing X", l1 = c(0, 0, 4, 4), l2 = c(0, 4, 4, 0)),
  list(name = "line 2 ends short of line 1", l1 = c(0, 0, 4, 4), l2 = c(0, 4, 1, 3.5)),
  list(name = "crossing, y found from x", l1 = c(0, 1, 10, 3), l2 = c(2, 5, 6, -1)),
  list(name = "vertical line 2, pointing down", l1 = c(0, 0, 4, 2), l2 = c(2, 5, 2, -5)),
  list(name = "vertical line 2, misses", l1 = c(0, 0, 4, 2), l2 = c(2, 5, 2, 3))
)
as_line <- function(v) data.frame(x = v[c(1, 3)], y = v[c(2, 4)])
seg_out <- lapply(seg_cases, function(cs) {
  r <- tryCatch(intersect_func(as_line(cs$l1), as_line(cs$l2), return_loc = TRUE), error = function(e) paste("error:", conditionMessage(e)))
  f <- intersect_fixed(as_line(cs$l1), as_line(cs$l2))
  list(name = cs$name, l1 = cs$l1, l2 = cs$l2, script = r, fixed = if (is.null(f)) "no intersection" else unname(f))
})
out$intersect <- seg_out

write_json(out, file.path(here, "r-parity.json"), digits = NA, auto_unbox = TRUE)

# ---- the script's bugs: its output against the corrected output ----
bugs <- list()
bugs$threshold_multiplier <- list(
  call = "wavelet_smooth(sx1, threshold_multiplier = 100)  (:556-559, :586-589)",
  script = tryCatch(wavelet_smooth(mirror(sa[, "x"]), threshold_multiplier = 100), error = function(e) conditionMessage(e)),
  fixed = "wavelet_smooth_noise_thresh(sx1, threshold_multiplier = 100): the noise rule, which takes that argument",
  fixed_first5 = head(unlist(wavelet_smooth_noise_thresh(mirror(sa[, "x"]), threshold_multiplier = 100)), 5))
m <- cbind(sa[, "x"], sa[, "y"])
bugs$class_check <- list(
  call = "if (class(d) %in% c('matrix', 'data.frame'))  (:126, :162, :217, :221, :277)",
  class_of_matrix = class(m),
  script_matrix = tryCatch({ wavelet_smooth(m); "ran" }, error = function(e) conditionMessage(e)),
  script_data_frame_length = length(unlist(wavelet_smooth(data.frame(x = sa[, "x"], y = sa[, "y"])))),
  input_rows = n,
  note = "a 2-column data frame is unlist()ed into one series x then y (2n values), smoothed as one; fixed with inherits() and one call per column")
# smoothing the level-J smooth too (:178): the stroke contracts
shrink <- function(fun, keep) {
  sx <- unlist(fun(mirror(sa[, "x"]), var_thresh = keep))[1:n]
  sy <- unlist(fun(mirror(sa[, "y"]), var_thresh = keep))[1:n]
  c(width_ratio = diff(range(sx)) / diff(range(sa[, "x"])), height_ratio = diff(range(sy)) / diff(range(sa[, "y"])),
    ink_ratio = sum(sqrt(diff(sx)^2 + diff(sy)^2)) / sum(sqrt(diff(sa[, "x"])^2 + diff(sa[, "y"])^2)),
    mean_shift = mean(sqrt((sx - sa[, "x"])^2 + (sy - sa[, "y"])^2)))
}
bugs$smooth_thresholded <- lapply(c(0.9999, 0.999, 0.99, 0.95), function(keep) list(keep = keep,
  script = as.list(shrink(wavelet_smooth, keep)), details_only = as.list(shrink(wavelet_smooth_details, keep))))
sig_lengths <- c(a = la, b = lb)
sig_props <- sig_lengths / max(sig_lengths)
bugs$equal_length <- list(
  call = "nv2[, c('x','y')] <- nv2[, c('x','y')] * sig_props['nv']  (:436-439)",
  lengths_before = as.list(sig_lengths),
  script_after = as.list(sig_lengths * sig_props),
  fixed_after = as.list(sig_lengths / sig_props))
bugs$intersect <- seg_out
write_json(bugs, file.path(here, "../../../tmp/output/r-bugs.json"), digits = 8, auto_unbox = TRUE, pretty = TRUE)
cat("wrote", file.path(here, "r-parity.json"), "\n")
