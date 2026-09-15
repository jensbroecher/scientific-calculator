/**
 * Graphing calculator mode — Y= editor, canvas plot, zoom/pan, trace.
 */
(function (global) {
  "use strict";

  const STORAGE_KEY = "sci-calc-graph";
  const COLORS = ["#58a6ff", "#3fb950", "#f778ba", "#d29922"];
  const DEFAULT_FUNCS = [
    { expr: "sin(x)", enabled: true, color: COLORS[0] },
    { expr: "x^2", enabled: true, color: COLORS[1] },
    { expr: "", enabled: false, color: COLORS[2] },
    { expr: "", enabled: false, color: COLORS[3] },
  ];
  const STD_WINDOW = { xmin: -10, xmax: 10, ymin: -10, ymax: 10 };

  function createGraphController(opts) {
    const {
      getAngleMode,
      root, // #graph-mode root
    } = opts;

    const state = {
      funcs: DEFAULT_FUNCS.map((f) => ({ ...f })),
      window: { ...STD_WINDOW },
      trace: {
        on: false,
        fnIndex: 0,
        t: 0.5, // 0..1 across x window
      },
      pan: null,
      dirty: true,
    };

    const el = {
      root,
      yList: root.querySelector("#y-list"),
      canvas: root.querySelector("#graph-canvas"),
      windowLabel: root.querySelector("#window-label"),
      angleNote: root.querySelector("#graph-angle-note"),
      btnZoomIn: root.querySelector("#zoom-in"),
      btnZoomOut: root.querySelector("#zoom-out"),
      btnZoomStd: root.querySelector("#zoom-std"),
      btnTrace: root.querySelector("#trace-toggle"),
      traceReadout: root.querySelector("#trace-readout"),
      plotWrap: root.querySelector(".graph-plot-wrap"),
    };

    const ctx = el.canvas.getContext("2d");

    function load() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        const data = JSON.parse(raw);
        if (data.funcs && Array.isArray(data.funcs) && data.funcs.length === 4) {
          state.funcs = data.funcs.map((f, i) => ({
            expr: typeof f.expr === "string" ? f.expr : DEFAULT_FUNCS[i].expr,
            enabled: !!f.enabled,
            color: COLORS[i],
          }));
        }
        if (data.window && Number.isFinite(data.window.xmin)) {
          state.window = {
            xmin: data.window.xmin,
            xmax: data.window.xmax,
            ymin: data.window.ymin,
            ymax: data.window.ymax,
          };
        }
        if (data.trace) {
          state.trace.on = !!data.trace.on;
          state.trace.fnIndex = Math.min(3, Math.max(0, data.trace.fnIndex | 0));
          state.trace.t = Math.min(1, Math.max(0, Number(data.trace.t) || 0.5));
        }
      } catch (_) {
        /* ignore */
      }
    }

    function save() {
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            funcs: state.funcs.map(({ expr, enabled }) => ({ expr, enabled })),
            window: state.window,
            trace: {
              on: state.trace.on,
              fnIndex: state.trace.fnIndex,
              t: state.trace.t,
            },
          })
        );
      } catch (_) {
        /* ignore */
      }
    }

    function renderYEditor() {
      el.yList.innerHTML = "";
      state.funcs.forEach((fn, i) => {
        const row = document.createElement("div");
        row.className = "y-row" + (fn.enabled ? " is-enabled" : "");
        row.dataset.index = String(i);

        const toggle = document.createElement("button");
        toggle.type = "button";
        toggle.className = "y-toggle";
        toggle.setAttribute("aria-label", `Toggle Y${i + 1}`);
        toggle.setAttribute("aria-pressed", fn.enabled ? "true" : "false");
        toggle.innerHTML = `<span class="y-swatch" style="background:${fn.color}"></span>`;
        toggle.addEventListener("click", () => {
          state.funcs[i].enabled = !state.funcs[i].enabled;
          save();
          renderYEditor();
          scheduleDraw();
        });

        const label = document.createElement("label");
        label.className = "y-label";
        label.htmlFor = `y-input-${i}`;
        label.textContent = `Y${i + 1}=`;
        label.style.color = fn.color;

        const input = document.createElement("input");
        input.type = "text";
        input.id = `y-input-${i}`;
        input.className = "y-input";
        input.value = fn.expr;
        input.placeholder = i === 0 ? "sin(x)" : i === 1 ? "x^2" : "expression in x";
        input.spellcheck = false;
        input.autocomplete = "off";
        input.autocapitalize = "off";
        input.addEventListener("input", () => {
          state.funcs[i].expr = input.value;
          // Auto-enable when user types
          if (input.value.trim() && !state.funcs[i].enabled) {
            state.funcs[i].enabled = true;
            toggle.setAttribute("aria-pressed", "true");
            row.classList.add("is-enabled");
          }
          save();
          scheduleDraw();
        });
        input.addEventListener("change", () => {
          state.funcs[i].expr = input.value.trim();
          input.value = state.funcs[i].expr;
          save();
          scheduleDraw();
        });
        input.addEventListener("focus", () => {
          if (state.trace.on) {
            state.trace.fnIndex = i;
            updateTraceUI();
            scheduleDraw();
          }
        });

        row.appendChild(toggle);
        row.appendChild(label);
        row.appendChild(input);
        el.yList.appendChild(row);
      });
    }

    function updateWindowLabel() {
      const w = state.window;
      const fmt = (n) => {
        const a = Math.abs(n);
        if (a !== 0 && (a < 0.01 || a >= 1000)) return n.toPrecision(3);
        return String(Number(n.toPrecision(4)));
      };
      el.windowLabel.textContent = `X:[${fmt(w.xmin)}, ${fmt(w.xmax)}]  Y:[${fmt(w.ymin)}, ${fmt(w.ymax)}]`;
    }

    function updateAngleNote() {
      const mode = getAngleMode();
      el.angleNote.textContent = `Trig: ${mode}`;
    }

    function updateTraceUI() {
      el.btnTrace.classList.toggle("is-active", state.trace.on);
      el.btnTrace.setAttribute("aria-pressed", state.trace.on ? "true" : "false");
      if (!state.trace.on) {
        el.traceReadout.hidden = true;
        el.traceReadout.textContent = "";
        return;
      }
      const info = evaluateTrace();
      el.traceReadout.hidden = false;
      if (!info) {
        el.traceReadout.textContent = "Trace: select an enabled Yi";
        return;
      }
      const yStr = info.y == null ? "—" : CalcMath.formatNumber(info.y);
      el.traceReadout.innerHTML =
        `<span style="color:${info.color}">Y${info.index + 1}</span> ` +
        `x=${CalcMath.formatNumber(info.x)}  y=${yStr}`;
    }

    function xFromT(t) {
      const w = state.window;
      return w.xmin + t * (w.xmax - w.xmin);
    }

    function evaluateTrace() {
      // Prefer selected; else first enabled
      let idx = state.trace.fnIndex;
      if (!state.funcs[idx] || !state.funcs[idx].enabled || !state.funcs[idx].expr.trim()) {
        idx = state.funcs.findIndex((f) => f.enabled && f.expr.trim());
        if (idx < 0) return null;
        state.trace.fnIndex = idx;
      }
      const fn = state.funcs[idx];
      const x = xFromT(state.trace.t);
      let y = null;
      try {
        y = CalcMath.evaluateAt(fn.expr, x, { angleMode: getAngleMode(), ans: 0 });
        if (!Number.isFinite(y)) y = null;
      } catch (_) {
        y = null;
      }
      return { index: idx, color: fn.color, x, y };
    }

    function resizeCanvas() {
      const wrap = el.plotWrap;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cssW = wrap.clientWidth;
      const cssH = wrap.clientHeight;
      if (cssW < 2 || cssH < 2) return false;
      el.canvas.width = Math.floor(cssW * dpr);
      el.canvas.height = Math.floor(cssH * dpr);
      el.canvas.style.width = cssW + "px";
      el.canvas.style.height = cssH + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return true;
    }

    function mapX(x) {
      const w = state.window;
      const W = el.canvas.clientWidth;
      return ((x - w.xmin) / (w.xmax - w.xmin)) * W;
    }

    function mapY(y) {
      const w = state.window;
      const H = el.canvas.clientHeight;
      return ((w.ymax - y) / (w.ymax - w.ymin)) * H;
    }

    function unmapX(px) {
      const w = state.window;
      const W = el.canvas.clientWidth;
      return w.xmin + (px / W) * (w.xmax - w.xmin);
    }

    function unmapY(py) {
      const w = state.window;
      const H = el.canvas.clientHeight;
      return w.ymax - (py / H) * (w.ymax - w.ymin);
    }

    function drawGridAndAxes(W, H) {
      const w = state.window;
      ctx.save();

      // Light grid
      ctx.strokeStyle = "rgba(48, 54, 61, 0.85)";
      ctx.lineWidth = 1;
      const xSpan = w.xmax - w.xmin;
      const ySpan = w.ymax - w.ymin;
      const xStep = niceStep(xSpan);
      const yStep = niceStep(ySpan);

      const xStart = Math.ceil(w.xmin / xStep) * xStep;
      for (let x = xStart; x <= w.xmax + 1e-12; x += xStep) {
        const px = mapX(x);
        ctx.beginPath();
        ctx.moveTo(px, 0);
        ctx.lineTo(px, H);
        ctx.stroke();
      }
      const yStart = Math.ceil(w.ymin / yStep) * yStep;
      for (let y = yStart; y <= w.ymax + 1e-12; y += yStep) {
        const py = mapY(y);
        ctx.beginPath();
        ctx.moveTo(0, py);
        ctx.lineTo(W, py);
        ctx.stroke();
      }

      // Axes
      ctx.strokeStyle = "rgba(139, 148, 158, 0.95)";
      ctx.lineWidth = 1.5;
      if (w.xmin <= 0 && w.xmax >= 0) {
        const zx = mapX(0);
        ctx.beginPath();
        ctx.moveTo(zx, 0);
        ctx.lineTo(zx, H);
        ctx.stroke();
      }
      if (w.ymin <= 0 && w.ymax >= 0) {
        const zy = mapY(0);
        ctx.beginPath();
        ctx.moveTo(0, zy);
        ctx.lineTo(W, zy);
        ctx.stroke();
      }

      // Tick labels
      ctx.fillStyle = "rgba(139, 148, 158, 0.95)";
      ctx.font = "10px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      const labelY = w.ymin <= 0 && w.ymax >= 0 ? mapY(0) + 3 : H - 12;
      for (let x = xStart; x <= w.xmax + 1e-12; x += xStep) {
        if (Math.abs(x) < xStep * 1e-9) continue;
        const px = mapX(x);
        if (px < 12 || px > W - 12) continue;
        ctx.fillText(formatTick(x), px, Math.min(H - 12, Math.max(2, labelY)));
      }
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      const labelX = w.xmin <= 0 && w.xmax >= 0 ? mapX(0) + 4 : 4;
      for (let y = yStart; y <= w.ymax + 1e-12; y += yStep) {
        if (Math.abs(y) < yStep * 1e-9) continue;
        const py = mapY(y);
        if (py < 10 || py > H - 10) continue;
        ctx.fillText(formatTick(y), Math.min(W - 36, Math.max(2, labelX)), py);
      }

      ctx.restore();
    }

    function niceStep(span) {
      const raw = span / 8;
      const pow = Math.pow(10, Math.floor(Math.log10(Math.abs(raw) || 1)));
      const n = raw / pow;
      let nice;
      if (n < 1.5) nice = 1;
      else if (n < 3.5) nice = 2;
      else if (n < 7.5) nice = 5;
      else nice = 10;
      return nice * pow;
    }

    function formatTick(n) {
      const a = Math.abs(n);
      if (a !== 0 && (a < 0.001 || a >= 10000)) return n.toExponential(0);
      const s = Number(n.toPrecision(4));
      return String(s);
    }

    function sampleFunction(expr, W) {
      const w = state.window;
      const samples = Math.max(200, Math.min(800, Math.floor(W * 2)));
      const points = [];
      const angleMode = getAngleMode();
      const ySpan = w.ymax - w.ymin;
      const jumpThreshold = ySpan * 2.5; // skip asymptote spikes

      for (let i = 0; i <= samples; i++) {
        const t = i / samples;
        const x = w.xmin + t * (w.xmax - w.xmin);
        let y = null;
        try {
          const v = CalcMath.evaluateAt(expr, x, { angleMode, ans: 0 });
          if (Number.isFinite(v)) y = v;
        } catch (_) {
          y = null;
        }
        points.push({ x, y });
      }

      // Mark breaks on large jumps
      const segments = [];
      let current = [];
      for (let i = 0; i < points.length; i++) {
        const p = points[i];
        if (p.y == null) {
          if (current.length) {
            segments.push(current);
            current = [];
          }
          continue;
        }
        if (current.length) {
          const prev = current[current.length - 1];
          if (Math.abs(p.y - prev.y) > jumpThreshold) {
            segments.push(current);
            current = [];
          }
        }
        current.push(p);
      }
      if (current.length) segments.push(current);
      return segments;
    }

    function drawCurves(W) {
      state.funcs.forEach((fn) => {
        if (!fn.enabled || !fn.expr.trim()) return;
        const segments = sampleFunction(fn.expr.trim(), W);
        ctx.strokeStyle = fn.color;
        ctx.lineWidth = 2;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        segments.forEach((seg) => {
          if (seg.length < 2) {
            if (seg.length === 1) {
              const p = seg[0];
              const px = mapX(p.x);
              const py = mapY(p.y);
              if (py >= -2 && py <= el.canvas.clientHeight + 2) {
                ctx.beginPath();
                ctx.arc(px, py, 1.5, 0, Math.PI * 2);
                ctx.fillStyle = fn.color;
                ctx.fill();
              }
            }
            return;
          }
          ctx.beginPath();
          let started = false;
          for (const p of seg) {
            const px = mapX(p.x);
            const py = mapY(p.y);
            // Allow slight overdraw; skip extreme off-screen to avoid GPU issues
            if (!Number.isFinite(py) || Math.abs(py) > 1e6) {
              started = false;
              continue;
            }
            if (!started) {
              ctx.moveTo(px, py);
              started = true;
            } else {
              ctx.lineTo(px, py);
            }
          }
          if (started) ctx.stroke();
        });
      });
    }

    function drawTraceCursor() {
      if (!state.trace.on) return;
      const info = evaluateTrace();
      if (!info || info.y == null) return;
      const px = mapX(info.x);
      const py = mapY(info.y);
      const H = el.canvas.clientHeight;
      const W = el.canvas.clientWidth;
      if (py < -20 || py > H + 20) return;

      ctx.save();
      ctx.strokeStyle = "rgba(230, 237, 243, 0.35)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, H);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, py);
      ctx.lineTo(W, py);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = info.color;
      ctx.strokeStyle = "#0d1117";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px, py, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    function draw() {
      if (!el.root || el.root.hidden) return;
      if (!resizeCanvas()) return;
      const W = el.canvas.clientWidth;
      const H = el.canvas.clientHeight;

      ctx.clearRect(0, 0, W, H);
      // Background
      ctx.fillStyle = "#0a0e14";
      ctx.fillRect(0, 0, W, H);

      drawGridAndAxes(W, H);
      drawCurves(W);
      drawTraceCursor();

      updateWindowLabel();
      updateAngleNote();
      updateTraceUI();
      state.dirty = false;
    }

    let raf = 0;
    function scheduleDraw() {
      state.dirty = true;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        draw();
      });
    }

    function zoom(factor, centerX, centerY) {
      const w = state.window;
      const cx = centerX != null ? centerX : (w.xmin + w.xmax) / 2;
      const cy = centerY != null ? centerY : (w.ymin + w.ymax) / 2;
      const nx = (w.xmax - w.xmin) * factor;
      const ny = (w.ymax - w.ymin) * factor;
      // Clamp insane zooms
      if (nx < 1e-8 || ny < 1e-8 || nx > 1e8 || ny > 1e8) return;
      w.xmin = cx - nx / 2;
      w.xmax = cx + nx / 2;
      w.ymin = cy - ny / 2;
      w.ymax = cy + ny / 2;
      save();
      scheduleDraw();
    }

    function zoomStandard() {
      state.window = { ...STD_WINDOW };
      save();
      scheduleDraw();
    }

    function panByPixels(dx, dy) {
      const w = state.window;
      const W = el.canvas.clientWidth;
      const H = el.canvas.clientHeight;
      const dxu = (-dx / W) * (w.xmax - w.xmin);
      const dyu = (dy / H) * (w.ymax - w.ymin);
      w.xmin += dxu;
      w.xmax += dxu;
      w.ymin += dyu;
      w.ymax += dyu;
      save();
      scheduleDraw();
    }

    // —— Pointer: pan / tap-to-trace ——
    function getLocalPos(e) {
      const rect = el.canvas.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      return { x: clientX - rect.left, y: clientY - rect.top };
    }

    function onPointerDown(e) {
      if (e.touches && e.touches.length > 1) return;
      const pos = getLocalPos(e);
      state.pan = {
        startX: pos.x,
        startY: pos.y,
        lastX: pos.x,
        lastY: pos.y,
        moved: false,
        pointerId: e.pointerId,
      };
      if (e.pointerId != null && el.canvas.setPointerCapture) {
        try {
          el.canvas.setPointerCapture(e.pointerId);
        } catch (_) {}
      }
      e.preventDefault();
    }

    function onPointerMove(e) {
      if (!state.pan) return;
      const pos = getLocalPos(e);
      const dx = pos.x - state.pan.lastX;
      const dy = pos.y - state.pan.lastY;
      if (Math.abs(pos.x - state.pan.startX) + Math.abs(pos.y - state.pan.startY) > 6) {
        state.pan.moved = true;
      }
      if (state.pan.moved) {
        if (state.trace.on) {
          // In trace mode, horizontal drag moves trace cursor
          const W = el.canvas.clientWidth;
          state.trace.t = Math.min(1, Math.max(0, pos.x / W));
          // Snap to nearest enabled curve vertically optional — keep fnIndex
          save();
          scheduleDraw();
        } else {
          panByPixels(dx, dy);
        }
      }
      state.pan.lastX = pos.x;
      state.pan.lastY = pos.y;
      e.preventDefault();
    }

    function onPointerUp(e) {
      if (!state.pan) return;
      const wasTap = !state.pan.moved;
      const pos = { x: state.pan.lastX, y: state.pan.lastY };
      state.pan = null;
      if (wasTap) {
        // Tap-to-read / set trace
        const W = el.canvas.clientWidth;
        state.trace.t = Math.min(1, Math.max(0, pos.x / W));
        // Pick nearest enabled curve at this x
        const x = xFromT(state.trace.t);
        let best = -1;
        let bestDist = Infinity;
        const angleMode = getAngleMode();
        state.funcs.forEach((fn, i) => {
          if (!fn.enabled || !fn.expr.trim()) return;
          try {
            const y = CalcMath.evaluateAt(fn.expr.trim(), x, { angleMode, ans: 0 });
            if (!Number.isFinite(y)) return;
            const py = mapY(y);
            const dist = Math.abs(py - pos.y);
            if (dist < bestDist) {
              bestDist = dist;
              best = i;
            }
          } catch (_) {}
        });
        if (best >= 0) state.trace.fnIndex = best;
        if (!state.trace.on) {
          state.trace.on = true;
        }
        save();
        scheduleDraw();
      }
      e.preventDefault();
    }

    function bindControls() {
      el.btnZoomIn.addEventListener("click", () => zoom(0.5));
      el.btnZoomOut.addEventListener("click", () => zoom(2));
      el.btnZoomStd.addEventListener("click", () => zoomStandard());
      el.btnTrace.addEventListener("click", () => {
        state.trace.on = !state.trace.on;
        save();
        scheduleDraw();
      });

      // Prefer pointer events; also handle touch for older mobile
      el.canvas.addEventListener("pointerdown", onPointerDown);
      el.canvas.addEventListener("pointermove", onPointerMove);
      el.canvas.addEventListener("pointerup", onPointerUp);
      el.canvas.addEventListener("pointercancel", () => {
        state.pan = null;
      });

      // Wheel zoom
      el.canvas.addEventListener(
        "wheel",
        (e) => {
          e.preventDefault();
          const pos = getLocalPos(e);
          const cx = unmapX(pos.x);
          const cy = unmapY(pos.y);
          zoom(e.deltaY > 0 ? 1.25 : 0.8, cx, cy);
        },
        { passive: false }
      );

      // Keyboard trace nudge when graph visible
      document.addEventListener("keydown", (e) => {
        if (el.root.hidden || !state.trace.on) return;
        if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          state.trace.t = Math.max(0, state.trace.t - 0.01);
          save();
          scheduleDraw();
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          state.trace.t = Math.min(1, state.trace.t + 0.01);
          save();
          scheduleDraw();
        } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
          e.preventDefault();
          const enabled = state.funcs
            .map((f, i) => (f.enabled && f.expr.trim() ? i : -1))
            .filter((i) => i >= 0);
          if (!enabled.length) return;
          let pos = enabled.indexOf(state.trace.fnIndex);
          if (pos < 0) pos = 0;
          pos = e.key === "ArrowUp" ? (pos - 1 + enabled.length) % enabled.length : (pos + 1) % enabled.length;
          state.trace.fnIndex = enabled[pos];
          save();
          scheduleDraw();
        }
      });
    }

    function show() {
      el.root.hidden = false;
      updateAngleNote();
      scheduleDraw();
      // Second draw after layout settles
      requestAnimationFrame(() => scheduleDraw());
    }

    function hide() {
      el.root.hidden = true;
    }

    function onAngleModeChanged() {
      if (!el.root.hidden) scheduleDraw();
    }

    function onResize() {
      if (!el.root.hidden) scheduleDraw();
    }

    // Init
    load();
    renderYEditor();
    bindControls();
    updateWindowLabel();
    updateAngleNote();
    updateTraceUI();

    window.addEventListener("resize", onResize);
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", onResize);
    }

    return {
      show,
      hide,
      redraw: scheduleDraw,
      onAngleModeChanged,
      getState: () => state,
    };
  }

  global.CalcGraph = { createGraphController };
})(typeof window !== "undefined" ? window : globalThis);
