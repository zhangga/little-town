"""Replace only the existing shop atlas cell; preserve every other decoded pixel.

The existing palette is deliberately retained to match the rest of the town and
keep the main miniapp package small. Input RGBA comes from pack-home-art.cjs.
"""
import importlib.util
from pathlib import Path
import sys
import zlib

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('png_pack', ROOT / 'scripts/optimize-town-png.py')
png = importlib.util.module_from_spec(spec)
spec.loader.exec_module(png)
source = ROOT / 'output/imagegen/town-before-mall.png'
chunks = png.chunks_of(source.read_bytes())
width, height, pixels, colors, rgba, _ = png.decode(chunks)
assert width == height == 1024
tile = (ROOT / 'output/home-preview/mall-tile.rgba').read_bytes()
assert len(tile) == 256 * 256 * 4
palette = [tuple(color) for color in colors]
transparent = next(i for i, color in enumerate(palette) if color[3] == 0)
nearest = {}
updated = bytearray(pixels)
for y in range(256):
    for x in range(256):
        offset = (y * 256 + x) * 4
        r, g, b, a = tile[offset:offset+4]
        if a < 12:
            index = transparent
        else:
            # Cache nearby input colors; unchanged atlas pixels are never quantized.
            color = (r // 8 * 8, g // 8 * 8, b // 8 * 8, a // 8 * 8)
            if color not in nearest:
                nearest[color] = min(range(len(palette)), key=lambda i: sum((color[c] - palette[i][c]) ** 2 * (3 if c == 3 else 1) for c in range(4)))
            index = nearest[color]
        updated[y * width + 256 + x] = index
best = None
for _, raw in png.filtered_candidates(bytes(updated), width, height):
    encoded = png.encode(chunks, zlib.compress(raw, 9), colors)
    if best is None or len(encoded) < len(best):
        best = encoded
best, method = png.optimize(best)
new_rgba = png.decode(png.chunks_of(best))[4]
for y in range(height):
    for start, end in ([(0, 256), (512, width)] if y < 256 else [(0, width)]):
        a, b = (y * width + start) * 4, (y * width + end) * 4
        assert rgba[a:b] == new_rgba[a:b], 'Non-mall atlas artwork changed'
(ROOT / 'miniapp/images/town/voxel-atlas.png').write_bytes(best)
print('Town atlas:', len(best), 'bytes; every non-mall RGBA pixel unchanged')
