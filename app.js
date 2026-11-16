import { FFmpeg } from './vendor/ffmpeg/index.js';

const MAX_BYTES = 48 * 1000 * 1000;   // strictly under 48 MB (decimal, the conservative reading)
const BITRATE = 32000;                // opus @ 32 kbps
// 32 kbps ≈ 4000 B/s plus Ogg overhead; start at a safe 3 h per part and shrink if a part is too big.
let segSeconds = Number(new URLSearchParams(location.search).get('seg')) || 3 * 3600;   // ?seg=N only for testing

const $ = id => document.getElementById(id);
const drop = $('drop'), input = $('file'), statusEl = $('status'), bar = $('bar'), out = $('out'), allBtn = $('all');

let ffmpeg = null;
let busy = false;
let urls = [];

async function getFFmpeg() {
  if (ffmpeg) return ffmpeg;
  const ff = new FFmpeg();
  ff.on('progress', ({ progress }) => { if (progress >= 0 && progress <= 1) bar.value = progress; });
  await ff.load({
    coreURL: new URL('vendor/ffmpeg-core.js', location.href).href,
    wasmURL: new URL('vendor/ffmpeg-core.wasm', location.href).href,
  });
  ffmpeg = ff;
  return ff;
}

const pad = n => String(n).padStart(3, '0');
const mb = b => (b / 1e6).toFixed(1) + ' MB';

function baseName(name) {
  return name.replace(/\.[^.]+$/, '').replace(/[^\w.-]+/g, '_') || 'audio';
}

async function listParts(ff) {
  const names = (await ff.listDir('/out')).filter(e => !e.isDir && e.name.endsWith('.opus')).map(e => e.name).sort();
  return names;
}

async function clearOut(ff) {
  for (const n of await listParts(ff)) await ff.deleteFile('/out/' + n);
}

async function process(file) {
  if (busy) return;
  busy = true;
  out.innerHTML = ''; allBtn.hidden = true;
  urls.forEach(URL.revokeObjectURL); urls = [];
  bar.hidden = false; bar.value = 0;
  try {
    statusEl.textContent = 'Loading encoder…';
    const ff = await getFFmpeg();
    try { await ff.createDir('/out'); } catch {}
    try { await ff.createDir('/in'); } catch {}
    await clearOut(ff);

    // Mount the file read-only instead of copying it into memory.
    try { await ff.unmount('/in'); } catch {}
    await ff.mount('WORKERFS', { files: [file] }, '/in');
    const inPath = '/in/' + file.name;

    let parts, sizes;
    for (let attempt = 0; attempt < 6; attempt++) {
      statusEl.textContent = 'Encoding to Opus 32 kbps…';
      bar.value = 0;
      await clearOut(ff);
      const code = await ff.exec([
        '-i', inPath,
        '-map', '0:a:0', '-vn', '-sn', '-dn',
        '-c:a', 'libopus', '-b:a', '32k', '-vbr', 'constrained', '-application', 'audio',
        '-f', 'segment', '-segment_format', 'opus',
        '-segment_time', String(segSeconds), '-segment_start_number', '1', '-reset_timestamps', '1',
        '/out/part_%03d.opus',
      ]);
      if (code !== 0) throw new Error('ffmpeg could not read this file as audio (exit ' + code + ').');
      parts = await listParts(ff);
      if (!parts.length) throw new Error('No audio produced.');
      const datas = [];
      sizes = [];
      for (const n of parts) { const d = await ff.readFile('/out/' + n); datas.push(d); sizes.push(d.length); }
      // ffmpeg can emit a ~10 ms trailing fragment; drop it so numbering has no pointless last file.
      while (datas.length > 1 && datas[datas.length - 1].length < 1000) { datas.pop(); sizes.pop(); parts.pop(); }
      if (sizes.every(s => s < MAX_BYTES)) {
        showParts(file, datas);
        statusEl.textContent = `Done: ${parts.length} part${parts.length > 1 ? 's' : ''}.`;
        bar.hidden = true;
        await ff.unmount('/in');
        await clearOut(ff);
        return;
      }
      segSeconds = Math.floor(segSeconds * 0.8);   // too big: retry with shorter parts
    }
    throw new Error('Could not get all parts under 48 MB.');
  } catch (e) {
    console.error(e);
    statusEl.innerHTML = '';
    const s = document.createElement('span'); s.className = 'err'; s.textContent = 'Error: ' + (e.message || e);
    statusEl.appendChild(s);
    bar.hidden = true;
  } finally {
    busy = false;
  }
}

function showParts(file, datas) {
  const base = baseName(file.name);
  const entries = datas.map((d, i) => {
    const name = `${base}_${pad(i + 1)}.opus`;
    const url = URL.createObjectURL(new Blob([d], { type: 'audio/ogg; codecs=opus' }));
    urls.push(url);
    return { name, url, size: d.length };
  });
  for (const e of entries) {
    const li = document.createElement('li');
    const label = document.createElement('span');
    label.textContent = e.name + ' ';
    const small = document.createElement('small'); small.textContent = mb(e.size);
    label.appendChild(small);
    const a = document.createElement('a'); a.className = 'btn'; a.href = e.url; a.download = e.name; a.textContent = 'Download';
    li.append(label, a); out.appendChild(li);
  }
  allBtn.hidden = entries.length < 2;
  allBtn.onclick = async () => {
    for (const e of entries) {
      const a = document.createElement('a'); a.href = e.url; a.download = e.name; document.body.appendChild(a); a.click(); a.remove();
      await new Promise(r => setTimeout(r, 300));
    }
  };
}

input.addEventListener('change', () => { if (input.files[0]) process(input.files[0]); input.value = ''; });
['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', e => { const f = e.dataTransfer.files[0]; if (f) process(f); });
