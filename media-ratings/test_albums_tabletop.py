"""Ensure edition linkage and archive reconciliation preserve one score per person."""
import json
from pathlib import Path
import tempfile
import unittest
from zipfile import ZipFile

from prepare_albums_tabletop import albums, make_profiles


class AlbumArchiveTests(unittest.TestCase):
    def test_editions_and_overlapping_snapshots(self):
        with tempfile.TemporaryDirectory() as temp:
            folder = Path(temp)
            archive = folder / 'meta.zip'
            base = dict(artist='Example', title='First record', categories=[['CDs & Vinyl', 'Rock']])
            rows = [{**base, 'amazon-id': 'A', 'confidence': 1, 'release-group-mbid': 'group'},
                    {**base, 'amazon-id': 'B'},
                    {**base, 'amazon-id': 'C', 'title': 'Second record'}]
            with ZipFile(archive, 'w') as output:
                output.writestr('mard/mard_metadata.json', '\n'.join(json.dumps(row) for row in rows))
            candidates, editions = albums(archive)
            self.assertEqual(editions, {'A': 'group', 'B': 'group', 'C': 'amazon-C'})
            self.assertEqual(candidates['group']['annotations']['linkLabel'], 'MusicBrainz')
            self.assertEqual(candidates['amazon-C']['annotations']['linkLabel'], 'Amazon')

            older, newer = folder / 'older.csv', folder / 'newer.csv'
            older.write_text('user1,A,2,120\nuser1,B,4,200\nuser1,C,3,100\nuser2,B,1,90\n')
            newer.write_text('A,user1,2,120\nB,user1,5,270\nC,user2,4,160\n')
            items, ratings = make_profiles(older, newer, editions, candidates, 10, 10, 1)
            expected = {'group': [5, 1], 'amazon-C': [3, 4]}
            for j, item in enumerate(items):
                self.assertEqual(ratings[:, j].toarray().ravel().tolist(), expected[item['itemId']])
                self.assertEqual(item['annotations']['ratingCount'], 2)


if __name__ == '__main__':
    unittest.main()
