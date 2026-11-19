"""Verify exact-edition, role and imported API evidence handling."""
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch
from zipfile import ZipFile

from prepare_literary_credits import anime_credits, book_credits


class LiteraryCreditsTests(unittest.TestCase):
    def test_books_match_edition_and_author_role(self):
        def record(key, isbn):
            return f"""<x><book><id>{key}</id><isbn>{isbn}</isbn><authors>
                <author><name>Primary Writer</name></author>
                <author><name>Reviewer</name><role>Introduction</role></author>
                <author><name>Artist</name><role>Author/Illustrator</role></author>
                <author><name>Anon editor</name><role>Editor</role></author></authors></book></x>"""
        with TemporaryDirectory() as temp:
            p = Path(temp)
            with ZipFile(p/'goodbooks.zip', 'w') as z:
                z.writestr('books_xml/42.xml', record(42, '0439023483'))
                z.writestr('books_xml/43.xml', record(43, '0439554934'))
            data = {'ISBN:9780439023481': {'details': dict(key='/books/OL1M', isbn_10=['0439023483'], publishers=['Press'])},
                    'ISBN:9780439554930': {'details': dict(key='/books/OL2M', isbn_13=['9780000000002'], publishers=['Other'])}}
            with patch('prepare_literary_credits.cached_request', return_value=data):
                rows = book_credits({'42', '43'}, p)
        self.assertEqual(rows['42']['authors'], ['Primary Writer', 'Artist'])
        self.assertEqual(rows['42']['illustrators'], ['Artist'])
        self.assertEqual(rows['42']['editors'], ['Anon editor'])
        self.assertEqual(rows['42']['publishers'], ['Press'])
        self.assertNotIn('publishers', rows['43'])

    def test_anime_ambiguous_staff_and_multistudio(self):
        def record(key, qid):
            return {k: {'value': v} for k, v in {'id':key, 'item':'http://www.wikidata.org/entity/'+qid,
                    'field':'directors', 'personLabel':'Film Director'}.items()}
        with TemporaryDirectory() as temp:
            p = Path(temp)
            (p/'mal-top.csv').write_text('URL,Studios\nhttps://myanimelist.net/anime/9,Studio A\n'
                 'https://myanimelist.net/anime/8,"Studio B, Inc., Studio C"\n')
            data = {'results':{'bindings':[record('9','Q1'), record('9','Q2'), record('8','Q3')]}}
            with patch('prepare_literary_credits.cached_request', return_value=data):
                rows = anime_credits({'8','9'}, p)
        self.assertEqual(rows['8']['studios'], ['Studio B, Inc.', 'Studio C'])
        self.assertEqual(rows['8']['directors'], ['Film Director'])
        self.assertNotIn('directors', rows['9'])


if __name__ == '__main__':
    unittest.main()
