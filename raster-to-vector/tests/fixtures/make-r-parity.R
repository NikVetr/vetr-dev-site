# Regenerates r-parity.json from the R version (github.com/NikVetr/raster-to-vector):
#   Rscript tests/fixtures/make-r-parity.R /path/to/raster-to-vector
# Run from raster-to-vector/ (this tool's folder). R's table() orders colour
# strings by the collation locale; the JS port uses C order, so this sets it.
Sys.setenv(MAGICK_THREAD_LIMIT = "1")
Sys.setlocale("LC_COLLATE", "C")
r_root <- commandArgs(TRUE)[1]
for (f in list.files(file.path(r_root, "R"), "\\.R$", full.names = TRUE)) source(f)
out <- list(source = paste("raster-to-vector R version, commit", system2("git", c("-C", r_root, "rev-parse", "--short", "HEAD"), stdout = TRUE)))

# R's generator: runif after set.seed, uniform and weighted sample(x, 1)
set.seed(1); u <- runif(5)
set.seed(1); s <- replicate(20, sample(1:300, 1))
set.seed(3); w <- c(rep(1, 50), 5, 5, 0, 2, rep(3, 40), round(runif(100), 6))
set.seed(2); sw <- replicate(30, sample(seq_along(w), 1, prob = w))
out$rng <- list(runif_seed1 = u, sample300_seed1 = s, weights = w, weighted_seed2 = sw)

# magick's convolutions as the original tracer uses them, on a random and a blocky mask
conv <- function(m, k) img2mat(magick::image_convolve(mat2img(m), kernel = matrix(1, k, k), bias = "50%")) * 1
sobel_sum <- function(m) {
  o <- magick::image_data(magick::image_convolve(mat2img(m), "sobel", bias = "50%"))
  Reduce("+", lapply(1:3, function(i) matrix(as.integer(o[i, , ]), nrow(o[i, , ]), ncol(o[i, , ]))))
}
set.seed(9)
m <- matrix(FALSE, 14, 19)
m[3:11, 3:16] <- matrix(runif(9 * 14) > 0.45, 9, 14)
set.seed(10)
b <- matrix(FALSE, 30, 34)
for (r in 1:12) { i <- sample(3:20, 1); j <- sample(3:24, 1); b[i:(i + sample(2:7, 1)), j:(j + sample(2:7, 1))] <- TRUE }
b[c(1:2, 29:30), ] <- FALSE
b[, c(1:2, 33:34)] <- FALSE
out$magick <- list(random = list(mask = m * 1, sobel = sobel_sum(m), sobel_t = sobel_sum(t(m)), conv2 = conv(m, 2), conv3 = conv(m, 3)),
                   blocks = c(list(mask = b * 1), setNames(lapply(2:6, function(k) conv(b, k)), paste0("conv", 2:6))))

# sf areas of self-intersecting rings after st_make_valid() (the nonzero rule)
area <- function(xy) sf::st_area(sf::st_make_valid(sf::st_polygon(list(rbind(xy, xy[1, ])))))
loop <- rbind(c(0, 0), c(4, 0), c(4, 4), c(1, 4), c(1, 1), c(3, 1), c(3, 3), c(0, 3))
bow <- rbind(c(0, 0), c(2, 2), c(2, 0), c(0, 2))
out$areas <- list(double_loop = list(ring = loop, area = area(loop)), bowtie = list(ring = bow, area = area(bow)))

# whole runs: request (snake_case, as R takes it) and R's SVG
runs <- list(
  list(name = "logo_holes default", image = "logo_holes.png", request = list()),
  list(name = "cartoon_flat original tracer, fourier", image = "cartoon_flat.png",
       request = list(trace = list(method = "original"), smooth = list(method = "fourier"))),
  list(name = "logo_holes holes all, oklab, unweighted, la8 mad", image = "logo_holes.png",
       request = list(quantize = list(space = "oklab", seeding = "unweighted", seed = 4), output = list(holes = "all"),
                      smooth = list(wavelet = list(filter = "la8", noise = "mad"))))
)
out$runs <- lapply(runs, function(run) {
  res <- vectorize(c(list(image = file.path(r_root, "examples", run$image)), run$request))
  list(name = run$name, image = run$image, request = run$request, k = res$k, hex = res$palette$hex, svg = res$svg)
})
jsonlite::write_json(out, "tests/fixtures/r-parity.json", digits = I(17), auto_unbox = TRUE, matrix = "rowmajor", pretty = FALSE)
cat("wrote tests/fixtures/r-parity.json\n")
