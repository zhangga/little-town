#!/usr/bin/env python3
"""把学校的原创讲稿合成为普通话 AAC 音频；需要 macOS say、afconvert、afinfo。"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import tempfile


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--voice', default='Tingting')
    parser.add_argument('--rate', type=int, default=170)
    args = parser.parse_args()
    root = Path(__file__).resolve().parent.parent
    lessons = json.loads(subprocess.check_output(['node', '-e', "process.stdout.write(JSON.stringify(require('./miniapp/school/data/mini-lessons')))"], cwd=root, text=True))
    output = root / 'miniapp/school/audio'
    output.mkdir(parents=True, exist_ok=True)
    manifest_path = output / 'manifest.json'
    old = json.loads(manifest_path.read_text()) if manifest_path.exists() else {'clips': {}}
    clips, generated = {}, 0
    with tempfile.TemporaryDirectory(prefix='little-town-lecture-') as scratch:
        scratch = Path(scratch)
        for lesson in lessons:
            for step in lesson['steps']:
                filename = Path(step['audio']).name
                target = output / filename
                signature = hashlib.sha256((args.voice + ':' + str(args.rate) + ':aac-24000:' + step['transcript']).encode()).hexdigest()
                previous = old['clips'].get(filename, {})
                if previous.get('signature') == signature and target.exists() and hashlib.sha256(target.read_bytes()).hexdigest() == previous.get('sha256'):
                    clips[filename] = previous
                    continue
                script = scratch / 'transcript.txt'
                script.write_text(step['transcript'])
                wave, encoded = scratch / 'speech.aiff', scratch / 'speech.m4a'
                if encoded.exists():
                    encoded.unlink()
                subprocess.run(['say', '-v', args.voice, '-r', str(args.rate), '-f', str(script), '-o', str(wave)], check=True)
                subprocess.run(['afconvert', '-f', 'm4af', '-d', 'aac', '-b', '24000', '-c', '1', str(wave), str(encoded)], check=True)
                info = subprocess.check_output(['afinfo', str(encoded)], text=True)
                duration = float(re.search(r'estimated duration:\s*([\d.]+)', info).group(1))
                if duration <= 0 or encoded.stat().st_size < 1000:
                    raise RuntimeError('Invalid audio: ' + filename)
                encoded.replace(target)
                clips[filename] = {'signature': signature, 'sha256': hashlib.sha256(target.read_bytes()).hexdigest(), 'duration': round(duration, 3), 'bytes': target.stat().st_size}
                generated += 1
                print('Generated ' + filename, flush=True)
    manifest_path.write_text(json.dumps({'voice': args.voice, 'rate': args.rate, 'format': 'AAC mono 24 kbps', 'clips': clips}, ensure_ascii=False, indent=2) + '\n')
    size = sum(file.stat().st_size for file in (root / 'miniapp/school').rglob('*') if file.is_file())
    if size >= 2 * 1024 * 1024:
        raise RuntimeError('School subpackage exceeds 2 MiB: ' + str(size))
    print(f'Done: {generated} generated, {len(clips)} clips, school package {size} bytes', flush=True)


if __name__ == '__main__':
    main()
