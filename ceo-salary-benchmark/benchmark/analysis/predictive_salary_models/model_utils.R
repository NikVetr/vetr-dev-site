log_diff_exp <- function(log_larger, log_smaller) {
  if (length(log_larger) != length(log_smaller)) stop("Log-difference inputs differ in length")
  if (any(log_smaller > log_larger, na.rm = TRUE)) stop("Log-difference inputs are reversed")
  log_larger + log1p(-exp(log_smaller - log_larger))
}

log_sum_exp_pair <- function(left, right) {
  if (length(left) != length(right)) stop("Log-sum inputs differ in length")
  maximum <- pmax(left, right)
  maximum + log(exp(left - maximum) + exp(right - maximum))
}

log_exp_mod_normal <- function(value, mean, sd, rate) {
  value <- as.numeric(value)
  mean <- as.numeric(mean)
  sd <- as.numeric(sd)
  rate <- as.numeric(rate)
  if (length(mean) != length(sd) || length(mean) != length(rate)) {
    stop("Exponentially modified normal inputs differ in length")
  }
  if (!is.finite(value) || any(!is.finite(mean)) || any(!is.finite(sd)) ||
      any(!is.finite(rate)) || any(sd <= 0) || any(rate <= 0)) {
    stop("Invalid exponentially modified normal inputs")
  }
  log(rate) + rate * (mean - value) + 0.5 * (rate * sd)^2 +
    pnorm((value - mean) / sd - rate * sd, log.p = TRUE)
}

log_interval_probability <- function(lower, upper, mean, sd) {
  if (length(mean) != length(sd)) stop("Interval mean/scale inputs differ in length")
  if (!is.finite(lower) || !is.finite(upper) || lower >= upper || any(!is.finite(mean)) || any(!is.finite(sd)) || any(sd <= 0)) {
    stop("Invalid interval-probability inputs")
  }
  use_upper_tail <- lower > mean
  result <- numeric(length(mean))
  if (any(use_upper_tail)) {
    result[use_upper_tail] <- log_diff_exp(
      pnorm(lower, mean[use_upper_tail], sd[use_upper_tail], lower.tail = FALSE, log.p = TRUE),
      pnorm(upper, mean[use_upper_tail], sd[use_upper_tail], lower.tail = FALSE, log.p = TRUE)
    )
  }
  if (any(!use_upper_tail)) {
    result[!use_upper_tail] <- log_diff_exp(
      pnorm(upper, mean[!use_upper_tail], sd[!use_upper_tail], log.p = TRUE),
      pnorm(lower, mean[!use_upper_tail], sd[!use_upper_tail], log.p = TRUE)
    )
  }
  result
}
