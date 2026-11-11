#!/usr/bin/env python3
"""整理十张用户课本照片，并用 macOS Samantha 生成词汇 AAC；不会修改原照片。"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import tempfile


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run(*args):
    subprocess.run(args, check=True, stdout=subprocess.DEVNULL)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-dir', type=Path)
    parser.add_argument('--voice', default='Samantha')
    args = parser.parse_args()
    root = Path(__file__).resolve().parent.parent
    courses = json.loads(subprocess.check_output(['node', '-e', "process.stdout.write(JSON.stringify(require('./miniapp/school/data/photo-english')))"], cwd=root, text=True))
    output = root / 'miniapp/coursebook'
    voice_output = root / 'miniapp/coursebook-voice'
    (output / 'photos').mkdir(parents=True, exist_ok=True)
    (voice_output / 'audio').mkdir(parents=True, exist_ok=True)
    manifest_file = output / 'manifest.json'
    previous = json.loads(manifest_file.read_text()) if manifest_file.exists() else {}
    clips, photos = {}, previous.get('photos', {})
    spoken = {form for course in courses for word in course['words'] for form in [word['word']] + word['aliases']}
    with tempfile.TemporaryDirectory(prefix='little-town-coursebook-') as scratch:
        scratch = Path(scratch)
        for text in sorted(spoken):
            stem = re.sub(r'[^a-z0-9]+', '-', text.lower()).strip('-')
            filename = stem + '.m4a'
            target = voice_output / 'audio' / filename
            signature = hashlib.sha256((args.voice + ':155:aac-24000-no-filler:' + text).encode()).hexdigest()
            old = previous.get('clips', {}).get(filename, {})
            if old.get('signature') == signature and target.exists() and old.get('sha256') == digest(target):
                clips[filename] = old
                continue
            transcript, wave, encoded = scratch / 'text.txt', scratch / 'word.aiff', scratch / 'word.m4a'
            transcript.write_text(text)
            if encoded.exists():
                encoded.unlink()
            run('say', '-v', args.voice, '-r', '155', '-f', str(transcript), '-o', str(wave))
            run('afconvert', '-f', 'm4af', '-d', 'aac', '-b', '24000', '-c', '1', '--no-filler', str(wave), str(encoded))
            info = subprocess.check_output(['afinfo', str(encoded)], text=True)
            duration = float(re.search(r'estimated duration:\s*([\d.]+)', info).group(1))
            if duration <= 0 or encoded.stat().st_size < 1000:
                raise RuntimeError('Invalid audio: ' + filename)
            encoded.replace(target)
            clips[filename] = {'text': text, 'signature': signature, 'sha256': digest(target), 'duration': round(duration, 3), 'bytes': target.stat().st_size}
            if len(clips) % 25 == 0:
                print(f'Checked {len(clips)} / {len(spoken)} word recordings', flush=True)
        if args.source_dir:
            photos = {}
            for course in courses:
                matches = list(args.source_dir.glob(f'*-{course["photoNumber"]}.jpg'))
                if len(matches) != 1:
                    raise RuntimeError(f'Expected one source photo for {course["id"]}, found {len(matches)}')
                source, target = matches[0], output / 'photos' / (course['id'] + '.jpg')
                rotate = [] if course['photoNumber'] in [3, 9] else ['-r', '90']
                run('sips', *rotate, '-Z', '1280', '-s', 'format', 'jpeg', '-s', 'formatOptions', '55', str(source), '--out', str(target))
                photos[course['id']] = {'source': source.name, 'sourceSha256': digest(source), 'sha256': digest(target), 'bytes': target.stat().st_size}
    for course in courses:
        if not (output / 'photos' / (course['id'] + '.jpg')).is_file():
            raise RuntimeError('Missing course photos; run with --source-dir first')
    manifest_file.write_text(json.dumps({'voice': args.voice, 'rate': 155, 'format': 'AAC mono 24 kbps; slow playback 0.75x', 'clips': clips, 'photos': photos}, ensure_ascii=False, indent=2) + '\n')
    for package in [output, voice_output]:
        size = sum(file.stat().st_size for file in package.rglob('*') if file.is_file())
        if size >= 2 * 1024 * 1024:
            raise RuntimeError(f'{package.name} subpackage exceeds 2 MiB: {size} bytes')
        print(f'{package.name}: {size} bytes', flush=True)
    print(f'Done: {len(courses)} courses, {sum(len(c["words"]) for c in courses)} cards, {len(clips)} clips, {len(photos)} photos', flush=True)


if __name__ == '__main__':
    main()
