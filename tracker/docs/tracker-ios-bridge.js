/* GPL-3.0. Adapter for the upstream SwingJS Tracker API. No physics calculations are changed. */
(function () {
  'use strict';
  const BridgeError = window.Clazz?._Error || window.Error;
  let frame;
  let resizeRequest;
  const fittedPanels = new WeakSet();
  const localizedDialogs = new WeakSet();
  const allowedActions = new Set(['pointMass', 'saveZip']);
  const LENGTH_UNITS = { m: 1, cm: 0.01, mm: 0.001 };
  // Tap modes capture one tap on the video before SwingJS sees it.
  let tapMode = null;
  let swallowGesture = false;
  let calibrationStick = null;
  const markHistory = [];
  let pendingStep = null;
  function pendingMarks() {
    // Forget marks that were deleted, replaced, or whose track was removed.
    for (let i = markHistory.length - 1; i >= 0; i--) {
      const mark = markHistory[i];
      if (mark.track.getStep$I(mark.n) !== mark.step || !mark.panel.getTracks$().contains$O(mark.track)) markHistory.splice(i, 1);
    }
    return markHistory.filter(mark => mark.panel === panel());
  }
  const trackerClass = name => Clazz.load('org.opensourcephysics.cabrillo.tracker.' + name);
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
      const track = p.getSelectedTrack$();
      const n = p.getFrameNumber$();
      const hadStep = !!track?.getStep$I(n);
      const result = original.call(this, p, event);
      const step = track?.getStep$I(n);
      if (p.getMouseAction$() === 1 && !hadStep && step && Clazz.instanceOf(track, trackerClass('PointMass'))) {
        // Tracker does not put new marks on its undo stack; remember them here.
        markHistory.push({ panel: p, track, n, step });
        // After Tracker marks and auto-advances, recentre a zoomed view on the new point.
        const point = step.getPoints$()[0];
        setTimeout(() => { if (p === panel()) { app(); follow(point.getX$(), point.getY$()); } }, 50);
      }
      return result;
    };
  }
  function viewport() {
    const p = panel();
    return p && frame.getMainView$org_opensourcephysics_cabrillo_tracker_TrackerPanel(p)?.scrollPane.getViewport$();
  }
  function imagePoint(event) {
    // Convert a tap to Tracker image coordinates; null outside the visible video.
    const p = panel();
    const node = p?.getUI$()?.domNode;
    const view = viewport()?.getUI$()?.domNode;
    if (!node || !view || !p.getVideo$()) return null;
    const { clientX, clientY } = event.changedTouches?.[0] || event;
    const bounds = view.getBoundingClientRect();
    if (clientX < bounds.left || clientX > bounds.right || clientY < bounds.top || clientY > bounds.bottom) return null;
    const rect = node.getBoundingClientRect();
    app();
    const x = p.pixToX$I(Math.round(clientX - rect.left));
    const y = p.pixToY$I(Math.round(clientY - rect.top));
    if (x < 0 || y < 0 || x > p.getImageWidth$() || y > p.getImageHeight$()) return null;
    return { x, y };
  }
  function captureTap(event) {
    if (event.type === 'pointerdown' && tapMode) {
      const point = imagePoint(event);
      if (!point) return;
      swallowGesture = true;
      event.preventDefault();
      event.stopImmediatePropagation();
      try { tapMode.onTap(point); } catch (error) { notify('tracker-tap-error', error.message); }
      return;
    }
    if (!swallowGesture) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    // The compatibility mouse events and click follow pointerup/touchend.
    if (event.type === 'click') swallowGesture = false;
    else if (/up$|end$|cancel$/.test(event.type)) setTimeout(() => { swallowGesture = false; }, 400);
  }
  function setTapMode(mode) {
    tapMode = mode;
    notify('tracker-tap-mode', mode?.kind || null);
  }
  function calibrationTracks() {
    const result = [];
    const tracks = panel()?.getTracks$();
    for (let i = 0; tracks && i < tracks.size$(); i++) {
      const track = tracks.get$I(i);
      if (Clazz.instanceOf(track, trackerClass('TapeMeasure')) && !track.isReadOnly$()) result.push(track);
    }
    return result;
  }
  function pointMasses() {
    const result = [];
    const tracks = panel()?.getTracks$();
    for (let i = 0; tracks && i < tracks.size$(); i++) {
      const track = tracks.get$I(i);
      if (Clazz.instanceOf(track, trackerClass('PointMass'))) result.push(track);
    }
    return result;
  }
  function follow(x, y) {
    // Keep a marked point centred while zoomed so the next frame stays in view.
    const p = panel();
    const view = viewport();
    if (!p || !view || p.getPreferredSize$().width <= 1) return;
    const TPoint = Clazz.load('org.opensourcephysics.media.core.TPoint');
    const screen = Clazz.new_(TPoint.c$$D$D, [x, y]).getScreenPosition$org_opensourcephysics_media_core_VideoPanel(p);
    const extent = view.getExtentSize$();
    const size = p.getPreferredSize$();
    const left = Math.max(0, Math.min(size.width - extent.width, screen.x - extent.width / 2));
    const top = Math.max(0, Math.min(size.height - extent.height, screen.y - extent.height / 2));
    view.setViewPosition$java_awt_Point(Clazz.new_(Clazz.load('java.awt.Point').c$$I$I, [Math.round(left), Math.round(top)]));
    p.repaint$();
  }
  function column(data, name) {
    for (let i = 0; i < data.getDatasetsRaw$().size$(); i++) {
      const dataset = data.getDataset$I(i);
      if (dataset.getYColumnName$() === name) return Array.from(dataset.getYPoints$());
    }
    return [];
  }
  function dismissKeyboardQuestion(window) {
    // A tablet without a keyboard is the default; the shell provides marking.
    if (!/키보드|Mobile Device/.test(window.getTitle$?.() || '')) return false;
    window.setVisible$Z(false);
    window.dispose$();
    return true;
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
        if (dismissKeyboardQuestion(window)) continue;
        visit(window);
        window.pack$();
        localizedDialogs.add(window);
      }
    }
  }
  // SwingJS creates detached <video> elements and waits only for canplaythrough,
  // which iOS Safari may delay or skip. Configure every engine video when it is
  // created so loading starts inline, failures are reported, and loaded data
  // also counts as ready (the ready handler only reads size and duration).
  const createElement = document.createElement;
  document.createElement = function (tag, options) {
    const element = createElement.call(this, tag, options);
    if (String(tag).toLowerCase() === 'video') {
      element.preload = 'auto';
      element.muted = true;
      element.playsInline = true;
      element.setAttribute('webkit-playsinline', '');
      element.addEventListener('error', () => notify('tracker-media-error',
        '영상을 열지 못했습니다. 이 브라우저가 지원하지 않는 형식일 수 있습니다. H.264 MP4로 변환해 다시 열어 주세요.'));
      let ready = false;
      element.addEventListener('canplaythrough', () => { ready = true; });
      element.addEventListener('loadeddata', () => setTimeout(() => {
        if (!ready && element.readyState >= 2) element.dispatchEvent(new Event('canplaythrough'));
      }, 1500));
    }
    return element;
  };
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
      for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'touchstart', 'touchmove', 'touchend', 'touchcancel', 'mousedown', 'mousemove', 'mouseup', 'click']) {
        addEventListener(type, captureTap, { capture: true, passive: false });
      }
      addEventListener('resize', scheduleFit);
      visualViewport?.addEventListener('resize', scheduleFit);
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
      player.stop$();
      // Quick taps arrive while the previous frame is still seeking; count from
      // the requested step instead of dropping them.
      const current = pendingStep?.player === player && Date.now() - pendingStep.at < 1500 ? pendingStep.target : player.getStepNumber$();
      const last = player.getVideoClip$().getStepCount$() - 1;
      const target = Math.max(0, Math.min(last, current + Math.sign(direction)));
      pendingStep = { player, target, at: Date.now() };
      player.setStepNumber$I(target);
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
      const scale = p ? p.getCoords$().getScaleY$I(Math.max(0, p.getFrameNumber$())) : 1;
      if (pendingStep && (pendingStep.player !== p?.getPlayer$() || pendingStep.target === pendingStep.player.getStepNumber$())) pendingStep = null;
      return {
        view: p?.getMaximizedView$(),
        frame: p?.getVideo$() ? p.getFrameNumber$() : null,
        marking: !!track?.isMarkByDefault$() && Clazz.instanceOf(track, trackerClass('PointMass')),
        hasTrack: !!track && Clazz.instanceOf(track, trackerClass('PointMass')),
        hasVideo: !!p?.getVideo$(),
        hasPoints: pointMasses().some(t => !t.isEmpty$()),
        calibrated: !!p && scale !== 1,
        pixelsPerUnit: scale,
        lengthUnit: p?.getLengthUnit$() || 'm',
        axesVisible: !!p?.getAxes$()?.isVisible$(),
        zoom: p ? p.getMagnification$() : 1,
        canRemoveMark: !!p && pendingMarks().length > 0,
        tapMode: tapMode?.kind || null
      };
    },
    startCalibration() {
      const p = panel();
      if (!p?.getVideo$()) throw new BridgeError('먼저 영상을 열어 주세요.');
      this.cancelTap();
      // Replace earlier calibration sticks so only one scale source remains.
      for (const old of calibrationTracks()) old.delete$();
      const stick = Clazz.new_(trackerClass('TapeMeasure').c$);
      stick.setColor$java_awt_Color(Clazz.load('java.awt.Color').BLUE);
      stick.setStickMode$Z(true);
      stick.setCalibrator$Double(null);
      stick.setName$S('보정 막대');
      p.addTrack$org_opensourcephysics_cabrillo_tracker_TTrack(stick);
      p.setSelectedTrack$org_opensourcephysics_cabrillo_tracker_TTrack(stick);
      calibrationStick = stick;
      const ends = [];
      setTapMode({
        kind: 'calibrate',
        onTap: point => {
          app();
          if (ends.length === 1 && Math.hypot(point.x - ends[0].x, point.y - ends[0].y) < 10) {
            throw new BridgeError('두 끝이 너무 가깝습니다. 길이를 아는 물체의 반대쪽 끝을 터치하세요.');
          }
          ends.push(point);
          const n = Math.max(0, p.getFrameNumber$());
          // The same createStep path Tracker uses for two marking clicks.
          stick.createStep$I$D$D(n, point.x, point.y);
          p.setSelectedPoint$org_opensourcephysics_media_core_TPoint(null);
          p.repaint$();
          if (ends.length === 2) setTapMode(null);
          notify('tracker-calibration', { stage: ends.length });
        }
      });
    },
    setCalibrationLength(value, unit = 'm') {
      const p = panel();
      const stick = calibrationStick;
      const metres = Number(value) * (LENGTH_UNITS[unit] || NaN);
      if (!(metres > 0) || !Number.isFinite(metres)) throw new BridgeError('0보다 큰 길이를 입력하세요.');
      const step = stick?.getStep$I(Math.max(0, p.getFrameNumber$())) || stick?.getStep$I(0);
      if (!step || step.getTapeLength$Z(true) <= 0) throw new BridgeError('먼저 보정할 물체의 양 끝을 터치하세요.');
      app();
      p.setLengthUnit$S$Z('m', true);
      step.setTapeLength$D(metres);
      p.repaint$();
      return p.getCoords$().getScaleY$I(Math.max(0, p.getFrameNumber$()));
    },
    startOrigin() {
      const p = panel();
      if (!p?.getVideo$()) throw new BridgeError('먼저 영상을 열어 주세요.');
      this.cancelTap();
      p.getAxes$().setVisible$Z(true);
      p.repaint$();
      setTapMode({
        kind: 'origin',
        onTap: point => {
          app();
          p.getCoords$().setOriginXY$I$D$D(Math.max(0, p.getFrameNumber$()), point.x, point.y);
          p.getAxes$().setVisible$Z(true);
          p.repaint$();
          setTapMode(null);
          notify('tracker-origin', point);
        }
      });
    },
    cancelTap() {
      if (tapMode?.kind === 'calibrate' && calibrationStick && !(calibrationStick.getStep$I(0)?.getTapeLength$Z(true) > 0)) {
        app();
        calibrationStick.delete$();
        calibrationStick = null;
      }
      setTapMode(null);
    },
    toggleAxes() {
      const p = panel();
      if (!p) return false;
      const axes = p.getAxes$();
      axes.setVisible$Z(!axes.isVisible$());
      p.repaint$();
      return axes.isVisible$();
    },
    zoom(direction) {
      const p = panel();
      if (!p?.getVideo$()) throw new BridgeError('먼저 영상을 열어 주세요.');
      const view = viewport();
      const extent = view.getExtentSize$();
      const fit = Math.min(extent.width / p.getImageWidth$(), extent.height / p.getImageHeight$());
      const next = direction === 'fit' ? -1 : p.getMagnification$() * (direction > 0 ? 1.5 : 1 / 1.5);
      p.setMagnification$D(next < 0 || next <= fit * 1.05 ? -1 : Math.min(next, 8));
      const point = p.getSelectedPoint$();
      if (point) follow(point.getX$(), point.getY$());
      return p.getMagnification$();
    },
    removeLastMark() {
      // Only marks are removed, so a mistaken tap never reverts calibration.
      const mark = pendingMarks().pop();
      if (!mark) throw new BridgeError('지울 점이 없습니다.');
      markHistory.splice(markHistory.indexOf(mark), 1);
      app();
      mark.track.deleteStep$I(mark.n);
      mark.panel.getPlayer$().setStepNumber$I(mark.panel.getPlayer$().getVideoClip$().frameToStep$I(mark.n));
      mark.panel.repaint$();
      return mark.n;
    },
    analysis(trackName) {
      // Read Tracker's own data table; the shell only presents and fits it.
      const p = panel();
      const tracks = pointMasses();
      const selected = p?.getSelectedTrack$();
      const track = tracks.find(t => t.getName$() === trackName)
        || (tracks.includes(selected) ? selected : tracks.find(t => !t.isEmpty$()) || tracks[0]);
      if (!track) return { tracks: [], rows: [] };
      const data = track.getData$org_opensourcephysics_cabrillo_tracker_TrackerPanel(p);
      const first = data.getDatasetsRaw$().size$() ? data.getDataset$I(0) : null;
      const t = first ? Array.from(first.getXPoints$()) : [];
      const cols = Object.fromEntries(['x', 'y', 'v_{x}', 'v_{y}', 'a_{x}', 'a_{y}', 'frame'].map(name => [name, column(data, name)]));
      const finite = v => (Number.isFinite(v) ? v : null);
      return {
        name: track.getName$(),
        tracks: tracks.map(item => item.getName$()),
        lengthUnit: p.getLengthUnit$() || 'm',
        calibrated: p.getCoords$().getScaleY$I(0) !== 1,
        rows: t.map((time, i) => ({
          frame: finite(cols.frame[i]), t: finite(time), x: finite(cols.x[i]), y: finite(cols.y[i]),
          vx: finite(cols['v_{x}'][i]), vy: finite(cols['v_{y}'][i]), ax: finite(cols['a_{x}'][i]), ay: finite(cols['a_{y}'][i])
        })).filter(row => row.t !== null && row.x !== null && row.y !== null)
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
    loadExample(name = 'projectile.mp4') {
      if (!['projectile.mp4', 'BallDrop.mp4'].includes(name)) throw new BridgeError('알 수 없는 예제입니다.');
      // A video imports into the current analysis; it does not discard existing tabs.
      app().loadExperimentURL(new URL('examples/' + name, location.href).href);
    }
  };
})();
