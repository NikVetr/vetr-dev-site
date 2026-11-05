# Makes the R parity fixture: a small set of PNG photos and two targets, and what the original
# script computes from them (minor_scripts/postdoc/imgdir2grid.R, its "color match to specific
# pixels in a super image" part, run as written apart from the paths, a set.seed() before its
# sample(), and a check that image_scale() gave the grid's size). Run from the repository root:
#   Rscript photomosaic/tests/fixtures/make-r-parity.R
# Needs magick, plotwidgets, clue, png, gtools and jsonlite.
suppressMessages({
  library(magick); library(plotwidgets); library(clue); library(png); library(jsonlite)
})

fixture <- "photomosaic/tests/fixtures"
image_dir <- file.path(fixture, "photos")
unlink(image_dir, recursive = TRUE)
dir.create(image_dir, recursive = TRUE)

# ---- photos: example tiles at assorted sizes, the script's own random colours, and specials ----
manifest <- fromJSON("photomosaic/examples/manifest.json")
tiles <- manifest$photos[seq(1, length(manifest$photos), length.out = 28)]
sizes <- list(c(20, 20), c(24, 18), c(18, 24), c(31, 17), c(13, 29), c(40, 40), c(9, 7))
for (i in seq_along(tiles)) {
  s <- sizes[[(i - 1) %% length(sizes) + 1]]
  img <- image_scale(image_read(file.path("photomosaic/examples", tiles[i])), paste0(s[1], "x", s[2], "!"))
  image_write(img, file.path(image_dir, sprintf("t%02d.png", i)), format = "png", flatten = FALSE)
}
set.seed(11)
for (i in 1:5) { # generate_single_color_image() from the script: a 10 x 10 Dirichlet colour
  color <- gtools::rdirichlet(1, alpha = c(0.5, 0.5, 0.5))
  img <- array(NA, dim = c(10, 10, 3))
  img[, , 1] <- color[1]; img[, , 2] <- color[2]; img[, , 3] <- color[3]
  writePNG(img, target = file.path(image_dir, sprintf("u%02d.png", i)))
}
grey <- array(0.5, dim = c(12, 16, 3))
writePNG(grey, target = file.path(image_dir, "v01-grey.png"))
writePNG(array(0, dim = c(8, 8, 3)), target = file.path(image_dir, "v02-black.png"))
see_through <- array(0, dim = c(14, 22, 4)) # a red-to-blue ramp fading out to the right
see_through[, , 1] <- 0.9
see_through[, , 2] <- 0.2
see_through[, , 3] <- matrix(seq(0, 1, length.out = 22), 14, 22, byrow = TRUE)
see_through[, , 4] <- matrix(seq(1, 0, length.out = 22), 14, 22, byrow = TRUE)
writePNG(see_through, target = file.path(image_dir, "v03-alpha.png"))

# ---- targets ----
starry <- image_read(file.path("photomosaic/examples", manifest$target))
image_write(image_scale(starry, "48x38!"), file.path(fixture, "target-wide.png"), format = "png")
tall <- as.numeric(image_data(image_scale(image_crop(starry, "120x180+60+0"), "30x40!"), channels = "rgb"))
tall <- array(c(tall, matrix(seq(1, 0.25, length.out = 40), 40, 30)), dim = c(40, 30, 4))
writePNG(tall, target = file.path(fixture, "target-tall.png"))

# ---- the script's computation, imgdir2grid.R lines 120-185 ----
npix <- "200"
run <- function(super_image_path, seed) {
  all_files <- list.files(image_dir, full.names = TRUE)
  valid_imgs <- all_files[grepl("\\.(jpg|jpeg|png|heic|gif|tiff|bmp)$", tolower(all_files))]
  imgs <- lapply(valid_imgs, image_read)
  set.seed(seed)
  perm <- sample.int(length(imgs)) # the draw sample(imgs) makes
  set.seed(seed)
  imgs <- sample(imgs)
  imgs <- lapply(imgs, image_scale, geometry = npix)

  super_image <- image_read(super_image_path)
  super_image_med <- image_scale(super_image, "200")
  super_res <- dim(image_data(super_image_med))[-1]
  super_AR <- super_res[2] / super_res[1]
  grid_dims <- sqrt(length(imgs) / super_AR)
  grid_dims <- floor(c(grid_dims * super_AR, grid_dims))
  super_image_smol <- image_scale(super_image, paste0(grid_dims[2], "x", grid_dims[1]))
  stopifnot(identical(as.integer(dim(image_data(super_image_smol))[-1]), as.integer(rev(grid_dims))))
  super_img_data <- as.numeric(image_data(super_image_smol, channels = "rgba"))
  super_img_matrix <- apply(super_img_data, c(1, 2), identity, simplify = F)
  grid_map <- expand.grid(1:grid_dims[1], 1:grid_dims[2])
  super_img_data <- do.call(rbind, super_img_matrix[t(t(grid_map))])
  sub_img_data <- t(sapply(imgs, function(img) {
    img_rgb <- as.numeric(image_data(img, channels = "rgba"))
    return(apply(img_rgb, 3, mean))
  }))
  super_img_hsl <- t(rgb2hsl(t(super_img_data)))
  sub_img_hsl <- t(rgb2hsl(t(sub_img_data)))
  distance_matrix <- outer(
    1:nrow(super_img_hsl),
    1:nrow(sub_img_hsl),
    Vectorize(function(i, j) sum((super_img_hsl[i, ] - sub_img_hsl[j, ])^2))
  )
  assignment <- solve_LSAP(distance_matrix, maximum = FALSE)
  list(
    target = basename(super_image_path), seed = seed,
    files = basename(valid_imgs), perm = perm,
    superRes = super_res, gridDims = grid_dims,
    cells = super_img_data, photoMeans = sub_img_data,
    cellFeatures = super_img_hsl, photoFeatures = sub_img_hsl,
    cost = distance_matrix,
    assignment = as.integer(assignment),
    total = sum(distance_matrix[cbind(seq_along(assignment), as.integer(assignment))])
  )
}
runs <- list(run(file.path(fixture, "target-wide.png"), 1), run(file.path(fixture, "target-tall.png"), 2))

# ImageMagick's shape-kept height for image_scale(img, "200"), over assorted sizes
set.seed(5)
wh <- cbind(sample(100:2000, 120, replace = TRUE), sample(1:2000, 120, replace = TRUE))
heights <- apply(wh, 1, function(s) dim(image_data(image_scale(image_blank(s[1], s[2]), "200")))[3])

writeLines(toJSON(list(runs = runs, heights = list(sizes = wh, height = heights)), digits = NA, matrix = "rowmajor", auto_unbox = TRUE),
           file.path(fixture, "r-parity.json"))
cat("cells:", sapply(runs, function(r) prod(r$gridDims)), " totals:", sapply(runs, `[[`, "total"), "\n")
