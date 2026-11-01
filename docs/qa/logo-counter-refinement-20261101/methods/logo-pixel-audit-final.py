"""Read-only pixel analysis, not product art or an outline autotracer.

Stable color thresholds isolate the eight large blue wordmark components.
Counters use binary topology inside each isolated blue face. PCA records ink
inertia only; it is not a measurement of a font's rotation. The original
reference is photographic and the candidate is rasterized native SVG, so
these measurements are diagnostic, never a pixel-perfect acceptance score.
"""
from pathlib import Path
from PIL import Image
from scipy.ndimage import label, find_objects, binary_fill_holes, distance_transform_edt
import numpy as np
import json, hashlib, math, subprocess

REPO = Path('/workspace/bagelito-rebuilt-storefront')
ROOT = Path(__file__).parent
INPUTS = {
    'reference': REPO / 'public/images/store-reference-approved.webp',
    'baseline2199': REPO / 'docs/qa/reference-anchors-20261101/clean-2199afb/read-only/1536-entry.png',
    'pass1': ROOT / 'pass1-e9d995c/1536-entry.png',
    'pass2': ROOT / 'pass2-2e03fd0/1536-entry.png',
    'final': ROOT / 'final-5f31873/read-only/1536-entry.png',
}

def image_audit(path):
    image = Image.open(path).convert('RGB')
    pixels = np.asarray(image).astype(int)
    mask = np.zeros(pixels.shape[:2], bool)
    roi = pixels[40:250, 475:1230]
    mask[40:250, 475:1230] = ((roi[:, :, 0] < 95) & (roi[:, :, 1] > 20)
        & (roi[:, :, 1] < 145) & (roi[:, :, 2] > 125)
        & ((roi[:, :, 2] - roi[:, :, 1]) > 30))
    components, _ = label(mask)
    sizes = np.bincount(components.ravel())
    large, tagline = [], []
    for index, region in enumerate(find_objects(components), 1):
        if region is None:
            continue
        y, x = region
        area = int(sizes[index])
        bbox = [x.start, y.start, x.stop, y.stop]
        if area > 500:
            large.append((x.start, index, region, bbox, area))
        elif 25 < area < 500 and y.start >= 170 and x.start >= 650 and x.stop <= 1050:
            tagline.append((index, region, bbox, area))
    assert len(large) == 8, ('Ambiguous wordmark component count', len(large))
    letters = {}
    for character, (_, index, region, bbox, area) in zip('BAGELITO', sorted(large)):
        face = components[region] == index
        holes = binary_fill_holes(face) & ~face
        hole_labels, _ = label(holes)
        hole_rows = []
        for hole_index, hole_region in enumerate(find_objects(hole_labels), 1):
            if hole_region is None:
                continue
            hole_area = int((hole_labels[hole_region] == hole_index).sum())
            if hole_area < 10:
                continue
            hy, hx = hole_region
            hole_rows.append({'area': hole_area,
                'bbox': [region[1].start + hx.start, region[0].start + hy.start,
                         region[1].start + hx.stop, region[0].start + hy.stop]})
        yy, xx = np.nonzero(face)
        eigenvalues, eigenvectors = np.linalg.eigh(np.cov(np.array([xx, yy])))
        vector = eigenvectors[:, -1]
        angle = math.degrees(math.atan2(vector[0], vector[1]))
        angle = (angle + 90) % 180 - 90
        letters[character] = {'bbox': bbox, 'bluePixelArea': area,
            'bboxFillRatio': area / ((bbox[2] - bbox[0]) * (bbox[3] - bbox[1])),
            'enclosedBlueCounters': hole_rows,
            'inkPCAAngleFromVerticalDegrees': angle,
            'inkPCAEigenvalueRatio': float(eigenvalues[-1] / eigenvalues[0]),
            'angleCaution': 'Ink inertia, not actual font rotation; nearly round glyphs have unstable angles.'}
    tag_mask = np.isin(components, [row[0] for row in tagline])
    points = np.argwhere(tag_mask)
    tag_widths = [float(distance_transform_edt(components[region] == index).max())
                  for index, region, _, _ in tagline]
    coral = np.zeros_like(mask)
    coral[40:250, 475:1230] = ((roi[:, :, 0] > 180) & (roi[:, :, 1] > 70)
        & (roi[:, :, 1] < 200) & (roi[:, :, 2] > 60) & (roi[:, :, 2] < 190)
        & ((roi[:, :, 0] - roi[:, :, 1]) > 40))
    return {'path': str(path), 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
        'dimensions': list(image.size), 'letters': letters,
        'tagline': {'bbox': [int(points[:, 1].min()), int(points[:, 0].min()),
                            int(points[:, 1].max() + 1), int(points[:, 0].max() + 1)],
                    'bluePixelArea': int(tag_mask.sum()),
                    'medianCharacterHalfStrokeMaximum': float(np.median(tag_widths))},
        'blueMedianRGB': np.median(pixels[mask], axis=0).tolist(),
        'coralMedianRGB': np.median(pixels[coral], axis=0).tolist()}

record = {'method': {'roiXYXY': [475, 40, 1230, 250],
    'blueThreshold': 'R<95,20<G<145,B>125,B-G>30; same thresholds for every file.',
    'largeGlyphMinimumPixels': 501, 'connectivity': 'scipy.ndimage.label default4-neighbor',
    'taglineSelection': 'Non-large components with25<area<500,bboxYmin>=170,650<=bboxX<=1050.',
    'counterScope': 'Enclosed non-blue regions within one blue glyph component, including inner coral/background; not a white-only hole mask.',
    'limits': 'Photographic lighting/antialiasing and native rasterization differ. No outlines are traced or emitted from image pixels.'},
    'codeSHAs': {'baseline2199': subprocess.check_output(['git','rev-parse','2199afb'],cwd=REPO,text=True).strip(),
                 'pass1': subprocess.check_output(['git','rev-parse','e9d995c'],cwd=REPO,text=True).strip(),
                 'pass2': subprocess.check_output(['git','rev-parse','2e03fd0'],cwd=REPO,text=True).strip(),
                 'final': subprocess.check_output(['git','rev-parse','5f31873'],cwd=REPO,text=True).strip()},
    'images': {name: image_audit(path) for name, path in INPUTS.items()}}
font_path = REPO / 'public/fonts/fredoka-variable.ttf'
from fontTools.ttLib import TTFont
font = TTFont(font_path)
record['fontEvidence'] = {
    'path': str(font_path), 'sha256': hashlib.sha256(font_path.read_bytes()).hexdigest(),
    'axes': [{'tag': axis.axisTag, 'min': axis.minValue, 'default': axis.defaultValue,
              'max': axis.maxValue} for axis in font['fvar'].axes],
    'contourCounts': {character: font['glyf'][font.getBestCmap()[ord(character)]].numberOfContours
                      for character in 'BAGO'},
    'anatomyCaution': 'FredokaBhasoneenclosedcounter(outer+counter);AcontoursareLambdaandcrossbar,notouter+hole;Ghasopeninterior. Contourcountaloneisnotnumberofholes.'}
record['nativeModelEvidence'] = {
    'baselineWrapperXY': [460, 45], 'baselineScreenScale': .8125, 'letterSpacingSVG': -8,
    'baselineTextRotations': dict(zip('BAGELITO', [-17, -12, -7, -2, 4, 9, 14, 20])),
    'pass1TextRotations': dict(zip('BAGELITO', [-24, -8, -7, -2, 4, 9, 14, 18])),
    'scope': 'OwnFontToolsoutlinetransformreproducedbaseline8bluebboxtowithin0.75CSSpx. Newperlettertargetsarebbox/weightdiagnosticsnotautotraceoridentityproof.'}
reference = record['images']['reference']
record['summary'] = {}
for name, image in record['images'].items():
    letters = image['letters']
    bbox = [min(value['bbox'][0] for value in letters.values()),
            min(value['bbox'][1] for value in letters.values()),
            max(value['bbox'][2] for value in letters.values()),
            max(value['bbox'][3] for value in letters.values())]
    errors = [abs(actual - expected) for character, value in letters.items()
              for actual, expected in zip(value['bbox'], reference['letters'][character]['bbox'])]
    record['summary'][name] = {
        'wordBlueBBox': bbox,
        'wordBluePixelArea': sum(value['bluePixelArea'] for value in letters.values()),
        'maximumPerLetterBBoxCoordinateErrorCSSPx': max(errors),
        'perLetterAreaDifferencePercent': {
            character: round((value['bluePixelArea'] / reference['letters'][character]['bluePixelArea'] - 1) * 100, 2)
            for character, value in letters.items()},
        'taglineBlueAreaDifferencePercent': round((image['tagline']['bluePixelArea'] /
                                                  reference['tagline']['bluePixelArea'] - 1) * 100, 2)}
record['pass2SourceEvidence'] = {
    'codeSHA': '2e03fd0ae5ee2b8264a37de9fb84088506975439',
    'sourceSHA256': {name: hashlib.sha256(subprocess.check_output(['git','show','2e03fd0:' + name], cwd=REPO)).hexdigest()
                     for name in ['src/reference/ReferenceScene.tsx', 'src/reference/reference-aligned.css']},
    'B': 'Onefont-derivednativeSVGpathwithtwo manuallyseparatedcounters;actualrastertwoholes.',
    'A': 'Nativefonttextwght650withtrianglegroupmaskand11SVGpxcoraledge;edgeoutsidehalfexpandsnonbluecounter.'}
record['finalSourceEvidence'] = {'codeSHA':'5f318730e928fd3e6d05dcdb7b34dbfc13247c59','sourceSHA256':{name:hashlib.sha256(subprocess.check_output(['git','show','5f31873:'+name],cwd=REPO)).hexdigest() for name in ['src/reference/ReferenceScene.tsx','src/reference/reference-aligned.css']},'scope':'Only final app change versus PASS2: A counter edge stroke-width11 to3.5 SVGpx. Same pixel criteria; no further optimization suggested.'}
(ROOT / 'logo-measurements-through-final.json').write_text(json.dumps(record, indent=2))
print(json.dumps({'output':str(ROOT / 'logo-measurements-through-final.json'),
                  'fileSHA256':hashlib.sha256((ROOT / 'logo-measurements-through-final.json').read_bytes()).hexdigest()}))
