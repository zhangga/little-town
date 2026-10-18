#!/usr/bin/env python3
"""用 macOS 英语语音补齐词库音频；已有 MP3 默认保留。"""
import argparse
import json
from pathlib import Path
import re
import shutil
import subprocess
import tempfile


def run(*args):
    subprocess.run(args, check=True, stdout=subprocess.DEVNULL)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ffmpeg", default=shutil.which("ffmpeg"))
    parser.add_argument("--voice", help="say -v '?' 中的 en_US 语音名称")
    args = parser.parse_args()
    if not args.ffmpeg:
        parser.error("需要 FFmpeg，请用 --ffmpeg 指定可执行文件")
    if not args.voice:
        voices = subprocess.check_output(["say", "-v", "?"], text=True).splitlines()
        english = [line.split("en_US")[0].strip() for line in voices if "en_US" in line]
        args.voice = next((voice for voice in english if voice.startswith(("Samantha", "Eddy"))), None)
        if not args.voice:
            parser.error("请先安装 en_US 英语语音，或用 --voice 选择英语语音")

    root = Path(__file__).resolve().parent.parent
    seed = json.loads((root / "backend/data/words/grade-1-3.json").read_text())
    # 原始 25 词带 image_url，继续放主包；不能依靠 MP3 是否存在判断，
    # 否则补回被删的文件时会误写到另一个包。
    main_words = {word["word"].lower() for word in seed if word.get("image_url")}
    # 数据用 JS 模块供微信加载，导出的数组保持 JSON 字面量格式。
    textbook_source = (root / "miniapp/data/textbook-words.js").read_text()
    units = json.loads(textbook_source.removeprefix("module.exports = "))
    spoken = {word["word"]: word.get("spoken", word["word"]) for unit in units for word in unit["words"]}
    seen = set()
    generated = 0
    with tempfile.TemporaryDirectory(prefix="little-town-audio-") as temp:
        wave = str(Path(temp) / "word.aiff")
        for word in seed:
            stem = word["word"].strip().lower().replace("'", "").replace(" ", "-")
            if not re.fullmatch("[a-z-]+", stem):
                raise ValueError(f"Unsupported filename: {stem}")
            if stem in seen:
                continue
            seen.add(stem)
            package = "audio" if word["word"].lower() in main_words else "textbook-audio"
            output = root / "miniapp" / package / "words"
            output.mkdir(parents=True, exist_ok=True)
            for rate, suffix in [(165, ""), (110, "-slow")]:
                target = output / f"{stem}{suffix}.mp3"
                if target.exists():
                    continue
                run("say", "-v", args.voice, "-r", str(rate), "-o", wave, spoken.get(word["word"], word["word"]))
                run(args.ffmpeg, "-v", "error", "-y", "-i", wave,
                    "-af", "silenceremove=start_periods=1:start_duration=0:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_duration=0:start_threshold=-50dB,areverse,apad=pad_dur=0.12",
                    "-ac", "1", "-ar", "16000", "-codec:a", "libmp3lame", "-b:a", "24k", "-map_metadata", "-1", str(target))
                generated += 1
            if generated and len(seen) % 25 == 0:
                print(f"已检查 {len(seen)} 个词，生成 {generated} 个 MP3", flush=True)
    print(f"完成：{len(seen)} 个不同单词，新增 {generated} 个 MP3；语音 {args.voice}")


if __name__ == "__main__":
    main()
