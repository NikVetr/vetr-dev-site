# Book-Crossing reader scores

The Books tab opens Book-Crossing, where readers gave editions integer scores from 1 to 10. It covers 1,000 ISBNs and 65,657 scores from 24,874 readers. A 2004 snapshot gives it a historical emphasis. Of the 992 editions with valid publication years, the earliest dates to 1953, the latest to 2004, and the median is 1999. Goodbooks offers 1,369 Goodreads works and 3,411,488 ratings on a 1–5 scale, including more recent books. Each source keeps its own shelf. [Book-Crossing](https://grouplens.org/datasets/book-crossing/) · [Goodbooks coverage and validation](book-anime-data.md)

## What goes into a prediction

Book-Crossing contains 1,149,780 interactions. Zero denotes implicit activity. The 433,671 explicit scores occupy all ten integer categories. The importer checks ISBN-10 and ISBN-13 checksums and canonicalizes equivalent identifiers for the same edition. This excludes 6,941 explicit scores with invalid ISBNs. It counts agreeing duplicates once and excludes both reader–ISBN pairs with conflicting scores.

Eligibility requires at least 30 distinct readers' explicit scores and a matching bibliographic record with a title and author. Among 1,130 eligible editions with metadata, the catalog keeps the 1,000 most rated, limiting each normalized full title and author pair to its most-rated ISBN. Scores from other editions stay with their own ISBN. Subtitles, translators' different title spellings and edition qualifiers can yield separate entries. The displayed publication year refers to the chosen edition. Every entry links to its ISBN in Open Library. The archived publisher image paths resolve on the current Amazon image host for 978 editions. The 22 remaining ISBNs use verified Open Library cover images. [Open Library identifiers](https://openlibrary.org/dev/docs/api/books) · [Open Library covers](https://openlibrary.org/dev/docs/api/covers)

Three-fold cross-validation on the development readers compared 1, 2, 4, 8 and 16 taste classes. The selection criterion was average category log loss per reader. Sixteen classes performed best. On the independent test, each of 605 readers supplied four randomly selected ratings and the model forecast up to twelve other ratings, for 3,309 predictions. The predictions apply to scores readers chose to submit.

| Held-out measure | Edition frequencies | Personalized |
| --- | ---: | ---: |
| Category log loss | 1.8418 | 1.8136 |
| RMSE on the 1–10 scale | 1.6213 | 1.6107 |
| Brier score for a rating of 8 or higher | 0.2186 | 0.2168 |

The finer input scale helped on these same test cases. Revealing four exact scores gave a log loss of 1.81364. Revealing only the pair containing each score (1–2, 3–4, …, 9–10) gave 1.81724. Both calculations used the identical fitted mixture and exact ten-category targets. For a paired answer, we summed both category probabilities within each taste class before updating its weight. Exact minus paired log loss was −0.00360, with a paired reader standard error of 0.00120. The result isolates the extra information in these readers' responses. Goodbooks measures different readers and outcomes, so its log loss cannot rank the two sources directly. [Machine-readable validation](validation/book-crossing.json)

## Reproduce

The freeCodeCamp mirror contains the original Book-Crossing CSV archive. Its SHA-256 is `adc7b47afb47c8e29e5f0b70a9816569b3367c5588064ba7a916f16e3ef5d060`. The build reads the book and rating files and writes only fitted probabilities, bibliographic metadata and aggregate co-rating counts. It uses the catalog fitter's NumPy and SciPy environment.

```sh
mkdir -p tmp/agent/book-crossing
curl -fL https://cdn.freecodecamp.org/project-data/books/book-crossings.zip -o tmp/agent/book-crossing/BX.zip
OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 python3 media-ratings/prepare_book_crossing.py tmp/agent/book-crossing/BX.zip media-ratings
python3 -m unittest discover -s media-ratings -p test_book_crossing.py
```

Cai-Nicolas Ziegler collected the data in August and September 2004 with permission from BookCrossing. Credit for the dataset and study goes to Cai-Nicolas Ziegler, Sean M. McNee, Joseph A. Konstan and Georg Lausen, *Improving Recommendation Lists Through Topic Diversification* (WWW 2005). [Original study](https://doi.org/10.1145/1060745.1060754) · [Freiburg project](https://dbis.informatik.uni-freiburg.de/forschung/projekte/2nd-Gen-RS/index.html)
