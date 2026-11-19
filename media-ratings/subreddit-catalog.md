# Subreddit replies

This catalog predicts whether an active account had at least one recorded outgoing reply in each of 500 communities during November 3–30, 2014. A user can answer **Replied** or **No reply**, or leave a community unanswered. The observations cover written replies between accounts in the Stanford SNAP archive. They do not measure reading, votes, subscriptions, enjoyment or present-day activity. [Reddit interaction networks and data dictionary](https://snap.stanford.edu/data/web-RedditNetworks.html)

Hamilton, Zhang and colleagues published 11 four-week reply networks for each of 2,046 communities. The release includes accounts with at least 50 comments on Reddit during 2014 and communities with at least 100 comments in each week. We select the 500 communities with the most distinct repliers in the **preceding** four weeks. A seeded, deterministic hash ordering samples 12,000 accounts that replied somewhere in the released networks during the final period. This includes accounts with zero replies in the selected 500. Deleted-account placeholders and AutoModerator are excluded. The cohort includes 29,100 positive account–community observations out of 6,000,000 possible pairs.

## Performance on held-out accounts

Three respondent-disjoint validation folds compared one, two, four and eight Bernoulli mixture classes. The eight-class fit had the lowest mean log loss. In a separate test of 2,400 accounts, the model saw four randomly chosen community answers and scored up to twelve remaining observations per account. Held-out log loss was nearly identical, 0.03026 for popularity alone and 0.03028 for eight classes. Brier score moved from 0.005465 to 0.005460. [Validation results](validation/subreddits.json)

A second test used the same locked fits and 1,048 test accounts active in at least two catalog communities. Each supplied one community where they had replied and three without a reply. We ranked one hidden positive among the remaining communities with no recorded reply. The pooled popularity model put the hidden community in the top ten for 29.3% of accounts. Eight classes reached 30.2%. [Fitting and ranking evaluation](prepare_subreddits.py)

The UW community-values survey provides direct subreddit evaluations, but its public responses lack identifiers linking the same person across communities. It cannot supply the cross-community prediction target used here. [Community values survey](https://behavioral-data.github.io/reddit_values_surveys_public/quant_survey.html)

## Reproduce

Use Python with NumPy, SciPy and ijson. The download SHA-256 is `eefdc00432e48e801cb238e8e24de7a795fd8b472681503a78c70c5896716fc1`. The published artifacts contain community names, model parameters, validation metrics and aggregate counts.

```sh
curl -fL https://snap.stanford.edu/data/reddit_reply_networks.tar.gz -o work/reddit_reply_networks.tar.gz
OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 python3 media-ratings/prepare_subreddits.py work/reddit_reply_networks.tar.gz work/out
```
