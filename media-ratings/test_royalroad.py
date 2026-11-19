"""Check that review stars, respondent overlap and duplicate rows survive the export adapter."""
import csv
import json
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory
import unittest

from prepare_royalroad import read_reviews, SCALE


class RoyalRoadTests(unittest.TestCase):
    def setUp(self):
        folder = TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        self.folder = Path(folder.name)
        self.path = self.folder / 'reviews.csv'

    def write(self, rows):
        with self.path.open('w', newline='') as stream:
            writer = csv.writer(stream)
            writer.writerow(['reviewer_id', 'fiction_id', 'title', 'overall_score'])
            writer.writerows(rows)

    def test_native_scale_deduplication_and_overlap(self):
        self.write([['a', '19', 'First, Part I', 0.5], ['a', '19', 'First, Part I', '0.50'],
                    ['b', '3', 'Second', 4.5], ['a', '3', 'Second', 5]])
        items, profile, audit = read_reviews(self.path)
        self.assertEqual([i['itemId'] for i in items], ['3', '19'])
        self.assertEqual(profile.toarray().tolist(), [[10, 1], [9, 0]])
        self.assertEqual((audit['readersWithTwoWorks'], audit['withinReaderWorkPairs'], audit['duplicateRows']), (1, 1, 1))

    def test_invalid_and_conflicting_scores(self):
        for bad in ['NaN', '0', '1.1', '6', '', 'great', '3.0']:
            self.write([['a', 1, 'One', 2], ['a', 1, 'One', bad]])
            with self.subTest(score=bad), self.assertRaises(ValueError):
                read_reviews(self.path)

    def test_build(self):
        self.write([(f'reviewer-secret-{person}', work, f'Work {work}', SCALE[(person + work) % 10])
                    for person in range(80) for work in range(1, 8)])
        source = self.folder / 'source.json'
        source.write_text(json.dumps(dict(title='Synthetic fixture', author='Test', url='https://example.org',
                                          license='Test fixture', notes='Generated unit test.')))
        subprocess.run([sys.executable, str(Path(__file__).with_name('prepare_royalroad.py')), str(self.path),
                        '--source', str(source), '--out', str(self.folder)], capture_output=True, check=True)
        output = (self.folder / 'royalroad.json').read_text()
        self.assertNotIn('reviewer-secret-', output)
        catalog = json.loads(output)
        self.assertEqual(catalog['scale'], SCALE)
        self.assertEqual(catalog['source']['license'], 'Test fixture')
        self.assertEqual(catalog['fit']['ratings'], 560)
        validation = json.loads((self.folder / 'royalroad-validation.json').read_text())
        self.assertEqual(validation['testUsers'], 16)
        self.assertEqual(validation['testRatings'], 48)


if __name__ == '__main__':
    unittest.main()
