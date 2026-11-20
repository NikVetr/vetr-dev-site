import csv
import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from prepare_catalog_artwork import HERE, catalog, book_isbns, candidates, has_art, recipe_metadata, reddit_details


class ArtworkTests(unittest.TestCase):
    def test_published_records_have_current_ids_and_complete_links(self):
        manifest = json.loads((HERE / 'catalog-artwork.json').read_text())
        for key, records in manifest.items():
            items = catalog(key)
            for item_id, row in records.items():
                self.assertIn(item_id, items)
                self.assertFalse(items[item_id]['annotations'].get('imageUrl'))
                self.assertTrue(row.get('genres') or row.get('imageUrl'))
                if row.get('imageUrl'):
                    self.assertTrue(row['imageUrl'].startswith('https://'))
                    self.assertTrue(row['imageSourceUrl'].startswith('https://'))
                if 'genres' in row:
                    self.assertEqual(key, 'subreddits')
                    self.assertEqual(len(row['genres']), 1)

    def test_reddit_public_topics_and_icon_provenance(self):
        row = {'subreddit_type': 'public', 'quarantine': False, 'over18': False,
               'advertiser_category': 'Games', 'community_icon': 'https://styles.redditmedia.com/id?a=1&amp;b=2',
               'icon_img': 'https://styles.redditmedia.com/defaultIcon.png', 'header_img': 'https://example.com/photo'}
        self.assertEqual(reddit_details(row), ({'genres': ['Games']}, ['https://styles.redditmedia.com/id?a=1&b=2']))
        self.assertEqual(reddit_details({**row, 'over18': True}), ({'genres': ['Games']}, []))
        self.assertEqual(reddit_details({**row, 'subreddit_type': 'private'}), ({}, []))
        self.assertEqual(reddit_details({**row, 'quarantine': True}), ({}, []))

    def test_recipe_requires_same_publisher_id_and_preserves_photographer(self):
        page = ('"contentId":"123", "image":{"credits":"Recipe photo by Example Photographer"}'
                '<script type="application/ld+json">{"@graph":[{"@type":"Recipe","image":'
                '{"url":"https://www.tasteofhome.com/wp-content/uploads/photo.jpg"}}]}</script>')
        self.assertEqual(recipe_metadata(page, '321', 'https://example.com'), {})
        self.assertEqual(recipe_metadata(page, '123', 'https://example.com')['imageCredit'], 'Example Photographer')

    def test_valid_isbn_10_only(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'books.csv'
            with path.open('w') as f:
                writer = csv.writer(f)
                writer.writerows([['goodreads_book_id', 'isbn'], ['a', '439023483'], ['b', '030734813X'],
                                  ['c', '0307348138'], ['d', ''], ['e', '439023483']])
            self.assertEqual(book_isbns(path, {'a', 'b', 'c', 'd'}), {'a': '0439023483', 'b': '030734813X'})

    def test_reject_placeholder_or_unchecked_picture(self):
        with tempfile.TemporaryDirectory() as tmp:
            cache = Path(tmp)
            url = 'https://example.org/image.jpg'
            p = cache / 'checks' / (hashlib.sha256(url.encode()).hexdigest() + '.json')
            self.assertFalse(has_art(cache, url, True))
            p.parent.mkdir()
            p.write_text('[1,1]')
            self.assertFalse(has_art(cache, url, True))
            p.write_text('[160,500]')
            self.assertTrue(has_art(cache, url, True))

    def test_exact_edition_and_existing_art(self):
        with tempfile.TemporaryDirectory() as tmp:
            cache = Path(tmp)
            (cache / 'books').mkdir()
            row = {'key': '/books/OL88M', 'imageSourceUrl': 'http://openlibrary.org/books/OL88M/title',
                   'imageUrl': 'https://covers.openlibrary.org/b/id/17-M.jpg'}
            (cache / 'books' / '4.json').write_text(json.dumps(row))
            book = {'itemId': '4', 'annotations': {}}
            self.assertEqual(candidates(cache, 'books', book)[1], [row['imageUrl']])
            row['imageSourceUrl'] = 'https://openlibrary.org/books/OL887M/another'
            (cache / 'books' / '4.json').write_text(json.dumps(row))
            self.assertFalse(candidates(cache, 'books', book)[1])
            kindle = {'itemId': 'B00CPBC5UU', 'annotations': {'sourceUrl': 'https://www.amazon.com/dp/B00CPBC5UU'}}
            self.assertIn('B00CPBC5UU', candidates(cache, 'royalroad-kindle', kindle)[1][0])
            kindle['annotations']['imageUrl'] = 'https://example.org/current.jpg'
            self.assertFalse(candidates(cache, 'royalroad-kindle', kindle)[1])


if __name__ == '__main__':
    unittest.main()
