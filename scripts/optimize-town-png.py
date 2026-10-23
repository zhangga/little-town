#!/usr/bin/env python3
"""Recompress the five town atlases without changing a single decoded RGBA byte.

Uses only Python's standard library. Supports the existing 8-bit indexed PNGs.
Default: optimize in place, verify, then write a JSON report. No color quantization.
Use --check-against ROOT to verify current files against originals under ROOT,
without modifying any PNGs; relative paths under ROOT match this repository.
"""
import argparse
import collections
import hashlib
import json
import math
from pathlib import Path
import struct
import zlib

REPO = Path(__file__).resolve().parents[1]
FILES = [
    'miniapp/images/resident/home-atlas.png',
    'miniapp/images/resident/resident-atlas.png',
    'miniapp/images/resident/walk-directions.png',
    'miniapp/images/resident/pet-directions.png',
    'miniapp/images/town/voxel-atlas.png',
]


def chunks_of(blob):
    assert blob[:8] == b'\x89PNG\r\n\x1a\n', 'Not a PNG'
    chunks, offset = [], 8
    while offset < len(blob):
        size = struct.unpack('>I', blob[offset:offset + 4])[0]
        tag = blob[offset + 4:offset + 8]
        data = blob[offset + 8:offset + 8 + size]
        crc = struct.unpack('>I', blob[offset + 8 + size:offset + 12 + size])[0]
        assert zlib.crc32(tag + data) & 0xffffffff == crc, 'PNG CRC mismatch'
        chunks.append((tag, data))
        offset += size + 12
    assert offset == len(blob) and chunks[-1][0] == b'IEND', 'Truncated PNG'
    return chunks


def paeth(left, above, upper_left):
    predicted = left + above - upper_left
    distances = [abs(predicted - left), abs(predicted - above), abs(predicted - upper_left)]
    return [left, above, upper_left][distances.index(min(distances))]


def decode(chunks):
    header = struct.unpack('>IIBBBBB', dict(chunks)[b'IHDR'])
    width, height, depth, color, compression, filtering, interlaced = header
    assert (depth, color, compression, filtering, interlaced) == (8, 3, 0, 0, 0), 'Expected 8-bit indexed, noninterlaced PNG'
    raw = zlib.decompress(b''.join(data for tag, data in chunks if tag == b'IDAT'))
    assert len(raw) == height * (width + 1), 'Unexpected decompressed size'
    pixels, previous = bytearray(), bytes(width)
    for y in range(height):
        offset = y * (width + 1)
        kind = raw[offset]
        assert kind in range(5), 'Unsupported PNG filter'
        row = bytearray(raw[offset + 1:offset + 1 + width])
        if kind:
            for x in range(width):
                left = row[x - 1] if x else 0
                above = previous[x]
                upper_left = previous[x - 1] if x else 0
                predictor = left if kind == 1 else above if kind == 2 else (left + above) // 2 if kind == 3 else paeth(left, above, upper_left)
                row[x] = (row[x] + predictor) & 255
        pixels.extend(row)
        previous = row
    palette, alpha = dict(chunks)[b'PLTE'], dict(chunks).get(b'tRNS', b'')
    colors = [palette[i:i + 3] + bytes([alpha[i // 3] if i // 3 < len(alpha) else 255]) for i in range(0, len(palette), 3)]
    rgba = b''.join(colors[index] for index in pixels)
    return width, height, bytes(pixels), colors, rgba, raw


def encode(chunks, compressed, colors):
    result, written = bytearray(b'\x89PNG\r\n\x1a\n'), False
    for tag, data in chunks:
        if tag == b'IDAT':
            if written:
                continue
            data, written = compressed, True
        elif tag == b'PLTE':
            data = b''.join(color[:3] for color in colors)
        elif tag == b'tRNS':
            data = bytes(color[3] for color in colors)
        result.extend(struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff))
    return bytes(result)


def filtered_candidates(pixels, width, height):
    fixed = [bytearray() for _ in range(5)]
    adaptive, entropy, previous = bytearray(), bytearray(), bytes(width)
    for y in range(height):
        row = pixels[y * width:(y + 1) * width]
        rows = [row] + [bytearray(width) for _ in range(4)]
        for x, value in enumerate(row):
            left, above, upper_left = row[x - 1] if x else 0, previous[x], previous[x - 1] if x else 0
            predictors = [left, above, (left + above) // 2, paeth(left, above, upper_left)]
            for kind, predictor in enumerate(predictors, 1):
                rows[kind][x] = (value - predictor) & 255
        costs = [sum(min(value, 256 - value) for value in data) for data in rows]
        kind = min(range(5), key=costs.__getitem__)
        adaptive.append(kind)
        adaptive.extend(rows[kind])
        costs = [sum(-count * math.log2(count / width) for count in collections.Counter(data).values()) for data in rows]
        kind = min(range(5), key=costs.__getitem__)
        entropy.append(kind)
        entropy.extend(rows[kind])
        for kind, data in enumerate(rows):
            fixed[kind].append(kind)
            fixed[kind].extend(data)
        previous = row
    return [(str(kind), data) for kind, data in enumerate(fixed)] + [('adaptive', adaptive), ('entropy', entropy)]


def optimize(before):
    chunks = chunks_of(before)
    # No palette-dependent auxiliary chunks may be silently changed by remapping.
    assert all(tag in (b'IHDR', b'PLTE', b'tRNS', b'pHYs', b'IDAT', b'IEND') for tag, _ in chunks), 'Unexpected metadata; keep original and inspect it first'
    width, height, pixels, colors, _, original_raw = decode(chunks)
    count = len(colors)
    def luma(index):
        return sum(colors[index][channel] * [299, 587, 114][channel] for channel in range(3))
    def morton(index):
        return sum(((colors[index][channel] >> bit) & 1) << (bit * 3 + channel) for bit in range(8) for channel in range(3))
    orders = [
        ('original', list(range(count))),
        ('rgb', sorted(range(count), key=lambda index: tuple(colors[index]))),
        ('luma', sorted(range(count), key=luma)),
        ('alpha-luma', sorted(range(count), key=lambda index: (colors[index][3], luma(index)))),
        ('morton', sorted(range(count), key=lambda index: (colors[index][3], morton(index)))),
    ]
    best, method = before, 'original'
    for label, order in orders:
        translation = bytearray(range(256))
        for new, old in enumerate(order):
            translation[old] = new
        reordered = [colors[index] for index in order]
        candidates = filtered_candidates(pixels.translate(bytes(translation)), width, height)
        if label == 'original':
            candidates.append(('existing', original_raw))
        for name, data in candidates:
            candidate = encode(chunks, zlib.compress(data, 9), reordered)
            if len(candidate) < len(best):
                best, method = candidate, label + '/' + name
    best_chunks = chunks_of(best)
    _, _, _, best_colors, _, raw = decode(best_chunks)
    for strategy in (zlib.Z_DEFAULT_STRATEGY, zlib.Z_FILTERED, zlib.Z_RLE):
        for level in (7, 8, 9):
            for memory in range(1, 10):
                compressor = zlib.compressobj(level, zlib.DEFLATED, 15, memory, strategy)
                candidate = encode(best_chunks, compressor.compress(raw) + compressor.flush(), best_colors)
                if len(candidate) < len(best):
                    best = candidate
                    method = 'palette/filter search; zlib strategy=%s level=%s memory=%s' % (strategy, level, memory)
    return best, method


def verify(before, after):
    before_chunks, after_chunks = chunks_of(before), chunks_of(after)
    old, new = decode(before_chunks), decode(after_chunks)
    assert old[:2] == new[:2], 'Dimensions changed'
    assert old[4] == new[4], 'Decoded RGBA bytes changed'
    assert old[4][3::4] == new[4][3::4], 'Transparency changed'
    metadata = lambda chunks: [(tag, data) for tag, data in chunks if tag not in (b'PLTE', b'tRNS', b'IDAT')]
    assert metadata(before_chunks) == metadata(after_chunks), 'PNG metadata changed'
    sha = lambda value: hashlib.sha256(value).hexdigest()
    return {
        'width': old[0], 'height': old[1], 'rgba_bytes_equal': True, 'alpha_bytes_equal': True,
        'dimensions_unchanged': True, 'metadata_unchanged': True,
        'rgba_sha256': sha(old[4]), 'alpha_sha256': sha(old[4][3::4]),
        'before_file_sha256': sha(before), 'after_file_sha256': sha(after),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=REPO, help='repository root to optimize or verify')
    parser.add_argument('--check-against', type=Path, help='compare to original repository-shaped tree; do not modify PNGs')
    parser.add_argument('--report', type=Path, default=REPO / 'output/building-preview/asset-compression.json')
    args = parser.parse_args()
    results = []
    for relative in FILES:
        path = args.root / relative
        current = path.read_bytes()
        if args.check_against:
            before, after = (args.check_against / relative).read_bytes(), current
            method = 'verify current PNG against original'
        else:
            before = current
            after, method = optimize(before)
        validation = verify(before, after)
        assert len(after) <= len(before), 'Optimization grew a PNG'
        if not args.check_against and after != before:
            assert path.read_bytes() == before, 'File changed during compression'
            temporary = path.with_suffix('.png.tmp')
            temporary.write_bytes(after)
            temporary.replace(path)
        result = {'file': relative, 'before_bytes': len(before), 'after_bytes': len(after), 'saved_bytes': len(before) - len(after), 'method': method, **validation}
        results.append(result)
        print('%s: %s -> %s bytes; saved %s; RGBA and alpha identical' % (relative, len(before), len(after), result['saved_bytes']), flush=True)
    report = {'algorithm': 'PNG filter selection, lossless palette remapping, zlib parameter search; standard library only', 'zlib_version': zlib.ZLIB_VERSION, 'files': results, 'total_before_bytes': sum(row['before_bytes'] for row in results), 'total_after_bytes': sum(row['after_bytes'] for row in results), 'total_saved_bytes': sum(row['saved_bytes'] for row in results)}
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print('Total saved: %s bytes' % report['total_saved_bytes'])


if __name__ == '__main__':
    main()
