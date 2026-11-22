# What does a first rating tell us?

With an empty Film profile, the median film gives **0.361 bits** about taste-class membership. The most informative film, *Eraser* (1996), gives **0.573 bits**. In the eight-class model, knowing the answer to *Eraser* reduces uncertainty about the rating of another uniformly chosen film by **0.090 bits** on average. These are expectations over all possible answers, before the user clicks. The search spans the 500 films in the catalog. [Scores and top item for every catalog](validation/information-audit.json)

**Class information** is the mutual information between an item's answer and the viewer's categorical class. Zero means all classes predict the same answer distribution for that item. One bit corresponds to the uncertainty of a fair yes/no question. The attainable maximum depends on both the number and prevalence of possible answers and the class distribution. A rare positive action can reveal a great deal when it actually happens and still have a small *expected* value before the answer.

**Other-item information** measures the expected reduction in uncertainty about a different item's answer after asking the top class question. To calculate it, the audit forms the joint answer distribution of two items from their class distributions, then averages mutual information over candidate targets with equal weight. This calculation describes the discrete classes. The film default also uses date, volunteered-title evidence and similarity. Models with a personal rating tendency can learn from an answer even when all the fitted classes agree.

**Held-out performance** scores actual target answers from respondents excluded from training. The table compares an item-only model with the selected personalized predictor on the same people and target masks. Most explicit-rating protocols reveal four scores. The film case uses four volunteered films. The AO3 studies reveal up to four positive kudos and score activity on the remaining works. The pooled model and personalized model can also differ in how they estimate the unconditional item probabilities. A comparison against the same model with its inputs hidden isolates the contribution of the answers. [Film test protocols](predictor-comparison.md) · [AO3 test protocols](ao3-catalogs.md)

The **Familiarity weight** slider mixes the percentile ranks of class information and estimated familiarity. At 50%, the two ranks have equal weight. It changes which question appears first. Each row displays its raw information in bits for the current profile at every setting. The table uses the unweighted maximum across all items. [Question ranking](questions.mjs)

## Catalog comparison

The median gives equal weight to each item. The last column converts the decrease in mean held-out category log loss from nats to bits per target answer. A positive value favors the personalized forecast. Score changes across different scales, response protocols and event frequencies have different interpretations.

| Catalog | Test people | Median class bits | Max class bits | Top question → other item¹ | Pooled → personalized loss | Bits saved per target |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Films · MovieLens | 3,000 | 0.3609 | 0.5733 | 0.0899 | 1.75671 → 1.57021 | 0.2691 |
| TV shows | 451 | 0.0119 | 0.9534 | 0.0191 | 1.81030 → 1.66896 | 0.2039 |
| Anime | 10,813 | 0.3843 | 0.7956 | 0.1301 | 1.66906 → 1.34111 | 0.4731 |
| Games · Metacritic | 978 | 0.2376 | 0.5266 | 0.0781 | 1.87606 → 1.71061 | 0.2387 |
| Games · Amazon | 1,737 | 0.0609 | 0.5332 | 0.0350 | 1.08150 → 0.99509 | 0.1247 |
| Games · Steam | 79,372 | 0.0936 | 0.4791 | 0.0139 | 0.34117 → 0.30879 | 0.0467 |
| Tabletop | 230 | 0.0017 | 0.3364 | 0.0030 | 0.85309 → 0.80808 | 0.0649 |
| Albums | 210 | 0.0002 | 0.2720 | 0.0014 | 1.09234 → 1.06605 | 0.0379 |
| Podcasts | 1,787 | 0.0125 | 0.4507 | 0.0187 | 0.90573 → 0.84371 | 0.0895 |
| Books · Book-Crossing | 605 | 0.0369 | 0.2850 | 0.0097 | 1.84182 → 1.74199 | 0.1440 |
| Books · Goodreads | 10,648 | 0.1825 | 0.7270 | 0.0495 | 1.27718 → 1.19234 | 0.1224 |
| Fanfiction · Goodreads | 36 | 0.0022 | 0.0794 | 0.0003 | 1.18582 → 1.14551 | 0.0581 |
| Fanfiction · licensed Kindle | 50 | 3.2e-05 | 0.0215 | 6.8e-06 | 0.56362 → 0.49044 | 0.1056 |
| Fanfiction · AO3 kudos | 7,027 | 0.0006 | 0.0316 | 1.3e-05 | 0.00563 → 0.00486 | 0.0011 |
| Web fiction · Royal Road Kindle | 214 | 0.0065 | 0.3878 | 0.0167 | 0.95012 → 0.87140 | 0.1136 |
| Web fiction · AO3 kudos | 276 | 0.0038 | 0.3798 | 0.0003 | 0.01948 → 0.01509 | 0.0063 |
| Destinations · Stravl | 12,216 | 0.2408 | 0.5223 | 0.0929 | 0.73021 → 0.57992 | 0.2168 |
| Recipes · Food.com | 1,577 | 0.0211 | 0.1807 | 0.0026 | 0.66236 → 0.63773 | 0.0355 |
| Recipes · Taste of Home | 38 | 5.5e-05 | 0.0057 | 2.3e-06 | 0.49710 → 0.49683 | 0.0004 |
| Cocktails | 66 | 2.9e-05 | 0.0119 | 1.8e-06 | 0.65649 → 0.63992 | 0.0239 |
| Subreddit replies | 2,400 | 0.0023 | 0.1017 | 0.0008 | 0.03026 → 0.03028 | -3.2e-05 |

¹ Mean bits about a uniformly chosen *other* item in the class model, given the answer to the item with maximum class bits.

The full results include the held-out respondent and target counts, the pooled and conditional log losses, the title of each most informative item and the source comparison. [Machine-readable audit](validation/information-audit.json)

## Where personalization is supported

- **Films, anime and destinations** have both informative first questions and measurable improvements on held-out ratings. The 1,419-destination catalog improves log loss from 0.7302 to 0.5799 over 12,216 held-out travelers. TV varies by title. Its most informative show gives nearly one bit, while the median show gives 0.012. [Destination evaluation](validation/destinations.json) · [TV evaluation](validation/tv.json)
- **Taste of Home and cocktails** have little class information throughout their catalogs. The maximum is 0.00574 bits for Taste of Home and 0.01194 for cocktails. Hiding all four input ratings changed the class model’s log loss from 0.49683 to 0.49694 on Taste of Home. For cocktails both scores round to 0.63992. Taste of Home has only 38 eligible held-out respondents and cocktails has 66. These results support treating both as exploratory catalogs. [Matched no-input comparisons](validation/metadata-transfer.json)
- **Licensed Kindle fanfiction illustrates a limit of the class-based question score.** Its best first title gives 0.02155 bits about class membership. Across 50 held-out reviewers, the new model improved log loss from 0.56587 with no inputs to 0.49044 with four inputs. It can learn the reader’s overall rating tendency and transfer residuals between titles with shared authors or fictional worlds. The current bit display measures only the class component of that predictor. [Response-style and metadata tests](validation/metadata-transfer.json)
- **Recorded kudos and replies** measure actions conditional on the archive's population and collection window. Positive-only prompting is useful for AO3 even when most item pairs have very little information in common. For fanfiction, four or fewer supplied kudos increased top-ten recall of hidden kudos from 2.8% to 10.7%. For original works the increase was 38.7% to 65.1%. Four random community answers changed Reddit reply log loss from 0.030261 to 0.030284. In a different protocol with one known positive reply and three absences, the hidden positive appeared in the top ten for 30.2% of accounts versus 29.3% for popularity. These sources support questions about activity. Enjoyment and exposure are unobserved. [AO3 fanfiction](validation/fanfiction.json) · [AO3 original works](validation/webfiction.json) · [Reddit replies](subreddit-catalog.md)

## Reproduction

Run the audit after preparing the training matrix and respondent split for the full film fit and the Steam sparse profiles and inventory. These inputs reconstruct held-out, item-only forecasts on the same masks as the deployed film and Steam model comparisons. The other rows use the saved respondent-disjoint evaluations. [Film preparation](README.md) · [Steam preparation](game-catalog.md)

```sh
OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 python3 media-ratings/audit_information.py \
    work/films work/steam media-ratings/validation/information-audit.json
```
