import csv
import gzip
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from scipy import sparse

from prepare_amazon_games import choose, game_edition, prepare


def product(asin, name, platform='Nintendo Switch'):
    return dict(parent_asin=asin, title=name, categories=['Video Games', platform, 'Games'],
                main_category='Video Games', details={'Type of item': 'Video Game',
                                                     'Release date': 'May 29, 2019'})


class AmazonGameEditionTests(unittest.TestCase):
    def test_reject_misclassified_books_accessories_and_add_ons(self):
        row = product('B000000001', 'Example')
        self.assertIsNone(game_edition(dict(row, main_category='Books')))
        self.assertIsNone(game_edition(dict(row, categories=['Video Games', 'Nintendo Switch', 'Accessories'])))
        self.assertIsNone(game_edition(dict(row, details={'Type of item': 'Console'})))
        self.assertIsNone(game_edition(dict(row, title='Example Season Pass')))
        self.assertIsNone(game_edition(dict(row, title='Example – PlayStation 4')))

    def test_digital_content_has_a_named_platform_and_direct_source_link(self):
        row = product('B000000001', 'Example - PS4 [Digital Code]', 'PlayStation Digital Content')
        result = game_edition(row)
        assert result
        self.assertEqual(result['title'], row['title'])
        self.assertEqual(result['annotations']['platforms'], ['PlayStation 4'])
        self.assertEqual(result['annotations']['year'], 2019)
        self.assertEqual(result['annotations']['sourceUrl'], 'https://www.amazon.com/dp/B000000001')
        self.assertIsNone(game_edition(dict(row, title='Content without platform')))
        classic = game_edition(product('B000000002', 'The Sacred Stones', 'Nintendo NES'))
        assert classic
        self.assertEqual(classic['title'], 'The Sacred Stones · Nintendo NES')

    def test_distinct_platforms_survive_and_identically_titled_editions_use_review_counts(self):
        data = {}
        for asin, platform in [('B000000001','PC'), ('B000000002','PC'), ('B000000003','Wii'),
                               ('B000000004','PlayStation 3')]:
            row = game_edition(product(asin, 'The Game', platform))
            data[asin] = row
        chosen = choose(data, dict(B000000001=35, B000000002=40, B000000003=25, B000000004=24))
        self.assertEqual([i['itemId'] for i in chosen], ['B000000002', 'B000000003'])

    def test_0core_votes_keep_latest_stars_and_missing_pairs(self):
        # Include the curated exclusion IDs in an empty category so the fixture satisfies the source check.
        with TemporaryDirectory() as folder:
            root = Path(folder)
            meta, ratings = root / 'meta.gz', root / 'ratings.gz'
            kept = [('B000000001', 'The first game'), ('B000000002', 'The second game')]
            with gzip.open(meta, 'wt') as f:
                for asin,name in kept:
                    print(json.dumps(product(asin, name)), file=f)
                with Path(__file__).with_name('amazon-games-excluded.csv').open() as exclusions:
                    for row in csv.DictReader(exclusions):
                        print(json.dumps({'parent_asin': row['parent_asin']}), file=f)
            with gzip.open(ratings, 'wt') as f:
                writer = csv.writer(f)
                writer.writerow(['user_id','parent_asin','rating','timestamp'])
                for j in range(26):
                    writer.writerow([str(j),kept[0][0],1,20])
                    if j:
                        writer.writerow([str(j),kept[1][0],3,20])
                writer.writerow(['0',kept[0][0],5,21])
                writer.writerow(['0',kept[0][0],4,10])
            prepare(meta, ratings, root)
            profile = sparse.load_npz(root / 'profiles.npz')
            self.assertEqual(profile.nnz, 51)
            self.assertEqual(profile[0].toarray().tolist(), [[5, 0]])
            with gzip.open(ratings, 'at') as f:
                writer = csv.writer(f)
                writer.writerow(['0',kept[0][0],2,21])
            with self.assertRaisesRegex(ValueError, 'Conflicting'):
                prepare(meta, ratings, root)


if __name__ == '__main__':
    unittest.main()
