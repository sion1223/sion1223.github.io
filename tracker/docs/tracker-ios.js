/* GPL-3.0. iPhone/iPad shell for the upstream Tracker analysis engine. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const engine = $('tracker-engine');
  let ready = false;
  let importing = false;
  const bridge = () => engine.contentWindow.TrackerIOS;
  function status(message, error = false) {
    $('status').textContent = message;
    $('status').dataset.error = String(error);
  }
  function run(action) {
    try { action(bridge()); } catch (error) { status(error.message || '작업을 완료하지 못했습니다.', true); }
  }
  function updateState() {
    if (!ready || document.hidden) return;
    run(api => {
      const state = api.state();
      if ([0, 1, 4].includes(state.view)) $('view-select').value = String(state.view);
      $('frame-number').value = state.frame === null ? '—' : String(state.frame).padStart(3, '0');
      $('mark-button').setAttribute('aria-pressed', String(state.marking));
      $('mark-button').disabled = !state.hasTrack;
      $('previous-button').disabled = $('next-button').disabled = !state.hasVideo;
    });
  }
  function onReady() {
    if (!bridge()?.ready || ready) return;
    ready = true;
    clearTimeout(loadTimeout);
    $('loading').hidden = true;
    $('workspace').setAttribute('aria-busy', 'false');
    document.querySelectorAll('[data-engine]').forEach(button => { button.disabled = false; });
    status('영상·파일을 열어 시작하세요. 키보드 연결 안내는 미연결 시 아니요를 선택하세요.');
    updateState();
  }
  const loadTimeout = setTimeout(() => {
    if (ready) return;
    $('loading-message').textContent = '불러오기가 지연되고 있습니다. 인터넷 연결을 확인하거나 다시 시도하세요.';
    $('retry-button').hidden = false;
  }, 45000);
  addEventListener('tracker-ready', onReady);
  addEventListener('tracker-media-error', event => status(event.detail, true));
  engine.addEventListener('load', onReady);
  $('retry-button').addEventListener('click', () => location.reload());
  $('view-select').addEventListener('change', event => run(api => api.view(Number(event.target.value))));
  $('help-button').addEventListener('click', () => $('help').showModal());
  $('close-help').addEventListener('click', () => $('help').close());
  $('open-button').addEventListener('click', () => { if (!importing) $('import-dialog').showModal(); });
  $('close-import').addEventListener('click', () => $('import-dialog').close());
  $('device-open-button').addEventListener('click', () => { $('import-dialog').close(); $('file-input').click(); });
  $('drive-open-button').addEventListener('click', () => {
    if (importing) return;
    $('import-dialog').close();
    status('파일 선택기의 둘러보기 또는 왼쪽 메뉴에서 Google Drive를 선택하세요.');
    $('file-input').click();
  });
  $('file-input').addEventListener('change', async event => {
    const file = event.target.files[0];
    if (!file) return;
    importing = true;
    $('open-button').disabled = true;
    status('파일을 읽고 있습니다: ' + file.name);
    try {
      await bridge().importFile(file);
      window.TrackerFiles.rememberSource(file);
      status('Tracker에 파일을 전달했습니다. 영상 로딩이 끝나면 길이를 보정하세요.');
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
      api.action(button.dataset.action);
      const messages = { tape: '보정 막대의 양 끝을 맞추고 실제 길이를 입력하세요.', pointMass: '영상 속 물체를 터치해 위치를 기록하세요.', saveZip: 'Tracker 저장 창에서 프로젝트 이름과 포함할 영상을 확인하세요.' };
      status(messages[button.dataset.action]);
      updateState();
    });
  }));
  $('previous-button').addEventListener('click', () => run(api => { api.step(-1); updateState(); }));
  $('next-button').addEventListener('click', () => run(api => { api.step(1); updateState(); }));
  $('mark-button').addEventListener('click', () => run(api => {
    const enabled = !api.state().marking;
    api.setMarking(enabled);
    status(enabled ? '점을 찍을 물체를 터치하세요. 기존 점은 끌어서 수정합니다.' : '점 찍기를 껐습니다. 도구 선택과 이동을 할 수 있습니다.');
    updateState();
  }));
  $('example-button').addEventListener('click', () => run(api => {
    api.loadExample();
    $('help').close();
    status('예제 영상을 불러옵니다. 영상 크기를 기준으로 길이를 보정해 보세요.');
  }));
  // Keep the readout in sync with Tracker's own playback/auto-advance controls.
  setInterval(updateState, 350);
})();
