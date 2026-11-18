# Run from the repository root.
source("media-ratings/select.R")
y <- matrix(c(1,1,2,3,3,NA,2,3,1,3,1,2),6,2,
            dimnames=list(as.character(1:6),c("one","two")))
design <- rating_design(y,3)
model <- fit_latent_class(design,1,8)
counts <- sapply(seq_len(ncol(y)),function(j) tabulate(y[,j],3))
expected <- sweep(counts + 8*design$pooled,2,colSums(counts)+8,"/")
stopifnot(model$converged, model$components[[1]]$weight == 1,
          max(abs(model$components[[1]]$probabilities - t(expected))) < 1e-12)
grid <- candidate_grid(1:5,list(ordinalK = c(1,3), classK = c(2,5), priorStrength = 4.5))
stopifnot(setequal(grid$model,c("ordinal1","ordinal3","class2_prior4.5","class5_prior4.5","reference")))
stopifnot(inherits(try(candidate_grid(1:5,list(classK=2.5)),silent=TRUE),"try-error"))
profiles <- make_profiles(y,seq_len(6),1:3,10)
stopifnot(length(profiles)==5, all(vapply(profiles,function(p)
  length(p$ratings)==1 && length(p$targets)==1 && !length(intersect(names(p$ratings),names(p$targets))),logical(1))))
