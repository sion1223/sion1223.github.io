/* GPL-3.0. Local export tray and native file sharing; no account tokens are stored. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  let source = null;
  let results = [];
  let urls = [];
  function announce(message, error = false) {
    $('status').textContent = message;
    $('status').dataset.error = String(error);
  }
  function mime(name) {
    if (/\.(trz|zip)$/i.test(name)) return 'application/zip';
    if (/\.csv$/i.test(name)) return 'text/csv';
    if (/\.(trk|xml)$/i.test(name)) return 'application/xml';
    if (/\.txt$/i.test(name)) return 'text/plain';
    if (/\.png$/i.test(name)) return 'image/png';
    if (/\.pdf$/i.test(name)) return 'application/pdf';
    return 'application/octet-stream';
  }
  function canShare(file) {
    try { return !!navigator.canShare?.({ files: [file] }) && !!navigator.share; }
    catch { return false; }
  }
  function render() {
    urls.forEach(URL.revokeObjectURL);
    urls = [];
    const list = $('result-files');
    list.replaceChildren();
    const entries = results.map(file => ({ file, label: '분석 결과' }));
    if (source) entries.push({ file: source, label: '선택한 원본' });
    if (!entries.length) {
      const empty = document.createElement('p');
      empty.textContent = '아직 파일이 없습니다. 영상을 선택하거나 프로젝트·표 데이터를 저장하면 여기에 표시됩니다.';
      list.append(empty);
    }
    const supported = entries.some(({ file }) => canShare(file));
    $('share-hint').textContent = supported
      ? '공유 메뉴에서 저장하거나 열 앱을 선택할 수 있습니다.'
      : '이 브라우저에서는 다운로드를 사용하세요. 파일 공유는 HTTPS와 지원되는 브라우저에서 사용할 수 있습니다.';
    for (const { file, label } of entries) {
      const card = document.createElement('section');
      card.className = 'file-card';
      const title = document.createElement('h3');
      title.textContent = file.name;
      const detail = document.createElement('p');
      detail.textContent = `${label} · ${(file.size / 1024 / 1024).toFixed(2)} MB`;
      const actions = document.createElement('div');
      actions.className = 'file-actions';
      const download = document.createElement('a');
      const url = URL.createObjectURL(file);
      urls.push(url);
      download.href = url;
      download.download = file.name;
      download.textContent = '다운로드';
      const share = document.createElement('button');
      share.textContent = '다른 앱에 공유';
      share.disabled = !canShare(file);
      share.addEventListener('click', async () => {
        share.disabled = true;
        try {
          // Invoke synchronously from this tap to retain iOS/Android user activation.
          await navigator.share({ files: [file], title: file.name });
          announce('파일을 공유 메뉴에 전달했습니다.');
        } catch (error) {
          if (error.name !== 'AbortError') announce('공유하지 못했습니다. 다운로드를 사용하세요.', true);
        } finally { share.disabled = !canShare(file); }
      });
      actions.append(download, share);
      card.append(title, detail, actions);
      list.append(card);
    }
  }
  function open() { render(); if (!$('results').open) $('results').showModal(); }
  window.TrackerFiles = {
    rememberSource(file) { source = file; },
    open
  };
  addEventListener('tracker-export', event => {
    const { name, data } = event.detail;
    const file = new File([data], name.split(/[\\/]/).pop() || 'tracker-result.trz', { type: mime(name) });
    results = [file, ...results].slice(0, 3);
    announce('결과 파일을 만들었습니다. 다운로드하거나 다른 앱에 공유하세요.');
    open();
  });
  $('results-button').addEventListener('click', open);
  $('close-results').addEventListener('click', () => $('results').close());
})();
