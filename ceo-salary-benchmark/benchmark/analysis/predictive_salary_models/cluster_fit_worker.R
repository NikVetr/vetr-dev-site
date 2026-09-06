#!/usr/bin/env Rscript
args <- commandArgs(trailingOnly = TRUE)
if (length(args) < 3L) stop("Usage: cluster_fit_worker.R LOCAL_STAGE FIT_SIGNATURE PUBLISH_DIRECTORY [--job_tag TAG]")
stage <- args[1]; signature <- args[2]
publication_root <- normalizePath(args[3], mustWork = TRUE)
if (!grepl("^[a-f0-9]{32}$", signature)) stop("Invalid fit signature")
suppressPackageStartupMessages(library(cmdstanr))
cmdstanr::set_cmdstan_path(path.expand("~/.cmdstan/cmdstan-2.38.0"))
stopifnot(as.character(cmdstan_version()) == "2.38.0")
request_dir <- file.path(stage, "requests", signature)
request <- jsonlite::fromJSON(file.path(request_dir, "request.json"))
stopifnot(identical(request$signature, signature), request$chains == 4L)
model <- cmdstan_model(file.path(stage, "ceo_salary_model.stan"),
  exe_file = file.path(stage, "ceo_salary_model"), compile = FALSE)
local_output <- file.path(stage, "fits", signature)
dir.create(local_output, recursive = TRUE, showWarnings = FALSE)
if (file.exists(file.path(local_output, "complete.json"))) stop("Fit already completed; reconcile before rerunning: ", signature)
fit <- model$sample(data = file.path(request_dir, "data.json"),
  init = rep(list(jsonlite::fromJSON(file.path(request_dir, "init.json"))), 4L),
  seed = request$seed, chains = 4L, parallel_chains = 4L,
  iter_warmup = request$warmup, iter_sampling = request$sampling,
  adapt_delta = request$delta, max_treedepth = request$maxDepth, refresh = 0,
  output_dir = local_output, show_messages = FALSE)
files <- fit$output_files()
if (length(files) != 4L || any(!file.exists(files))) stop("Missing chain CSVs")
published <- file.path(publication_root, signature)
staging <- paste0(published, ".staging-", Sys.info()[["nodename"]])
dir.create(staging, recursive = TRUE, showWarnings = FALSE)
for (chain in 1:4) if (!file.copy(files[chain], file.path(staging, paste0("chain", chain, ".csv")))) stop("Could not publish chain")
metadata <- list(signature = signature, host = Sys.info()[["nodename"]],
  rVersion = R.version.string, cmdstanr = as.character(packageVersion("cmdstanr")),
  cmdstan = as.character(cmdstan_version()), md5 = unname(tools::md5sum(file.path(staging, paste0("chain", 1:4, ".csv")))))
jsonlite::write_json(metadata, file.path(staging, "complete.json"), auto_unbox = TRUE)
if (dir.exists(published) || !file.rename(staging, published)) stop("Atomic fit publication failed")
jsonlite::write_json(metadata, file.path(local_output, "complete.json"), auto_unbox = TRUE)
