import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'pdf-viewer'/'windows'))
from awb import parse_awb, datasets


class Page:
    width=595
    def __init__(self,lines):
        self.words=[]
        for text,x,top in lines:
            for word in text.split():
                self.words.append(dict(text=word,x0=x,x1=x+len(word)*4,top=top,bottom=top+8))
                x+=len(word)*4+7
    def extract_words(self):
        return self.words


class AWBTests(unittest.TestCase):
    def test_inline_variant_and_text_preservation(self):
        page=Page([('HAWB: EXAMPLE12345',20,20),('Shipper: SAMPLE EXPORTER',20,50),('Consignee: SAMPLE IMPORTER',20,80),('Origin: CITY A',20,110),('Destination: CITY B',20,140),('Pieces: 12',20,170),('Unusual label: value to retain',20,200)])
        result=parse_awb(page,1,'variant.pdf')
        self.assertEqual(result['row']['AWB number'],'EXAMPLE12345')
        self.assertEqual(result['row']['Shipper'],'SAMPLE EXPORTER')
        self.assertEqual(result['row']['Pieces'],12)
        self.assertNotIn('Total prepaid',result['row'])
        self.assertTrue(any('value to retain' in str(d['Value']) for d in result['details']))
        self.assertEqual(datasets([result])[0]['types']['AWB number'],'text')

    def test_ordinary_document_is_not_an_awb(self):
        self.assertIsNone(parse_awb(Page([('Normal document',20,20)]),1))


if __name__=='__main__':
    unittest.main()
