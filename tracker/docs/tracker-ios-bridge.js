/* GPL-3.0. Adapter for the upstream SwingJS Tracker API. No physics calculations are changed. */
(function () {
  'use strict';
  const BridgeError = window.Clazz?._Error || window.Error;
  let frame;
  let resizeRequest;
  const fittedPanels = new WeakSet();
  const localizedDialogs = new WeakSet();
  const allowedActions = new Set(['pointMass', 'tape', 'saveZip']);
  function app() {
    window.Tracker._setThread(); // getApp() returns JSDummyApplet in this upstream build.
    return window.Tracker.app;
  }
  function panel() { if (frame) app(); return frame?.getSelectedPanel$(); }
  function notify(type, detail) {
    // This adapter is only embedded by our same-origin mobile page.
    if (parent !== window && parent.location.origin === location.origin) {
      parent.dispatchEvent(new CustomEvent(type, { detail }));
    }
  }
  function fit() {
    if (!frame) return;
    app();
    frame.setBounds$I$I$I$I(2, 2, Math.max(1, innerWidth - 4), Math.max(1, innerHeight - 4));
    frame.validate$();
    frame.repaint$();
  }
  function scheduleFit() {
    cancelAnimationFrame(resizeRequest);
    resizeRequest = requestAnimationFrame(fit);
  }
  function installVideoDimensions() {
    // JSMovieVideo announces readiness while frameNumber is still -1. The
    // inherited size getters read scale[-1], producing NaN for the new origin.
    // Use the first frame's scale until the initial image has been selected.
    const video = Clazz.load('org.opensourcephysics.media.mov.JSMovieVideo').prototype;
    for (const [method, dimension, scale] of [
      ['getWidth$', 'width', 'getScaleX$I'],
      ['getHeight$', 'height', 'getScaleY$I']
    ]) {
      const original = video[method];
      video[method] = function () {
        return this.frameNumber < 0 ? this.size[dimension] / this.coords[scale](0) : original.call(this);
      };
    }
  }
  function installTouchMarking() {
    // This distributed core predates the upstream Java fix for presses without
    // hover. Refresh the same state that TMouseHandler normally sets on move.
    const handler = Clazz.load('org.opensourcephysics.cabrillo.tracker.TMouseHandler').prototype;
    const method = 'handleMouseAction$org_opensourcephysics_display_InteractivePanel$java_awt_event_MouseEvent';
    const original = handler[method];
    handler[method] = function (p, event) {
      if (p.getMouseAction$() === 1 && p.isDrawingInImageSpace$() && !p.getZoomBox$().isVisible$()) {
        this.selectedTrack = p.getSelectedTrack$();
        this.frameNumber = p.getFrameNumber$();
        const marking = p.setCursorForMarking$Z$java_awt_event_InputEvent(event.isShiftDown$(), event);
        this.selectedTrack?.setMarking$Z(marking);
      }
      return original.call(this, p, event);
    };
  }
  function localizeDialogButtons() {
    const labels = { yes: '예', no: '아니요', cancel: '취소', ok: '확인', 'save as...': '다른 이름으로 저장...', 'tabs:': '탭:', 'metadata:': '메타데이터:', 'support files:': '추가 파일:', 'advanced:': '고급:', none: '없음', 'copy originals': '원본 복사' };
    const defaults = Clazz.load('javax.swing.UIManager');
    for (const key of ['yes', 'no', 'cancel', 'ok']) defaults.put$O$O(`OptionPane.${key}ButtonText`, labels[key]);
    const labelClass = Clazz.load('javax.swing.JLabel');
    const buttonClass = Clazz.load('javax.swing.AbstractButton');
    // The initial keyboard question is constructed before readyFunction runs.
    const visit = component => {
      // Leave editable values, including project names, untouched.
      if (Clazz.instanceOf(component, labelClass) || Clazz.instanceOf(component, buttonClass)) {
        const text = component.getText$?.();
        if (text && labels[text.toLowerCase()]) component.setText$S(labels[text.toLowerCase()]);
      }
      for (const child of component.getComponents$?.() || []) visit(child);
    };
    for (const window of Clazz.load('java.awt.Window').getWindows$()) {
      if (window !== frame && window.isVisible$() && !localizedDialogs.has(window)) {
        visit(window);
        window.pack$();
        localizedDialogs.add(window);
      }
    }
  }
  window.TrackerIOS = {
    ready: false,
    initialize() {
      frame = app()?.getMainFrame();
      if (!frame) throw new BridgeError('Tracker main frame is unavailable');
      installVideoDimensions();
      installTouchMarking();
      localizeDialogButtons();
      // Archive export temporarily replaces _localFileSaveFunction, so adapt the
      // public save entry point. Preserve all writes to SwingJS's virtual disk.
      const originalSave = J2S._saveFile;
      J2S.saveFile = J2S._saveFile = function (name, data, mimetype, encoding) {
        if (name.startsWith(J2S.getGlobal('j2s.tmpdir'))) return originalSave.call(this, name, data, mimetype, encoding);
        notify('tracker-export', { name, data: typeof data === 'string' ? data : new Uint8Array(data) });
        return 'OK';
      };
      this.ready = true;
      addEventListener('resize', scheduleFit);
      visualViewport?.addEventListener('resize', scheduleFit);
      const configureVideo = video => {
        video.setAttribute('playsinline', '');
        video.setAttribute('webkit-playsinline', '');
        video.addEventListener('error', () => notify('tracker-media-error',
          '영상을 재생하지 못했습니다. H.264 MP4로 변환하거나 이미지 시퀀스를 사용해 주세요.'));
      };
      new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(node => {
        if (node.nodeType !== 1) return;
        if (node.tagName === 'VIDEO') configureVideo(node);
        node.querySelectorAll('video').forEach(configureVideo);
      }))).observe(document.body, { childList: true, subtree: true });
      document.querySelectorAll('video').forEach(configureVideo);
      fit();
      notify('tracker-ready');
    },
    fit,
    view(index) {
      if (![0, 1, 4].includes(index)) throw new BridgeError('지원하지 않는 분석 화면입니다.');
      const p = panel();
      if (!p) return;
      frame.maximizeView$org_opensourcephysics_cabrillo_tracker_TrackerPanel$I(p, index);
      fittedPanels.add(p);
    },
    action(name) {
      if (!allowedActions.has(name)) throw new BridgeError('Unsupported Tracker action');
      const action = panel()?.getActions$().get$O(name);
      if (!action) throw new BridgeError('Tracker action is unavailable');
      action.actionPerformed$java_awt_event_ActionEvent(null);
      // Tracker creates tracks asynchronously and enables marking by default on touch devices.
    },
    step(direction) {
      const player = panel()?.getPlayer$();
      if (!player || !panel().getVideo$()) throw new BridgeError('먼저 영상을 열어 주세요.');
      if (player.isEnabled$()) {
        player.stop$();
        if (direction < 0) player.back$(); else player.step$();
      }
    },
    setMarking(enabled) {
      const p = panel();
      const track = p?.getSelectedTrack$();
      if (!track) throw new BridgeError('먼저 질점을 추가하거나 트랙을 선택하세요.');
      track.setMarkByDefault$Z(enabled);
      p.setCursorForMarking$Z$java_awt_event_InputEvent(false, null);
      p.repaint$();
    },
    state() {
      const p = panel();
      localizeDialogButtons();
      if (p?.getVideo$() && !fittedPanels.has(p)) this.view(4);
      const track = p?.getSelectedTrack$();
      return {
        view: p?.getMaximizedView$(),
        frame: p?.getVideo$() ? p.getFrameNumber$() : null,
        marking: !!track?.isMarkByDefault$(),
        hasTrack: !!track,
        hasVideo: !!p?.getVideo$()
      };
    },
    async importFile(file) {
      if (!file || !file.size) throw new BridgeError('비어 있는 파일은 열 수 없습니다.');
      if (file.size > 200 * 1024 * 1024) throw new BridgeError('태블릿 메모리 사용을 줄이려면 200MB 이하의 짧은 영상으로 잘라 주세요.');
      const bytes = await file.arrayBuffer();
      app(); // The file read crossed an asynchronous boundary.
      // Use the same virtual file storage as SwingJS's native file chooser.
      const path = J2S.getGlobal('j2s.tmpdir') + 'OPEN/' + Date.now() + '/' + file.name.replace(/[\\/]/g, '_');
      const javaFile = Clazz.new_(Clazz.load('java.io.File').c$$S, [path]);
      swingjs.JSUtil.setFileBytesStatic$O$O(javaFile, J2S._toBytes(bytes));
      const paths = Clazz.new_(Clazz.load('java.util.ArrayList'));
      paths.add$O(javaFile.getAbsolutePath$());
      const io = Clazz.load('org.opensourcephysics.cabrillo.tracker.TrackerIO');
      io.openFiles$org_opensourcephysics_cabrillo_tracker_TFrame$java_util_List$Runnable(frame, paths, null);
    },
    loadExample() {
      // A video imports into the current analysis; it does not discard existing tabs.
      app().loadExperimentURL(new URL('examples/projectile.mp4', location.href).href);
    }
  };
})();
