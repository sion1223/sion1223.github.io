/* GPL-3.0. iPhone/iPad shell for the upstream Tracker analysis engine. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const engine = $('tracker-engine');
  let ready = false;
  let importing = false;
  let calibrationStage = 0;
  const bridge = () => engine.contentWindow.TrackerIOS;
  const number = (value, digits = 3) => (value === null || !Number.isFinite(value) ? '' : value.toFixed(digits));
  function status(message, error = false) {
    $('status').textContent = message;
    $('status').dataset.error = String(error);
  }
  function run(action) {
    try { return action(bridge()); } catch (error) { status(error.message || '작업을 완료하지 못했습니다.', true); }
  }
  function updateState() {
    if (!ready || document.hidden) return;
    run(api => {
      const state = api.state();
      if ([0, 1, 4].includes(state.view)) $('view-select').value = String(state.view);
      $('frame-number').value = state.frame === null ? '—' : String(state.frame).padStart(3, '0');
      $('mark-button').setAttribute('aria-pressed', String(state.marking));
      $('mark-button').disabled = !state.hasTrack;
      for (const id of ['previous-button', 'next-button', 'calibrate-button', 'origin-button', 'zoom-in-button', 'zoom-out-button', 'zoom-fit-button', 'axes-button']) {
        $(id).disabled = !state.hasVideo;
      }
      $('undo-button').disabled = !state.canRemoveMark;
      $('analysis-button').disabled = !state.hasPoints;
      $('axes-button').setAttribute('aria-pressed', String(state.axesVisible));
      $('scale-readout').textContent = state.calibrated
        ? `1 ${state.lengthUnit} = ${state.pixelsPerUnit.toFixed(1)} px`
        : '미보정';
      $('calibrate-button').dataset.done = String(state.calibrated);
      $('zoom-readout').textContent = Math.round(state.zoom * 100) + '%';
      showTapBanner(state.tapMode);
    });
  }
  function showTapBanner(mode) {
    const messages = {
      calibrate: calibrationStage === 0
        ? '길이 보정 (1/2) · 길이를 아는 물체의 한쪽 끝을 터치하세요.'
        : '길이 보정 (2/2) · 반대쪽 끝을 터치하세요.',
      origin: '원점 설정 · 원점으로 쓸 위치를 터치하세요.'
    };
    $('tap-banner').hidden = !mode;
    if (mode) $('tap-message').textContent = messages[mode];
  }
  function onReady() {
    if (!bridge()?.ready || ready) return;
    ready = true;
    clearTimeout(loadTimeout);
    $('loading').hidden = true;
    $('workspace').setAttribute('aria-busy', 'false');
    document.querySelectorAll('[data-engine]').forEach(button => { button.disabled = false; });
    status('영상·파일을 열어 시작하세요. 사용 안내에 예제 영상이 있습니다.');
    updateState();
  }
  const loadTimeout = setTimeout(() => {
    if (ready) return;
    $('loading-message').textContent = '불러오기가 지연되고 있습니다. 인터넷 연결을 확인하거나 다시 시도하세요.';
    $('retry-button').hidden = false;
  }, 45000);
  addEventListener('tracker-ready', onReady);
  addEventListener('tracker-media-error', event => status(event.detail, true));
  addEventListener('tracker-tap-error', event => status(event.detail, true));
  addEventListener('tracker-convert', ({ detail: { stage, ratio } }) => {
    $('workspace').setAttribute('aria-busy', String(stage !== 'end'));
    if (stage === 'start' || stage === 'download') {
      status('이 기기에서 바로 열 수 없는 영상 코덱이라 H.264로 변환합니다. 변환 도구를 불러오는 중… (처음 한 번, 약 30MB)');
    } else if (stage === 'convert') {
      status(`영상을 H.264로 변환하는 중… ${Math.round(ratio * 100)}% · 화면을 끄거나 다른 앱으로 전환하지 마세요.`);
    }
  });
  addEventListener('tracker-tap-mode', event => showTapBanner(event.detail));
  addEventListener('tracker-calibration', event => {
    calibrationStage = event.detail.stage;
    if (calibrationStage === 1) {
      showTapBanner('calibrate');
      status('첫 번째 끝을 표시했습니다. 반대쪽 끝을 터치하세요.');
    } else {
      $('calibration-error').textContent = '';
      $('calibration-dialog').showModal();
      $('calibration-length').focus();
    }
  });
  addEventListener('tracker-origin', () => {
    status('원점을 옮겼습니다. 이제 ③ 질점을 추가해 물체를 터치하세요.');
    updateState();
  });
  engine.addEventListener('load', onReady);
  $('retry-button').addEventListener('click', () => location.reload());
  $('view-select').addEventListener('change', event => run(api => api.view(Number(event.target.value))));
  $('help-button').addEventListener('click', () => $('help').showModal());
  $('close-help').addEventListener('click', () => $('help').close());
  $('open-button').addEventListener('click', () => { if (!importing) $('import-dialog').showModal(); });
  $('close-import').addEventListener('click', () => $('import-dialog').close());
  // Android Chrome turns accept into MIME filters: .trk/.trz have no MIME type
  // there and are greyed out, as are Drive files with generic types. On Android,
  // the device button asks for media (gallery/camcorder) and the Drive button
  // accepts any file; the engine identifies the type from the file contents.
  const android = /Android/i.test(navigator.userAgent);
  const defaultAccept = $('file-input').accept;
  if (android) $('drive-open-button').textContent = 'Google Drive·파일에서 선택';
  function pickFile(accept) {
    $('import-dialog').close();
    $('file-input').accept = accept;
    $('file-input').click();
  }
  $('device-open-button').addEventListener('click', () => pickFile(android ? 'video/*,image/*' : defaultAccept));
  $('drive-open-button').addEventListener('click', () => {
    if (importing) return;
    status(android
      ? '파일 선택기 왼쪽 메뉴에서 Drive를 선택하세요. .trk / .trz 프로젝트도 여기서 엽니다.'
      : '파일 선택기의 둘러보기 또는 왼쪽 메뉴에서 Google Drive를 선택하세요.');
    pickFile(android ? '' : defaultAccept);
  });
  $('file-input').addEventListener('change', async event => {
    const file = event.target.files[0];
    if (!file) return;
    importing = true;
    $('open-button').disabled = true;
    status('파일을 읽고 있습니다: ' + file.name);
    try {
      const result = await bridge().importFile(file);
      // Keep the converted copy so it can be downloaded and reused directly.
      window.TrackerFiles.rememberSource(result.file || file);
      status(result.converted
        ? 'H.264로 변환한 영상을 열었습니다. 변환본은 「결과 다운로드」에서 받을 수 있습니다. ① 길이 보정을 하세요.'
        : result.video
          ? '영상을 열었습니다. ① 길이 보정을 하세요.'
          : 'Tracker에 파일을 전달했습니다. 영상이 보이면 ① 길이 보정을 하세요.');
    } catch (error) {
      status(error.message || '파일을 읽지 못했습니다. H.264 MP4로 다시 시도하세요.', true);
    } finally {
      importing = false;
      $('open-button').disabled = false;
      event.target.value = '';
    }
  });
  document.querySelectorAll('[data-action]').forEach(button => button.addEventListener('click', () => {
    run(api => {
      api.cancelTap();
      api.action(button.dataset.action);
      const messages = { pointMass: '영상 속 물체를 터치하세요. 점을 찍으면 다음 프레임으로 넘어갑니다.', saveZip: 'Tracker 저장 창에서 프로젝트 이름과 포함할 영상을 확인하세요.' };
      status(messages[button.dataset.action]);
      updateState();
    });
  }));
  $('calibrate-button').addEventListener('click', () => run(api => {
    calibrationStage = 0;
    api.startCalibration();
    status('확대(＋)하면 더 정확하게 터치할 수 있습니다.');
    updateState();
  }));
  $('origin-button').addEventListener('click', () => run(api => { api.startOrigin(); updateState(); }));
  $('tap-cancel').addEventListener('click', () => run(api => {
    api.cancelTap();
    status('취소했습니다.');
    updateState();
  }));
  $('calibration-form').addEventListener('submit', event => {
    event.preventDefault();
    try {
      const pixels = bridge().setCalibrationLength($('calibration-length').value, $('calibration-unit').value);
      $('calibration-dialog').close();
      status(`보정했습니다: 1 m = ${pixels.toFixed(1)} 픽셀. 다음으로 ② 원점을 설정하세요.`);
      updateState();
    } catch (error) {
      $('calibration-error').textContent = error.message;
    }
  });
  $('calibration-redo').addEventListener('click', () => {
    $('calibration-dialog').close();
    $('calibrate-button').click();
  });
  $('calibration-dialog').addEventListener('cancel', () => status('길이를 입력하지 않아 축척이 바뀌지 않았습니다. ① 길이 보정을 다시 하세요.', true));
  $('previous-button').addEventListener('click', () => run(api => { api.step(-1); updateState(); }));
  $('next-button').addEventListener('click', () => run(api => { api.step(1); updateState(); }));
  $('zoom-in-button').addEventListener('click', () => run(api => { api.zoom(1); updateState(); }));
  $('zoom-out-button').addEventListener('click', () => run(api => { api.zoom(-1); updateState(); }));
  $('zoom-fit-button').addEventListener('click', () => run(api => { api.zoom('fit'); updateState(); }));
  $('axes-button').addEventListener('click', () => run(api => { api.toggleAxes(); updateState(); }));
  $('undo-button').addEventListener('click', () => run(api => {
    const frame = api.removeLastMark();
    status(`프레임 ${frame}의 점을 지웠습니다. 다시 터치해 찍으세요.`);
    updateState();
  }));
  $('mark-button').addEventListener('click', () => run(api => {
    const enabled = !api.state().marking;
    api.setMarking(enabled);
    status(enabled ? '점을 찍을 물체를 터치하세요. 기존 점은 끌어서 수정합니다.' : '점 찍기를 껐습니다. 도구 선택과 이동을 할 수 있습니다.');
    updateState();
  }));
  document.querySelectorAll('[data-example]').forEach(button => button.addEventListener('click', () => run(api => {
    api.loadExample(button.dataset.example);
    $('help').close();
    status('예제 영상을 불러옵니다. 영상이 보이면 ① 길이 보정을 하세요.');
  })));

  // Analysis: Tracker computes the data; the shell fits and presents it.
  function polyfit(xs, ys, degree) {
    // Least squares via normal equations; returns c0 + c1·x + c2·x².
    const size = degree + 1;
    const m = Array.from({ length: size }, () => new Array(size + 1).fill(0));
    xs.forEach((x, i) => {
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) m[r][c] += x ** (r + c);
        m[r][size] += ys[i] * x ** r;
      }
    });
    for (let col = 0; col < size; col++) {
      let pivot = col;
      for (let r = col + 1; r < size; r++) if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
      [m[col], m[pivot]] = [m[pivot], m[col]];
      if (Math.abs(m[col][col]) < 1e-12) return null;
      for (let r = 0; r < size; r++) {
        if (r === col) continue;
        const factor = m[r][col] / m[col][col];
        for (let c = col; c <= size; c++) m[r][c] -= factor * m[col][c];
      }
    }
    const coef = m.map((row, i) => row[size] / row[i]);
    const predict = x => coef.reduce((sum, c, i) => sum + c * x ** i, 0);
    const mean = ys.reduce((a, b) => a + b, 0) / ys.length;
    const ssTot = ys.reduce((a, y) => a + (y - mean) ** 2, 0);
    const ssRes = ys.reduce((a, y, i) => a + (y - predict(xs[i])) ** 2, 0);
    return { coef, predict, r2: ssTot ? 1 - ssRes / ssTot : 1 };
  }
  let analysisData = null;
  function fitsFor(rows) {
    if (rows.length < 3) return { x: null, y: null };
    const t = rows.map(r => r.t);
    return { x: polyfit(t, rows.map(r => r.x), 2), y: polyfit(t, rows.map(r => r.y), 2) };
  }
  function summaryCard(label, value, detail) {
    const card = document.createElement('div');
    card.className = 'summary-card';
    const title = document.createElement('span');
    title.textContent = label;
    const strong = document.createElement('strong');
    strong.textContent = value;
    const small = document.createElement('small');
    small.textContent = detail;
    card.append(title, strong, small);
    return card;
  }
  function renderChart(rows, variable, fits) {
    const svg = $('analysis-chart');
    const ns = 'http://www.w3.org/2000/svg';
    svg.replaceChildren();
    const add = (tag, attrs, text) => {
      const node = document.createElementNS(ns, tag);
      for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
      if (text) node.textContent = text;
      svg.append(node);
      return node;
    };
    const points = rows.filter(r => r[variable] !== null).map(r => [r.t, r[variable]]);
    if (points.length < 2) {
      add('text', { x: 280, y: 130, 'text-anchor': 'middle', class: 'chart-label' }, '그래프를 그리려면 점이 2개 이상 필요합니다.');
      return;
    }
    const W = 560, H = 260, L = 56, R = 16, T = 14, B = 34;
    const ts = points.map(p => p[0]), vs = points.map(p => p[1]);
    let [t0, t1] = [Math.min(...ts), Math.max(...ts)];
    let [v0, v1] = [Math.min(...vs), Math.max(...vs)];
    if (t1 === t0) t1 = t0 + 1;
    if (v1 === v0) { v0 -= 1; v1 += 1; }
    const pad = (v1 - v0) * 0.08;
    v0 -= pad; v1 += pad;
    const sx = t => L + (t - t0) / (t1 - t0) * (W - L - R);
    const sy = v => T + (v1 - v) / (v1 - v0) * (H - T - B);
    for (let i = 0; i <= 4; i++) {
      const v = v0 + (v1 - v0) * i / 4;
      add('line', { x1: L, y1: sy(v), x2: W - R, y2: sy(v), class: 'chart-grid' });
      add('text', { x: L - 6, y: sy(v) + 4, 'text-anchor': 'end', class: 'chart-label' }, v.toFixed(2));
      const t = t0 + (t1 - t0) * i / 4;
      add('text', { x: sx(t), y: H - B + 18, 'text-anchor': 'middle', class: 'chart-label' }, t.toFixed(2));
    }
    add('line', { x1: L, y1: H - B, x2: W - R, y2: H - B, class: 'chart-axis' });
    add('line', { x1: L, y1: T, x2: L, y2: H - B, class: 'chart-axis' });
    add('text', { x: W - R, y: H - 2, 'text-anchor': 'end', class: 'chart-label' }, 't (s)');
    // Positions use the quadratic fit; velocities use a straight-line fit.
    const fit = variable === 'x' || variable === 'y' ? fits[variable] : polyfit(ts, vs, 1);
    if (fit) {
      const path = Array.from({ length: 41 }, (_, i) => {
        const t = t0 + (t1 - t0) * i / 40;
        return `${i ? 'L' : 'M'}${sx(t).toFixed(1)},${sy(fit.predict(t)).toFixed(1)}`;
      }).join('');
      add('path', { d: path, class: 'chart-fit' });
    }
    points.forEach(([t, v]) => add('circle', { cx: sx(t), cy: sy(v), r: 4.5, class: 'chart-point' }));
  }
  function renderAnalysis(trackName) {
    const data = run(api => api.analysis(trackName));
    if (!data) return;
    analysisData = data;
    $('analysis-track').replaceChildren(...data.tracks.map(name => new Option(name, name, false, name === data.name)));
    const { rows, lengthUnit: unit } = data;
    const fits = fitsFor(rows);
    const warnings = [];
    if (!data.calibrated) warnings.push('길이 보정을 하지 않아 값의 단위가 실제 길이가 아닙니다. ① 길이 보정을 먼저 하세요.');
    if (rows.length < 3) warnings.push('가속도를 구하려면 서로 다른 프레임에 점이 3개 이상 필요합니다.');
    $('analysis-warning').textContent = warnings.join(' ');
    const summary = $('analysis-summary');
    summary.replaceChildren(summaryCard('측정점', `${rows.length}개`, rows.length ? `t = ${number(rows[0].t)} – ${number(rows[rows.length - 1].t)} s` : ''));
    if (fits.y) summary.append(summaryCard('연직 가속도 ay', `${number(2 * fits.y.coef[2], 2)} ${unit}/s²`, `y–t 2차 맞춤 · R² ${fits.y.r2.toFixed(4)}`));
    if (fits.x) summary.append(summaryCard('수평 가속도 ax', `${number(2 * fits.x.coef[2], 2)} ${unit}/s²`, `x–t 2차 맞춤 · R² ${fits.x.r2.toFixed(4)}`));
    if (fits.x && fits.y) {
      const t = rows[0].t;
      const speed = Math.hypot(fits.x.coef[1] + 2 * fits.x.coef[2] * t, fits.y.coef[1] + 2 * fits.y.coef[2] * t);
      summary.append(summaryCard('처음 속력 (맞춤)', `${number(speed, 2)} ${unit}/s`, `t = ${number(t)} s`));
    }
    const head = $('analysis-table').tHead.rows[0].cells;
    head[2].textContent = `x (${unit})`;
    head[3].textContent = `y (${unit})`;
    $('analysis-table').tBodies[0].replaceChildren(...rows.map(row => {
      const tr = document.createElement('tr');
      for (const text of [row.frame === null ? '' : String(row.frame), number(row.t, 4), number(row.x), number(row.y), number(row.vx), number(row.vy), number(row.ay, 2)]) {
        const td = document.createElement('td');
        td.textContent = text;
        tr.append(td);
      }
      return tr;
    }));
    renderChart(rows, $('analysis-variable').value, fits);
  }
  $('analysis-button').addEventListener('click', () => {
    renderAnalysis();
    if (!$('analysis').open) $('analysis').showModal();
  });
  $('close-analysis').addEventListener('click', () => $('analysis').close());
  $('analysis-track').addEventListener('change', event => renderAnalysis(event.target.value));
  $('analysis-variable').addEventListener('change', () => renderAnalysis($('analysis-track').value));
  $('csv-button').addEventListener('click', () => {
    if (!analysisData?.rows.length) return status('저장할 측정점이 없습니다.', true);
    const unit = analysisData.lengthUnit;
    const header = ['frame', 't (s)', `x (${unit})`, `y (${unit})`, `vx (${unit}/s)`, `vy (${unit}/s)`, `ax (${unit}/s^2)`, `ay (${unit}/s^2)`];
    const lines = analysisData.rows.map(r => [r.frame, r.t, r.x, r.y, r.vx, r.vy, r.ax, r.ay].map(v => (v === null ? '' : String(v))).join(','));
    // The BOM lets spreadsheet apps on tablets detect UTF-8.
    const csv = '﻿' + [header.join(','), ...lines].join('\r\n') + '\r\n';
    const safeName = analysisData.name.replace(/[\\/:*?"<>|\s]+/g, '_') || 'track';
    $('analysis').close();
    window.TrackerFiles.addResult(new File([csv], `tracker-${safeName}.csv`, { type: 'text/csv' }));
  });
  // Keep the readout in sync with Tracker's own playback/auto-advance controls.
  setInterval(updateState, 350);
})();
