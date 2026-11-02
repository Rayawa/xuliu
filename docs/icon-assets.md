# 序流图标生成记录

2026-11-02。使用内置 image_gen 工具；两张原始 PNG 均为 1254×1254（1:1）。

- 前景：`AppScope/resources/base/media/xuliu_foreground.png`，透明背景、森林绿 S 形流动纸带。
- 背景：`AppScope/resources/base/media/xuliu_background.png`，不透明象牙白/浅鼠尾草绿渐变。
- `entry/src/main/resources/base/media/` 使用相同前景/背景；`xuliu_start.png` 是同一透明前景的副本，配合现有启动窗口背景显示。
- 两处 `layered_image.json` 及模块启动图标已接入新资源。旧默认资源保留。
- 尚未在设备验证动态裁切或启动窗口实际显示。
- 验证：`bash scripts/build.sh` 成功生成未签名 HAP；`git diff --check` 通过。按用户要求未运行测试、未安装设备。

## Foreground prompt

Use case: logo-brand. Asset type: production HarmonyOS adaptive app icon FOREGROUND layer and startup mark for 序流 (Xuliu), a calm personal study, notes and daily planning app. Create exactly one 1:1 square 1024x1024 PNG with a genuinely transparent background. Subject: a distinctive elegant abstract S-shaped flowing ribbon, suggesting ordered pages gently becoming a stream. One compact, continuous sculptural ribbon with two broad graceful bends, clean silhouette, rounded polished edges, restrained subtle depth; beautifully simple and readable at 48px. Forest green #356B50 with a slightly lighter sage-green inner fold, refined soft material, no glossy plastic. Symmetrical optical balance centered at (512,512); the entire mark occupies about 56 percent of the canvas width and height, with generous fully transparent margins on every side for adaptive icon cropping. No square or circular tile behind it. No letters or words, no Chinese characters, no checkmarks, no tiny decorations, no outlines, no drop shadow outside the silhouette, no watermark. Background must be real alpha transparency, not white or checkerboard.

## Background prompt

Use case: logo-brand. Asset type: production HarmonyOS adaptive app icon BACKGROUND layer for 序流 Xuliu, a calm study and planning app with forest-green #356B50 accents and ivory #F5F6F2 surfaces. Generate exactly one 1:1 square 1024x1024 PNG. Fill the entire square edge to edge with an extremely subtle premium ivory-to-pale-sage gradient: near-ivory #F5F6F2 at the upper left and center, very pale soft sage #E4ECDF near the bottom right. A restrained diffuse glow in the center is okay. Smooth clean matte finish, no texture or visible grain. This is ONLY a background layer, completely empty, with no subject, symbol, S, ribbon, icon, text, frame, corners, border, shadows, mockup, or watermark. All four corners must remain fully filled and opaque, no rounded square, no transparency. The background will later sit behind a separate green flowing ribbon mark. Simple elegant neutral background, nearly a solid color.
