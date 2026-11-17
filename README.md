# Opus Splitter

A static web page that takes an audio file and gives it back as numbered **Opus 32 kbps** files, each **under 48 MB**.

Everything runs in the browser with [ffmpeg.wasm](https://ffmpegwasm.netlify.app/) (libopus). No server, no uploads.

- Input: any audio (or video with an audio track) that ffmpeg can read
- Output: `name_001.opus`, `name_002.opus`, … mono, 32 kbps (constrained VBR). Mono because the output is meant for transcription.
- Parts are cut every 3 hours (about 44 MB at 32 kbps). If any part would reach 48 MB, the page re-encodes with shorter parts.
- Cuts are at fixed time points, not at silences.

## Run locally

```sh
python3 -m http.server 8000   # any static server works
```

Then open http://localhost:8000. No build step. The ffmpeg.wasm files are vendored in `vendor/` (ESM build, single-threaded core, so no special COOP/COEP headers are needed).

## Patched ffmpeg-core.wasm

`vendor/ffmpeg-core.wasm` is `@ffmpeg/core@0.12.10` with a two-value binary patch. The stock build has a 64 KB stack, and libopus overflows it when encoding stereo at complexity 5 or above. The overflow corrupts malloc's state just below the stack, and the encode then crashes with `RuntimeError: memory access out of bounds`. The patch moves the initial stack pointer (global 0) and the heap base (the data word at address 6077460) up by 1 MiB, from 14608160 to 15656736. That gives the stack about 1.1 MB of room. Measured peak use is about 74 KB for stereo at complexity 10.

To reproduce the patch, see `tools/patch-stack.py`.

## Hosting

Served with GitHub Pages straight from `main`.

## License

MIT for this code. ffmpeg.wasm and FFmpeg are under their own licenses (the bundled core is built with GPL components).
