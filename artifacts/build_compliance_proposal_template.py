"""Tokenize the user-supplied 3.6 finished slide without reauthoring its design.
Usage: python artifacts/build_compliance_proposal_template.py SOURCE.pptx OUTPUT.pptx
Only slide1.xml changes. Masters, layouts, media and relationships are copied verbatim.
"""
from copy import deepcopy
from pathlib import Path
from sys import argv
from zipfile import ZipFile
from lxml import etree as E

A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
P = 'http://schemas.openxmlformats.org/presentationml/2006/main'
NS = {'a': A, 'p': P}


def paragraph(root):
    return root.xpath('.//a:p', namespaces=NS)[0]


def runs(p):
    return p.xpath('./a:r', namespaces=NS)


def rewrite(p, parts):
    """Reuse paragraph and each selected run's original rich properties."""
    for child in list(p):
        if E.QName(child).localname not in ('pPr', 'endParaRPr'):
            p.remove(child)
    tail = p.find(f'{{{A}}}endParaRPr')
    def append(node):
        p.insert(p.index(tail) if tail is not None else len(p), node)
    for value, model in parts:
        for i, line in enumerate(value.split('\n')):
            if i:
                br = E.Element(f'{{{A}}}br')
                props = model.find(f'{{{A}}}rPr')
                if props is not None:
                    br.append(deepcopy(props))
                append(br)
            r = deepcopy(model)
            for child in list(r):
                if E.QName(child).localname != 'rPr':
                    r.remove(child)
            t = E.SubElement(r, f'{{{A}}}t')
            t.set('{http://www.w3.org/XML/1998/namespace}space', 'preserve')
            t.text = line
            append(r)


def build(source, output):
    assert source.resolve() != output.resolve(), 'Do not overwrite the supplied original'
    with ZipFile(source) as z:
        doc = E.fromstring(z.read('ppt/slides/slide1.xml'))
        table = doc.xpath('//a:tbl', namespaces=NS)[0]
        rows = table.xpath('./a:tr', namespaces=NS)
        assert len(rows) == 6 and all(len(r.findall(f'{{{A}}}tc')) == 4 for r in rows)
        cell = lambda ri, ci: rows[ri].findall(f'{{{A}}}tc')[ci]
        title = next(s for s in doc.xpath('//p:spTree/p:sp', namespaces=NS)
                     if ''.join(s.xpath('.//a:t/text()', namespaces=NS)).startswith('3.6 주관기관'))
        p = paragraph(title)
        rewrite(p, [('[제목]', runs(p)[0])])

        # Fixed banners, all five fixed verdicts, table geometry and external work objects remain untouched.
        p = paragraph(cell(1, 1))
        rewrite(p, [('[요구단계]단계 감리 실시\n최소 감리 일수 : [요구감리일수]일', runs(p)[0])])
        p = paragraph(cell(2, 1))
        rewrite(p, [('요청 공수: [요구투입공수]MD 이상', runs(p)[0])])

        p = paragraph(cell(1, 3)); r = runs(p)
        rewrite(p, [('[제안감리구성]', r[0]), ('[제안추가감리]', r[1]), ('\n[제안감리일정]', r[2])])

        p = paragraph(cell(2, 3)); r = runs(p)
        rewrite(p, [('전체 투입 공수  ->  ', r[0]), ('총 [제안총공수] MD ', r[1]),
                    ('(요청공수 대비 ', r[2]), ('[제안투입비율]', r[5]),
                    (' 투입)\n단계 감리팀 제안 공수 -> [제안감리원공수] MD [제안감리원배치]'
                     '\n전문가팀 제안 공수 -> [제안전문가공수] MD'
                     '\n테스트팀 제안 공수 -> [제안테스트공수] MD', r[6])])

        p = paragraph(cell(3, 3))
        rewrite(p, [('총괄 감리원(PM) : [제안PM소개]\n[제안PM경력]', runs(p)[0])])
        p = paragraph(cell(4, 3))
        rewrite(p, [('[제안감리원구성]\n[제안감리원경험]', runs(p)[0])])
        p = paragraph(cell(5, 3))
        rewrite(p, [('[제안전문가구성]', runs(p)[0])])
        # Equivalent no-outline normalization: alpha=0 text outlines hide entire glyphs in LibreOffice.
        # Only on-slide objects; the external reference/work objects remain untouched.
        shapes = doc.xpath('//p:spTree/*', namespaces=NS)
        for shape in [*shapes[2:6], title]:
            for ln in shape.xpath('.//a:rPr/a:ln[a:solidFill/*/a:alpha[@val="0"]] | .//a:endParaRPr/a:ln[a:solidFill/*/a:alpha[@val="0"]] | .//a:defRPr/a:ln[a:solidFill/*/a:alpha[@val="0"]]', namespaces=NS):
                fill = ln.find(f'{{{A}}}solidFill')
                ln.replace(fill, E.Element(f'{{{A}}}noFill'))
        changes = {'ppt/slides/slide1.xml': E.tostring(doc, xml_declaration=True, encoding='UTF-8', standalone=True)}
        with ZipFile(output, 'w') as out:
            for item in z.infolist():
                out.writestr(item, changes.get(item.filename, z.read(item.filename)))
    return output


if __name__ == '__main__':
    if len(argv) != 3:
        raise SystemExit('Usage: build_compliance_proposal_template.py SOURCE.pptx OUTPUT.pptx')
    print(build(Path(argv[1]), Path(argv[2])))
