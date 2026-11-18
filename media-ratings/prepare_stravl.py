"""Build generic training CSVs from the Stravl release's three swipe columns."""
import argparse
import csv
import json
from collections import Counter
from itertools import combinations
from pathlib import Path


def prepare(responses, destinations, output):
    names = destinations.read_text(encoding="utf-8").splitlines()
    counts = Counter()
    pairs = Counter()
    profiles = []
    with responses.open(encoding="utf-8", newline="") as source:
        for row in csv.DictReader(source):
            scores = {}
            ambiguous = set()
            for value, column in enumerate(("no_swipes", "maybe_swipes", "yes_swipes")):
                for index in json.loads(row[column] or "[]"):
                    if type(index) is not int or not 0 <= index < len(names):
                        raise ValueError(f"Unknown destination index {index!r}")
                    if index in scores and scores[index] != value:
                        ambiguous.add(index)
                    scores[index] = value
            for index in ambiguous:
                del scores[index]
            profiles.append(scores)
            counts.update(scores.keys())
            pairs.update(combinations(sorted(scores), 2))

    # The provider offered different groups of destinations to different respondents.
    # Choose a small panel for which every pair actually received joint responses.
    panel = [counts.most_common(1)[0][0]]
    while len(panel) < 12:
        def support(item):
            joint = min(pairs[tuple(sorted((item, other)))] for other in panel)
            return joint, counts[item], -item
        choices = counts.keys() - set(panel)
        best = max(choices, key=support)
        if support(best)[0] < 100:
            break
        panel.append(best)
    if len(panel) < 3:
        raise ValueError("Insufficient co-rated destinations for the pilot.")
    output.mkdir(parents=True, exist_ok=True)
    with (output / "items.csv").open("w", newline="", encoding="utf-8") as out:
        writer = csv.writer(out)
        writer.writerow(["itemId", "title"])
        writer.writerows((i, names[i]) for i in panel)
    selected = set(panel)
    with (output / "ratings.csv").open("w", newline="", encoding="utf-8") as out:
        writer = csv.writer(out)
        writer.writerow(["userId", "itemId", "rating"])
        for user, scores in enumerate(profiles):
            writer.writerows((user, i, scores[i]) for i in sorted(selected.intersection(scores)))
    minimum = min(pairs[tuple(sorted(pair))] for pair in combinations(panel, 2))
    print(f"{len(profiles)} respondents, {len(panel)} destinations, at least {minimum} co-raters per pair.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for field in ("responses", "destinations", "output"):
        parser.add_argument(field, type=Path)
    args = parser.parse_args()
    prepare(args.responses, args.destinations, args.output)
