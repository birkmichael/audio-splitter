# Opus Splitter

A static web page that takes an audio file and gives it back as numbered **Opus 32 kbps** files, each **under 48 MB**.

Everything runs in the browser with [ffmpeg.wasm](https://ffmpegwasm.netlify.app/) (libopus). No server, no uploads.

- Input: any audio (or video with an audio track) that ffmpeg can read
- Output: `name_001.opus`, `name_002.opus`, … at 32 kbps (constrained VBR)
- Parts are cut every 3 hours (about 44 MB at 32 kbps). If any part would reach 48 MB, the page re-encodes with shorter parts.
- Cuts are at fixed time points, not at silences.

## Run locally

```sh
python3 -m http.server 8000   # any static server works
```

Then open http://localhost:8000. No build step. The ffmpeg.wasm files are vendored in `vendor/` (single-threaded core, so no special COOP/COEP headers are needed).

## Hosting

Served with GitHub Pages straight from `main`.

## License

MIT for this code. ffmpeg.wasm and FFmpeg are under their own licenses (the bundled core is built with GPL components).
