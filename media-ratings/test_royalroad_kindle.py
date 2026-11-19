import csv
import gzip
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from prepare_royalroad_kindle import crosswalk, item, review_profiles


class LinkedEditionTests(unittest.TestCase):
    def test_crosswalk_has_one_stable_edition_per_serial(self):
        self.assertGreater(len(crosswalk(Path(__file__).with_name('royalroad-kindle-crosswalk.csv'))), 200)
        with TemporaryDirectory() as folder:
            p = Path(folder, 'pairs.csv')
            for duplicate in ['1,B000000002', '2,B000000001']:
                p.write_text('fiction_id,parent_asin\n1,B000000001\n' + duplicate + '\n')
                with self.assertRaisesRegex(ValueError, 'repeated'):
                    crosswalk(p)

    def test_latest_review_deduplicates_edition_and_preserves_missingness(self):
        with TemporaryDirectory() as folder:
            p = Path(folder, 'scores.csv.gz')
            rows = [['u1', 'book2', 2, 40], ['u1', 'book2', 5, 1], ['u1', 'book2', 2, 40],
                    ['u3', 'book1', 3, 8], ['u3', 'other', 1, 4]]
            for reverse in [False, True]:
                with gzip.open(p, 'wt', newline='') as f:
                    writer = csv.writer(f)
                    writer.writerow(['user_id', 'parent_asin', 'rating', 'timestamp'])
                    writer.writerows(reversed(rows) if reverse else rows)
                matrix, duplicates = review_profiles(p, ['book1', 'book2'])
                self.assertEqual(matrix.toarray().tolist(), [[0, 2], [3, 0]])
                self.assertEqual(duplicates, 2)
            with gzip.open(p, 'at') as f:
                f.write('u1,book2,1,40\n')
            with self.assertRaisesRegex(ValueError, 'latest'):
                review_profiles(p, ['book1', 'book2'])

    def test_edition_and_serial_names_dates_links_and_counts_stay_separate(self):
        serial = dict(fiction_id=42, title='The entire serial', author='Pen Name',
                      tags='["Time Loop"]', is_original=1)
        edition = dict(title='First volume', author=dict(name='Author Name'),
                       details={'Publication date': 'October 31, 2020', 'Publisher': 'Example (October 31, 2020)'},
                       images=[])
        record = item('B000000123', edition, serial, 35)
        self.assertEqual(record['title'], 'First volume')
        a = record['annotations']
        self.assertEqual((a['collection'], a['authors'], a['serialAuthor']),
                         ('The entire serial', ['Author Name'], 'Pen Name'))
        self.assertEqual((a['ratingCount'], a['year'], a['publishers']), (35, 2020, ['Example']))
        self.assertEqual(a['royalRoadUrl'], 'https://www.royalroad.com/fiction/42')
        self.assertEqual(a['sourceUrl'], 'https://www.amazon.com/dp/B000000123')


if __name__ == '__main__':
    unittest.main()
