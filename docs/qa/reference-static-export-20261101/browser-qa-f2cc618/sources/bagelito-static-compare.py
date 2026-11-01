#!/usr/bin/env python3
"""Read-only RGB comparison of Node-baseline and static-export PNG screenshots.

Writes only the requested JSON report. Never resizes, crops, edits, or saves images.
Directories are searched recursively: relative path first, unique basename second.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import sys

from PIL import Image, ImageChops, __version__ as pillow_version


def inventory(path):
    if path.is_file():
        if path.suffix.lower() != '.png':
            raise ValueError(f'Expected a PNG screenshot: {path}')
        return {path.name: path}
    if not path.is_dir():
        raise ValueError(f'PNG file or directory not found: {path}')
    found = {p.relative_to(path).as_posix(): p for p in sorted(path.rglob('*')) if p.is_file() and p.suffix.lower() == '.png'}
    if not found:
        raise ValueError(f'No PNG screenshots under: {path}')
    return found


def sha256(path):
    with path.open('rb') as source:
        return hashlib.file_digest(source, 'sha256').hexdigest()


def compare_pair(baseline, new):
    result = {'baseline': str(baseline), 'new': str(new),
              'baseline_sha256': sha256(baseline), 'new_sha256': sha256(new)}
    with Image.open(baseline) as left, Image.open(new) as right:
        if left.format != 'PNG' or right.format != 'PNG':
            raise ValueError('Both screenshots must decode as PNG')
        if getattr(left, 'n_frames', 1) != 1 or getattr(right, 'n_frames', 1) != 1:
            raise ValueError('Only single-frame PNG screenshots are supported')
        result['dimensions'] = {'baseline': list(left.size), 'new': list(right.size)}
        result['original_modes'] = {'baseline': left.mode, 'new': right.mode}
        result['dimensions_equal'] = left.size == right.size
        if left.size != right.size:
            result.update(status='dimensions-differ', pixel_count=None,
                          mismatched_pixels=None, max_delta=None, bbox=None)
            return result
        # Decoded RGB values only; no alpha comparison or ICC color transform.
        diff = ImageChops.difference(left.convert('RGB'), right.convert('RGB'))
        red, green, blue = diff.split()
        per_pixel_max = ImageChops.lighter(ImageChops.lighter(red, green), blue)
        histogram = per_pixel_max.histogram()
        count = left.width * left.height
        mismatched = count - histogram[0]
        max_delta = max(index for index, value in enumerate(histogram) if value)
        bbox = per_pixel_max.getbbox()
        result.update(status='identical' if mismatched == 0 else 'pixels-differ',
                      pixel_count=count, mismatched_pixels=mismatched,
                      max_delta=max_delta, bbox=list(bbox) if bbox else None)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('baseline', type=Path, help='Node-baseline PNG or directory (recursive)')
    parser.add_argument('new', type=Path, help='New static-export PNG or directory (recursive)')
    parser.add_argument('result_json', type=Path, help='Output JSON report; no images are written')
    args = parser.parse_args()
    baseline, new, output = args.baseline.resolve(), args.new.resolve(), args.result_json.resolve()
    if output.suffix.lower() != '.json':
        parser.error('result_json must end in .json; images are never output files')
    report = {
        'created_at': datetime.now(timezone.utc).isoformat(),
        'baseline_root': str(baseline), 'new_root': str(new),
        'pillow_version': pillow_version,
        'comparison': 'Decoded 8-bit RGB; a pixel differs if any RGB channel differs. Alpha is ignored; ICC transforms are not applied.',
        'bbox_coordinates': 'left, top, right-exclusive, bottom-exclusive; null means no changed pixels or dimensions differ',
        'scope': 'Offline comparison of these PNGs only; no browser run, Safari claim, or image output.',
        'matching': 'same relative path first, otherwise unique new basename; extra new PNGs are listed but not compared',
        'pairs': [], 'missing_new': [], 'ambiguous_new': [], 'unmatched_new': [], 'errors': [],
    }
    try:
        old_files, new_files = inventory(baseline), inventory(new)
        if output in set(old_files.values()) | set(new_files.values()):
            raise ValueError('The JSON report cannot replace an input screenshot')
        by_name = {}
        for relative, path in new_files.items():
            by_name.setdefault(path.name, []).append((relative, path))
        used = set()
        for relative, old_path in old_files.items():
            if baseline.is_file() and new.is_file():
                candidates = [(next(iter(new_files)), new)]
            elif relative in new_files:
                candidates = [(relative, new_files[relative])]
            else:
                candidates = by_name.get(old_path.name, [])
            if not candidates:
                report['missing_new'].append(relative)
                continue
            if len(candidates) != 1:
                report['ambiguous_new'].append({'baseline': relative, 'candidates': [key for key, _ in candidates]})
                continue
            key, new_path = candidates[0]
            used.add(key)
            try:
                pair = compare_pair(old_path, new_path)
                pair['baseline_relative'] = relative
                pair['new_relative'] = key
                report['pairs'].append(pair)
            except Exception as error:
                report['errors'].append({'baseline': relative, 'new': key, 'error': str(error)})
        report['unmatched_new'] = sorted(set(new_files) - used)
    except Exception as error:
        report['errors'].append({'error': str(error)})
    report['summary'] = {
        'compared': len(report['pairs']),
        'identical': sum(pair['status'] == 'identical' for pair in report['pairs']),
        'pixel_mismatches': sum(pair['status'] == 'pixels-differ' for pair in report['pairs']),
        'dimension_mismatches': sum(pair['status'] == 'dimensions-differ' for pair in report['pairs']),
        'missing': len(report['missing_new']), 'ambiguous': len(report['ambiguous_new']),
        'new_extras_not_compared': len(report['unmatched_new']), 'errors': len(report['errors']),
    }
    passed = bool(report['pairs']) and all(pair['status'] == 'identical' for pair in report['pairs']) and not (report['missing_new'] or report['ambiguous_new'] or report['errors'])
    report['status'] = 'passed' if passed else 'failed'
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({'status': report['status'], **report['summary'], 'report': str(output)}))
    return 0 if passed else 1


if __name__ == '__main__':
    sys.exit(main())
