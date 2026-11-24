"""Build Gothic Terminal into TTF + WOFF2 + WOFF.

    pip install fonttools brotli shapely
    python build.py            # writes dist/

One pixel = 100 font units, UPM 1600, so at font-size 16px (or 32, 48...)
every pixel lands exactly on a screen pixel.
"""
import os
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
from shapely.geometry import box, Polygon
from shapely.geometry.polygon import orient
from shapely.ops import unary_union
from glyphs import G

FAMILY = 'Gothic Terminal'
PS = 'GothicTerminal-Regular'
VERSION = '0.1'
PX, UPM, ADV = 100, 1600, 800
ASC, DESC = 1200, -400
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'dist')


def glyph_name(ch):
    from fontTools.agl import UV2AGL
    return UV2AGL.get(ord(ch), 'uni%04X' % ord(ch))


def outline(bottom, rows):
    top = bottom + len(rows) - 1
    cells = [box(x * PX, (top - i) * PX, (x + 1) * PX, (top - i + 1) * PX)
             for i, r in enumerate(rows) for x, c in enumerate(r) if c == '#']
    shape = unary_union(cells).simplify(0)
    polys = [shape] if isinstance(shape, Polygon) else list(shape.geoms)
    pen = TTGlyphPen(None)
    for p in polys:
        p = orient(p, sign=-1.0)          # TrueType: outer contours clockwise
        for ring in [p.exterior, *p.interiors]:
            pts = list(ring.coords)[:-1]
            pen.moveTo(tuple(map(round, pts[0])))
            for pt in pts[1:]:
                pen.lineTo(tuple(map(round, pt)))
            pen.closePath()
    return pen.glyph()


def _panose():
    from fontTools.ttLib.tables.O_S_2f_2 import Panose
    p = Panose()
    p.bFamilyType, p.bProportion = 2, 9    # Latin text, monospaced
    return p


def build():
    os.makedirs(OUT, exist_ok=True)
    order = ['.notdef', 'space'] + [glyph_name(c) for c in G]
    glyphs, metrics, cmap = {}, {}, {32: 'space'}

    pen = TTGlyphPen(None)                 # .notdef: hollow box
    for x0, y0, x1, y1, cw in [(100, 0, 700, 1000, False), (200, 100, 600, 900, True)]:
        pts = [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]
        if not cw:
            pts = pts[::-1]
        pen.moveTo(pts[0]); [pen.lineTo(p) for p in pts[1:]]; pen.closePath()
    glyphs['.notdef'] = pen.glyph()
    glyphs['space'] = TTGlyphPen(None).glyph()

    for ch, (bottom, rows) in G.items():
        n = glyph_name(ch)
        glyphs[n] = outline(bottom, rows)
        cmap[ord(ch)] = n

    fb = FontBuilder(UPM, isTTF=True)
    fb.setupGlyphOrder(order)
    fb.setupCharacterMap(cmap)
    fb.setupGlyf(glyphs)
    gs = fb.font['glyf']
    for n in order:
        metrics[n] = (ADV, getattr(gs[n], 'xMin', 0))
    fb.setupHorizontalMetrics(metrics)
    fb.setupHorizontalHeader(ascent=ASC, descent=DESC)
    fb.setupNameTable({
        'familyName': FAMILY, 'styleName': 'Regular',
        'uniqueFontIdentifier': f'{PS};{VERSION}', 'fullName': f'{FAMILY} Regular',
        'psName': PS, 'version': f'Version {VERSION}',
        'copyright': 'Copyright 2026 plasbeach',
    })
    fb.setupOS2(sTypoAscender=ASC, sTypoDescender=DESC, sTypoLineGap=0,
                usWinAscent=ASC, usWinDescent=-DESC, sxHeight=7 * PX, sCapHeight=10 * PX,
                fsSelection=0x40 | 0x80, achVendID='NONE', version=4,
                panose=_panose())
    fb.setupPost(isFixedPitch=1, underlinePosition=-200, underlineThickness=100)

    ttf = os.path.join(OUT, f'{PS}.ttf')
    fb.save(ttf)
    for flavor in ('woff2', 'woff'):
        from fontTools.ttLib import TTFont
        f = TTFont(ttf); f.flavor = flavor
        f.save(os.path.join(OUT, f'{PS}.{flavor}'))
    print('built', len(G) + 1, 'characters ->', OUT)


if __name__ == '__main__':
    build()
