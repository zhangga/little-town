# 阿禾小讲播

36 段普通话合成讲解，来自 `school/data/mini-lessons.js` 的原创分步讲稿，覆盖三科各 4 个主题，每课 3 步。

运行 `python3 scripts/generate-school-audio.py` 生成或更新。使用 macOS Tingting（170 wpm），`afconvert` 编码为单声道 AAC / M4A（24 kbps）；无需 API 密钥。`manifest.json` 保存讲稿指纹、文件校验和、时长及体积，文稿变化时才重建对应片段。

音频和字幕来自同一份内容；未伪装成实时生成的教师回答。题目中的具体解法由题型模块提供，播放的是对应方法课。小讲播支持暂停、继续、重听、0.8 倍速，切题/切页/后台时停止；合成讲解仍需在 iOS 和 Android 微信真机验收音质与音频行为。
