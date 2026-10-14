import sys
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

font = TTFont(sys.argv[1])
glyphs = font.getGlyphSet()
cmap = font.getBestCmap()
kerning = font['GPOS'].table.LookupList.Lookup[0].SubTable[0]

def line(text):
    names = [cmap[ord(character)] for character in text]
    positions = []
    x = 0
    for index, name in enumerate(names):
        positions.append((name, x))
        x += glyphs[name].width - 55
        if index + 1 < len(names) and name in kerning.Coverage.glyphs:
            first = kerning.ClassDef1.classDefs.get(name, 0)
            second = kerning.ClassDef2.classDefs.get(names[index + 1], 0)
            x += kerning.Class1Record[first].Class2Record[second].Value1.XAdvance
    return positions

for word in ['THREAD', 'PILOT']:
    positions = line(word)
    bounds = BoundsPen(glyphs)
    for name, x in positions:
        glyphs[name].draw(TransformPen(bounds, (1, 0, 0, 1, x, 0)))
    x_min, y_min, x_max, y_max = bounds.bounds
    output = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x_min:g} {-y_max:g} {x_max - x_min:g} {y_max - y_min:g}" shape-rendering="crispEdges" aria-hidden="true" fill="currentColor">']
    output.append('  <g transform="scale(1 -1)">')
    for name, x in positions:
        pen = SVGPathPen(glyphs)
        glyphs[name].draw(pen)
        output.append(f'    <path transform="translate({x} 0)" d="{pen.getCommands()}"/>')
    output.append('  </g>')
    output.append('</svg>')
    Path(f'_includes/threadpilot_wordmark_{word.lower()}.svg').write_text('\n'.join(output) + '\n')
