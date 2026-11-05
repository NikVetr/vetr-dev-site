# The original script (imgdir2grid.R lines 120-192, paths changed and set.seed(1) before its
# sample()) on the bundled example, for api.md's "Parity with R". Run from the repository root:
#   Rscript photomosaic/tests/fixtures/run-r-example.R
# Writes tmp/output/r-example/: assignment.json (R's order, assignment, total and photo means),
# as-written.png (the mosaic as the script draws it, its cells refilled by row) and in-cells.png
# (the same assignment with each photo in the cell it was assigned), tiles 24 px wide.
suppressMessages({library(magick); library(plotwidgets); library(clue); library(jsonlite)})
img_grid <- function(imgs, nr, nc){  # verbatim from the script
  nimg <- length(imgs)
  if(nimg < nr * nc){ img_inds <- c(1:nimg, rep(NA, nr * nc - nimg)) } else { img_inds <- 1:(nr * nc) }
  imgmat <- matrix(img_inds, nrow = nr, ncol = nc, byrow = TRUE)
  imgrid <- lapply(1:nr, function(ri){
    img_rinds <- imgmat[ri, !is.na(imgmat[ri,])]
    if(length(img_rinds) == 0){ return(NA) } else { row_imgs <- imgs[img_rinds]; return(image_append(image_join(row_imgs))) }
  })
  imgrid <- imgrid[!is.na(imgrid)]
  imgrid <- image_join(imgrid)
  imgrid <- image_append(imgrid, stack = TRUE)
  return(imgrid)
}
out <- "tmp/output/r-example"
dir.create(out, showWarnings = FALSE, recursive = TRUE)
image_dir <- "photomosaic/examples/photos"
npix = "200"
all_files <- list.files(image_dir, full.names = TRUE)
valid_imgs <- all_files[grepl("\\.(jpg|jpeg|png|heic|gif|tiff|bmp)$", tolower(all_files))]
imgs <- lapply(valid_imgs, image_read)
set.seed(1); perm <- sample.int(length(imgs))
set.seed(1); imgs <- sample(imgs)
imgs <- lapply(imgs, image_scale, geometry = npix)
t0 <- Sys.time()
super_image <- image_read("photomosaic/examples/red-fuji.png")
super_image_med <- image_scale(super_image, "200")
super_res <- dim(image_data(super_image_med))[-1]
super_AR <- super_res[2] / super_res[1]
grid_dims <- sqrt(length(imgs) / super_AR)
grid_dims <- floor(c(grid_dims * super_AR, grid_dims))
super_image_smol <- image_scale(super_image, paste0(grid_dims[2], "x", grid_dims[1]))
super_img_data <- as.numeric(image_data(super_image_smol, channels = "rgba"))
super_img_matrix <- apply(super_img_data, c(1,2), identity, simplify = F)
grid_map <- expand.grid(1:grid_dims[1], 1:grid_dims[2])
super_img_data <- do.call(rbind, super_img_matrix[t(t(grid_map))])
sub_img_data <- t(sapply(imgs, function(img) { img_rgb <- as.numeric(image_data(img, channels = "rgba")); return(apply(img_rgb, 3, mean)) }))
super_img_hsl <- t(rgb2hsl(t(super_img_data)))
sub_img_hsl <- t(rgb2hsl(t(sub_img_data)))
distance_matrix <- outer(1:nrow(super_img_hsl), 1:nrow(sub_img_hsl), Vectorize(function(i, j) sum((super_img_hsl[i, ] - sub_img_hsl[j, ])^2)))
t1 <- Sys.time()
assignment <- solve_LSAP(distance_matrix, maximum = FALSE)
t2 <- Sys.time()
assigned_pairs <- cbind(super_pix = 1:nrow(super_img_hsl), sub_img = assignment)
total <- sum(distance_matrix[cbind(1:nrow(super_img_hsl), as.integer(assignment))])
writeLines(toJSON(list(files = basename(valid_imgs), perm = perm, gridDims = grid_dims, assignment = as.integer(assignment), total = total,
  photoMeans = sub_img_data, costSeconds = as.numeric(t1 - t0, units = "secs"), lsapSeconds = as.numeric(t2 - t1, units = "secs")),
  digits = NA, auto_unbox = TRUE), file.path(out, "assignment.json"))
# as the script draws it
super_img_inds <- matrix(assigned_pairs[,2], byrow = T, nrow = grid_dims[1], ncol = grid_dims[2])
small <- lapply(imgs, image_scale, geometry = "24")
image_write(img_grid(small[c(super_img_inds)], grid_dims[1], grid_dims[2]), file.path(out, "as-written.png"), format = "png")
# the same assignment, each photo in its own cell (cells are listed column by column)
in_cells <- matrix(assigned_pairs[,2], nrow = grid_dims[1], ncol = grid_dims[2])
image_write(img_grid(small[c(t(in_cells))], grid_dims[1], grid_dims[2]), file.path(out, "in-cells.png"), format = "png")
cat("grid", grid_dims, "total", total, "LSAP s", as.numeric(t2 - t1, units = "secs"), "\n")
