#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
for item in '57-dax:dax' '118-first-model:first-model'; do
  folder=${item%:*}
  name=${item#*:}
  ffmpeg -y -loglevel error -i "$folder/assets/raw.mp4" -vf "setpts=PTS-STARTPTS,fps=30,scale=1280:800,pad=iw:ih+100:0:0:color=0x13213a,subtitles=$folder/captions.srt:force_style='FontSize=11,Alignment=2,MarginV=6'" -c:v libx264 -crf 20 -pix_fmt yuv420p -an -movflags +faststart "$folder/assets/$name-captioned.mp4"
done
ffmpeg -y -loglevel error -i 56-snapshots/assets/export-raw.mp4 -i 56-snapshots/assets/recipient-raw.webm -filter_complex "[0:v]scale=1280:800,fps=30,setsar=1,setpts=PTS-STARTPTS[a];[1:v]fps=30,setsar=1,setpts=PTS-STARTPTS[b];[a][b]concat=n=2:v=1:a=0,pad=iw:ih+100:0:0:color=0x13213a,subtitles=56-snapshots/captions.srt:force_style='FontSize=11,Alignment=2,MarginV=6'[v]" -map '[v]' -c:v libx264 -crf 20 -pix_fmt yuv420p -an -movflags +faststart 56-snapshots/assets/snapshot-captioned.mp4
# Native Linux editor capture: preserve the full 1440 × 1040 window.
ffmpeg -y -loglevel error -i 60-vscode/assets/raw.mp4 -vf "fps=30,pad=iw:ih+100:0:0:color=0x13213a,subtitles=60-vscode/captions.srt:force_style='FontSize=10,Alignment=2,MarginV=5'" -c:v libx264 -crf 20 -pix_fmt yuv420p -an -movflags +faststart 60-vscode/assets/vscode-captioned.mp4
ffmpeg -y -loglevel error -ss 21 -i 60-vscode/assets/vscode-captioned.mp4 -frames:v 1 60-vscode/assets/thumbnail.png
