# Host adapter only. The vendored Stan2R translator is unchanged.
stan2r_browser_convert <- function(ast, lines, mode, dat, samps, sample_index) {
  warnings <- character()
  tryCatch(withCallingHandlers({
    blocks <- ast_program(read_sexp(ast))
    mapped <- attach_source_map(blocks, lines)
    program <- structure(list(
      blocks = mapped$blocks, block_info = mapped$block_info,
      trailing_comments = mapped$trailing_comments,
      symbols = build_symbols(mapped$blocks),
      functions = collect_functions(mapped$blocks$functions),
      source = lines, source_text = mapped$text,
      stanc_warnings = character(), stanc_version = "2.38.0"
    ), class = "stan2r_program")
    code <- stan2r(program, mode, dat, samps, sample_index)
    list(code = as.character(code), warnings = unique(warnings), error = "", error_code = "")
  }, warning = function(w) {
    warnings <<- c(warnings, conditionMessage(w))
    invokeRestart("muffleWarning")
  }), error = function(e) {
    list(code = "", warnings = unique(warnings), error = conditionMessage(e),
         error_code = if (inherits(e, "stan2r_unsupported")) "UNSUPPORTED_CONSTRUCT" else "CONVERSION_ERROR")
  })
}
