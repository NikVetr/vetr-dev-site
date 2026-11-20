import tempfile
import unittest
from pathlib import Path

import duckdb

from prepare_goodreads_fanfiction import crosswalk, rating_profiles


def book(work, title, urls=()):
    return dict(work=work, title=title, urls=set(urls), popularity=1)


def story(title='Title', permitted=True):
    return dict(title=title, authors=['Writer'], genres=['Fandom'], certificate='T',
                wordCount=1000, year=None, permitted=permitted)


class GoodreadsFanfictionTest(unittest.TestCase):
    def test_crossposts_and_editions_have_one_target(self):
        records = {'10': book('9', 'Title'), '11': book('9', 'Title', [('ffn', '11')])}
        matches = [({'10'}, ('ao3', '3'), story()), ({'10', '11'}, ('ffn', '11'), story())]
        groups = crosswalk(records, matches)
        self.assertEqual(len(groups), 1)
        members, item, direct = groups[0]
        self.assertEqual(members, ['10','11'])
        self.assertTrue(direct)
        self.assertEqual(item['annotations']['storyUrl'], 'https://www.fanfiction.net/s/11')
        self.assertEqual(item['annotations']['sourceUrl'], 'https://www.goodreads.com/book/show/11')

    def test_unconfirmed_or_ambiguous_work_is_excluded(self):
        records = {'1': book('1', 'Same', [('ffn', '99')]), '2': book('2', 'Ambiguous'),
                   '3': book('3', 'Out of scope')}
        matches = [({'1','2'}, ('ffn', '1'), story()), ({'2'}, ('ffn', '2'), story()),
                   ({'3'}, ('ao3', '4'), story(permitted=False))]
        self.assertEqual(crosswalk(records, matches), [])

    def test_zero_and_discordant_repeat_stars_are_missing(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp)
            (p/'book_id_map.csv').write_text('book_id_csv,book_id\n1,100\n2,200\n')
            (p/'goodreads_interactions.csv').write_text(
                'user_id,book_id,is_read,rating,is_reviewed\n'
                '1,1,1,5,0\n1,2,1,5,0\n2,1,1,4,0\n2,2,1,1,0\n'
                '3,1,1,0,0\n4,1,1,2,0\n5,2,1,4,0\n')
            groups: list[tuple[list[str], dict, bool]] = [(['100', '200'], dict(itemId='100', annotations={}), True)]
            with duckdb.connect(config={'threads': 1}) as db:
                profiles, items, audit = rating_profiles(p, groups, db)
            self.assertEqual(profiles.data.tolist(), [5,2,4])
            self.assertEqual(items[0]['annotations']['ratingCount'], 3)
            self.assertEqual(audit['conflictPairs'], 1)
            self.assertEqual(audit['readersWithFiveWorks'], 0)


if __name__ == '__main__':
    unittest.main()
