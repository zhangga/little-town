param([string]$Voice = 'Microsoft Zira Desktop', [string]$Ffmpeg = 'ffmpeg')

# 只在更新词库时运行；产物随小程序发布，运行时不依赖 Windows 或 TTS 服务。
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskWords = Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $taskRoot 'backend/data/words/grade-1-3.json') | ConvertFrom-Json
$taskUnitsSource = Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $taskRoot 'miniapp/data/textbook-words.js')
$taskUnits = ($taskUnitsSource -replace '^\s*module\.exports\s*=\s*', '') | ConvertFrom-Json
$taskSpoken = @{}
foreach ($taskUnit in $taskUnits) {
    foreach ($taskEntry in $taskUnit.words) {
        if ($taskEntry.spoken) { $taskSpoken[$taskEntry.word] = $taskEntry.spoken }
    }
}
$taskOutput = Join-Path $taskRoot 'miniapp/audio/words'
$taskTextbookOutput = Join-Path $taskRoot 'miniapp/textbook-audio/words'
$taskWaveOutput = Join-Path $taskRoot 'output/word-audio-source'
New-Item -ItemType Directory -Path $taskOutput -Force | Out-Null
New-Item -ItemType Directory -Path $taskTextbookOutput -Force | Out-Null
New-Item -ItemType Directory -Path $taskWaveOutput -Force | Out-Null
if (-not (Get-Command $Ffmpeg -ErrorAction SilentlyContinue)) { throw 'ffmpeg is required; pass -Ffmpeg with its executable path.' }
$taskSynth = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
    $taskSynth.SelectVoice($Voice)
    if ($taskSynth.Voice.Culture.Name -ne 'en-US') { throw 'Please choose an en-US voice.' }
    $taskFormat = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(16000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
    $taskSeen = @{}
    foreach ($taskWord in $taskWords) {
        $taskStem = $taskWord.word.Trim().ToLowerInvariant().Replace("'", '').Replace(' ', '-')
        if ($taskStem -notmatch '^[a-z-]+$') { throw "Unsupported filename: $taskStem" }
        if ($taskSeen.ContainsKey($taskStem)) { continue }
        $taskSeen[$taskStem] = $true
        $taskDestination = if ($taskWord.image_url) { $taskOutput } else { $taskTextbookOutput }
        $taskSpeech = if ($taskSpoken.ContainsKey($taskWord.word)) { $taskSpoken[$taskWord.word] } else { $taskWord.word }
        foreach ($taskRate in @(-1, -4)) {
            $taskSuffix = if ($taskRate -eq -4) { '-slow' } else { '' }
            $taskSynth.Rate = $taskRate
            $taskWavePath = Join-Path $taskWaveOutput "$taskStem$taskSuffix.wav"
            $taskMp3Path = Join-Path $taskDestination "$taskStem$taskSuffix.mp3"
            $taskSynth.SetOutputToWaveFile($taskWavePath, $taskFormat)
            $taskSynth.Speak($taskSpeech)
            $taskSynth.SetOutputToNull()
            & $Ffmpeg -v error -y -i $taskWavePath -ac 1 -ar 16000 -codec:a libmp3lame -b:a 24k -map_metadata -1 $taskMp3Path
            if ($LASTEXITCODE -ne 0) { throw "Audio encoding failed: $taskStem$taskSuffix" }
        }
    }
} finally {
    $taskSynth.Dispose()
}
Get-ChildItem -LiteralPath $taskOutput -Filter '*.mp3' | Measure-Object -Property Length -Sum
