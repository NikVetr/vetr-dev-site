"""Regression checks for the explicit-rating and edition rules in Book-Crossing."""
from io import BytesIO
import unittest
from zipfile import ZipFile

from prepare_book_crossing import isbn13, read_books, read_scores, select_editions


class BookCrossingTests(unittest.TestCase):
    def test_valid_equivalent_isbns_share_a_score_and_conflicts_are_removed(self):
        self.assertEqual(isbn13('0-316-66634-3'), '9780316666343')
        self.assertEqual(isbn13('9780316666343'), '9780316666343')
        self.assertIsNone(isbn13('9780316666344'))
        with ZipFile(BytesIO(), 'w') as z:
            z.writestr('BX-Book-Ratings.csv', 'User-ID;ISBN;Book-Rating\n'
                       '1;0316666343;10\n1;9780316666343;10\n2;0316666343;0\n'
                       '3;0316666343;1\n3;9780316666343;2\n3;9780316666343;1\n')
            scores, counts = read_scores(z)
        self.assertEqual(scores, {'9780316666343': {'1': 10}})
        self.assertEqual(counts['implicitZeros'], 1)
        self.assertEqual(counts['conflictingReaderISBNs'], 1)
        self.assertEqual(counts['duplicateScores'], 1)

    def test_same_titled_books_are_disambiguated_by_author_and_edition(self):
        books = {k: dict(title=t, annotations=dict(authors=[a])) for k,t,a in [
            ('A','The Story','A. Person'), ('B','THE STORY','A. Person'),
            ('C','The Story','Other Person'), ('D','The Story (Abridged)','A. Person')]}
        rows = {'A': {1,2,3}, 'B': {4,5}, 'C': {6,7}, 'D': {8}}
        self.assertEqual(select_editions(books, rows, 10), ['A','C','D'])
        self.assertEqual(rows['A'], {1,2,3})

    def test_edition_art_must_match_the_checked_isbn(self):
        with ZipFile(BytesIO(), 'w') as z:
            z.writestr('BX-Books.csv', 'ISBN;Book-Title;Book-Author;Year-Of-Publication;Image-URL-L\n'
                       '0316666343;Title;Author;2002;http://images.amazon.com/images/P/059035342X.01.LZZZZZZZ.jpg\n')
            meta = read_books(z, {'9780316666343'})['9780316666343']['annotations']
        self.assertEqual(meta['sourceUrl'], 'https://openlibrary.org/isbn/9780316666343')
        self.assertIn('/b/isbn/9780316666343-', meta['imageUrl'])
        self.assertEqual(meta['year'], 2002)


if __name__ == '__main__':
    unittest.main()
