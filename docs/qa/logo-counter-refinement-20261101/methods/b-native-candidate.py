"""Native B from the project's OFL Fredoka, not reference autotracing.

Only the existing font's outer contour is retained. Its single connected
counter is split into two with a 90-font-unit blue bridge. Input image
measurements are targets for bbox/ink area, not traced outline coordinates.
"""
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.pens.recordingPen import RecordingPen
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.areaPen import AreaPen
from fontTools.pens.transformPen import TransformPen
from scipy.optimize import least_squares
import math, json, hashlib

FONT = Path('/workspace/bagelito-rebuilt-storefront/public/fonts/fredoka-variable.ttf')
OUT = Path(__file__).with_name('b-native-candidate.json')
font = TTFont(FONT)
upm = font['head'].unitsPerEm
screen_scale = .8125
rotation = -24
target = [508, 129, 606, 232]

def shape(size, width, weight, x=118, y=221):
    gs = font.getGlyphSet(location={'wdth': width, 'wght': weight})
    glyph = gs[font.getBestCmap()[ord('B')]]
    source = RecordingPen()
    glyph.draw(source)
    cut = next(i for i, value in enumerate(source.value) if value[0] == 'closePath') + 1
    outer, counter = source.value[:cut], source.value[cut:]
    result = RecordingPen()
    result.value = list(outer)
    left, bottom = counter[0][1][0]
    lower_top = counter[4][1][0][1]
    upper_bottom = lower_top + 90
    result.moveTo((left, bottom))
    result.lineTo(*counter[1][1])
    result.qCurveTo(*counter[2][1])
    result.qCurveTo(*counter[3][1])
    result.lineTo(*counter[4][1])
    result.lineTo((left, lower_top))
    result.closePath()
    result.moveTo((left, upper_bottom))
    result.lineTo((counter[7][1][0][0], upper_bottom))
    result.qCurveTo(*counter[8][1])
    result.qCurveTo(*counter[9][1])
    result.lineTo(*counter[10][1])
    result.closePath()
    area = AreaPen(gs)
    result.replay(area)
    factor = size / upm
    angle = math.radians(rotation)
    cosine, sine = math.cos(angle), math.sin(angle)
    origin_x = x - glyph.width * factor / 2 + 4  # current -8px SVG letter-spacing
    pivot_x, pivot_y = x, y - 60
    matrix = (cosine * factor, sine * factor, sine * factor, -cosine * factor,
              pivot_x + cosine * (origin_x - pivot_x) - sine * (y - pivot_y),
              pivot_y + sine * (origin_x - pivot_x) + cosine * (y - pivot_y))
    bounds = BoundsPen(gs)
    result.replay(TransformPen(bounds, matrix))
    pixels = abs(area.value) * (factor * screen_scale) ** 2
    return gs, result, bounds.bounds, pixels, origin_x, factor

def residual(parameters):
    _, _, bounds, area, _, _ = shape(*parameters)
    return [(bounds[2] - bounds[0]) * screen_scale - 98,
            (bounds[3] - bounds[1]) * screen_scale - 103,
            (area - 4580) / 100]

fit = least_squares(residual, [158, 105, 530], bounds=([140, 75, 350], [190, 125, 650]),
                    xtol=1e-12, ftol=1e-12, gtol=1e-12)
size, width, weight = fit.x
_, _, bounds, _, _, _ = shape(size, width, weight)
dx = ((target[0] + target[2]) / 2 - 460 - (bounds[0] + bounds[2]) * screen_scale / 2) / screen_scale
dy = ((target[1] + target[3]) / 2 - 45 - (bounds[1] + bounds[3]) * screen_scale / 2) / screen_scale
x, y = 118 + dx, 221 + dy
gs, result, bounds, area, origin_x, factor = shape(size, width, weight, x, y)
path = SVGPathPen(gs)
result.replay(TransformPen(path, (factor, 0, 0, -factor, origin_x, y)))
record = {
    'method': 'Own licensed font contour plus two manually separated font counters; no image autotrace.',
    'fontSHA256': hashlib.sha256(FONT.read_bytes()).hexdigest(),
    'parameters': {'x': float(x), 'y': float(y), 'pivot': [float(x), float(y - 60)],
                   'rotate': rotation, 'fontSize': float(size), 'wdth': float(width), 'wght': float(weight)},
    'targetBlueArea': 4580, 'predictedVectorBlueArea': float(area),
    'targetBlueBBox': target,
    'predictedVectorBlueBBox': [(460 if i % 2 == 0 else 45) + value * screen_scale
                               for i, value in enumerate(bounds)],
    'nativeD': path.getCommands(),
    'renderInstructions': 'Render nativeD as one SVG path with fill-rule:evenodd; rotate around parameters.pivot. Existing coral stroke can surround all three contours. Do not add the original B text too.',
    'limitations': 'Exact analytical bbox/area targets do not establish pixel fidelity or native raster topology. Verify actual B has two holes after stroke/AA. Shape remains a manual/font-derived approximation.'
}
OUT.write_text(json.dumps(record, indent=2))
print(json.dumps(record))
