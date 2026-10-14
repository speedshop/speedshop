import sys
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen

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
    return positions, x

lines = [line('THREAD'), line('PILOT')]
width = max(item[1] for item in lines)
ascent = font['hhea'].ascent
descent = font['hhea'].descent
baseline = ascent + (950 - (ascent - descent)) / 2
output = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} 1900" shape-rendering="crispEdges" aria-hidden="true" fill="currentColor">']
for index, (positions, advance) in enumerate(lines):
    output.append(f'  <g transform="translate({(width - advance) / 2} {baseline + index * 950:g}) scale(1 -1)">')
    for name, x in positions:
        pen = SVGPathPen(glyphs)
        glyphs[name].draw(pen)
        output.append(f'    <path transform="translate({x} 0)" d="{pen.getCommands()}"/>')
    output.append('  </g>')
output.append('</svg>')
Path('_includes/threadpilot_wordmark.svg').write_text('\n'.join(output) + '\n')
