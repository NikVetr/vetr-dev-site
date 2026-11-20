import gzip
import json
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any
import unittest

from prepare_kindle_worlds import identify, works


def edition(asin, title, credits, publisher='') -> dict[str, Any]:
    return dict(parent_asin=asin, title=title, store=credits, details=dict(Publisher=publisher),
                features=[], description=[])


class KindleWorldsTests(unittest.TestCase):
    def test_only_specific_licensed_works_qualify(self):
        base = edition('B000000001', 'Operation Alpha (Project Pallid Book 2)', 'C. Writer (Author)')
        base['description'] = ['The author also wrote an unrelated novella for Kindle Worlds.']
        self.assertIsNone(identify(base))
        branch = dict(base, title='A Trial (Police and Fire: Operation Alpha)')
        self.assertIsNone(identify(branch))
        branch['store'] = 'C. Writer (Author), Operation Alpha (Author) Format: Kindle Edition'
        result = identify(branch)
        assert result is not None
        self.assertEqual(result[:2], ('Operation Alpha', 'Aces Press'))
        both = edition('B000000004', 'A Life (Miss Fortune World)', 'J. Author (Author)', 'Imitation')
        self.assertIsNone(identify(both))
        both['details']['Publisher'] = 'J&R Fan Fiction (January 1, 2020)'
        result = identify(both)
        assert result is not None
        self.assertEqual(result[:2], ('Miss Fortune', 'J&R Fan Fiction'))
        self.assertIsNone(identify(dict(both, title='A Life Books 1–4 (Miss Fortune World)')))
        canon = edition('B000000005', 'The Wolfe (World of de Wolfe Pack)', 'Kathryn Le Veque (Author)',
                        'Dragonblade Publishing')
        self.assertIsNone(identify(canon))

    def test_a_story_republished_in_the_connected_world_is_counted_once(self):
        old = edition('B000000001', 'World of de Wolfe Pack: Lone Wolfe (Kindle Worlds Novella)',
                      'B. Writer (Author)')
        new = edition('B000000002', 'Lone Wolfe: De Wolfe Pack Connected World',
                      'B. Writer (Author), WolfeBane Publishing (Author)', 'WolfeBane Publishing')
        with TemporaryDirectory() as directory:
            p = Path(directory, 'meta.jsonl.gz')
            for sequence in ((old, new), (new, old)):
                with gzip.open(p, 'wt') as f:
                    for row in sequence:
                        f.write(json.dumps(row) + '\n')
                matched, repeats = works(p)
                self.assertEqual(repeats, 1)
                self.assertEqual([(r['title'], r['itemId'], r['annotations']['authors']) for r in matched],
                                 [('Lone Wolfe', 'B000000002', ['B. Writer'])])
