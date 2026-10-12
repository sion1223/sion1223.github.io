/* GPL-3.0. On-device conversion of videos the browser cannot decode (for
   example HEVC on tablets without an HEVC decoder) to H.264 MP4 for Tracker.
   ffmpeg.wasm (https://ffmpegwasm.netlify.app) is downloaded from a CDN only
   when a conversion is needed; the video never leaves the device. */
(function () {
  'use strict';
  const CORE_VERSION = '0.12.6';
  const CORE_BASES = [
    `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/umd/`,
    `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${CORE_VERSION}/dist/umd/`
  ];
  // Mirrors @ffmpeg/ffmpeg's worker. A same-origin blob worker can load the
  // single-threaded core from a CDN with importScripts; no COOP/COEP needed.
  const WORKER_SOURCE = `
    let core;
    async function load(bases) {
      let lastError;
      for (const base of bases) {
        try {
          importScripts(base + 'ffmpeg-core.js');
          const hash = btoa(JSON.stringify({ wasmURL: base + 'ffmpeg-core.wasm' }));
          return await self.createFFmpegCore({ mainScriptUrlOrBlob: base + 'ffmpeg-core.js#' + hash });
        } catch (error) { lastError = error; }
      }
      throw lastError;
    }
    self.onmessage = async ({ data }) => {
      try {
        if (!core) {
          self.postMessage({ type: 'stage', stage: 'download' });
          core = await load(data.bases);
          core.setProgress(({ progress }) => self.postMessage({ type: 'progress', progress }));
        }
        self.postMessage({ type: 'stage', stage: 'convert' });
        core.FS.writeFile('input', new Uint8Array(await data.file.arrayBuffer()));
        core.exec(...data.args);
        const ret = core.ret;
        core.reset();
        try { core.FS.unlink('input'); } catch {}
        if (ret !== 0) throw new Error('ffmpeg exited with ' + ret);
        const output = core.FS.readFile('output.mp4');
        core.FS.unlink('output.mp4');
        self.postMessage({ type: 'done', output }, [output.buffer]);
      } catch (error) {
        self.postMessage({ type: 'error', message: String(error && error.message || error) });
      }
    };`;
  // H.264 output that every Tracker browser decodes. Keep each frame's
  // timestamp (no frame-rate change) so time data stays correct, bake in phone
  // rotation, cap the long side at 1280 px for speed on tablets, and drop
  // audio, which Tracker does not use.
  const ARGS = [
    '-i', 'input', '-map', '0:v:0',
    '-vf', "scale='if(gt(iw,ih),min(1280,iw),-2)':'if(gt(iw,ih),-2,min(1280,ih))'",
    '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '20', '-pix_fmt', 'yuv420p',
    '-vsync', 'passthrough', '-an', '-movflags', '+faststart', 'output.mp4'
  ];
  let worker = null;
  let busy = false;
  function getWorker() {
    if (!worker) worker = new Worker(URL.createObjectURL(new Blob([WORKER_SOURCE], { type: 'text/javascript' })));
    return worker;
  }
  function discardWorker() {
    // A failed run can leave the core in a bad state; start fresh next time.
    worker?.terminate();
    worker = null;
  }
  window.TrackerVideoConvert = {
    /** Resolves with H.264 MP4 bytes; onProgress receives { stage, ratio }. */
    toH264(file, onProgress = () => {}) {
      if (busy) return Promise.reject(new Error('이미 다른 영상을 변환하고 있습니다.'));
      busy = true;
      return new Promise((resolve, reject) => {
        const w = getWorker();
        const fail = message => { busy = false; discardWorker(); reject(new Error(message)); };
        w.onmessage = ({ data }) => {
          if (data.type === 'stage') onProgress({ stage: data.stage, ratio: 0 });
          else if (data.type === 'progress') onProgress({ stage: 'convert', ratio: Math.max(0, Math.min(1, data.progress || 0)) });
          else if (data.type === 'done') { busy = false; resolve(data.output); }
          else if (data.type === 'error') fail(data.message);
        };
        w.onerror = event => fail(event.message || 'Video converter failed to start');
        w.postMessage({ file, args: ARGS, bases: CORE_BASES });
      });
    }
  };
})();
