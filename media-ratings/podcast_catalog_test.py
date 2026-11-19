"""Verify topic overlap and edited reviews have one contribution per show and reviewer."""
import tempfile
import unittest
from pathlib import Path

import duckdb

from podcast_catalog import build_profiles


class PodcastCatalogTests(unittest.TestCase):
    def test_duplicate_titles_and_edited_ratings(self):
        with tempfile.TemporaryDirectory() as directory:
            p = Path(directory)
            db = duckdb.connect()
            db.execute("CREATE TABLE shows(podcast_id INT, itunes_id INT, title VARCHAR)")
            db.execute("INSERT INTO shows VALUES (10,100,'Example'), (11,110,'Example'), (12,120,'Second')")
            db.execute("CREATE TABLE categories(podcast_id INT, category VARCHAR)")
            db.execute("INSERT INTO categories VALUES (10,'comedy'),(10,'arts'),(10,'arts-books'),(11,'comedy'),(12,'arts')")
            db.execute("""CREATE TABLE reviews AS SELECT x.podcast_id, i::VARCHAR AS author_id,
                2::INTEGER AS rating, 1::INTEGER AS created_at FROM range(22) u(i) CROSS JOIN shows x
                WHERE x.podcast_id != 11 OR i < 20""")
            db.execute("INSERT INTO reviews VALUES (10, '0', 5, 2), (10, '0', 4, 2), (12, '0', 0, 4)")
            files = [p / f'{table}.parquet' for table in ('shows', 'categories', 'reviews')]
            for table, path in zip(('shows', 'categories', 'reviews'), files):
                db.execute(f'COPY {table} TO ? (FORMAT PARQUET)', [str(path)])
            db.close()
            items, profiles = build_profiles(*files)
            self.assertEqual([i['itemId'] for i in items], ['100', '120'])
            self.assertEqual(items[0]['annotations']['genres'], ['Arts', 'Comedy'])
            self.assertEqual(items[0]['annotations']['tags'], ['Books'])
            self.assertEqual(profiles.nnz, 44)
            self.assertEqual(profiles[0, :].toarray().tolist(), [[5, 2]])


if __name__ == '__main__':
    unittest.main()
