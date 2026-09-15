/**
 * Scientific Calculator — UI controller
 */
(function () {
  "use strict";

  const STORAGE = {
    angle: "sci-calc-angle-mode",
    memory: "sci-calc-memory",
    history: "sci-calc-history",
    ans: "sci-calc-ans",
    mode: "sci-calc-ui-mode",
  };

  const MAX_HISTORY = 20;

  const state = {
    expression: "",
    resultDisplay: "0",
    error: null,
    angleMode: "DEG", // DEG | RAD
    memory: 0,
    ans: 0,
    second: false,
    history: [],
    justEvaluated: false,
    uiMode: "calc", // calc | graph
  };

  const el = {
    expression: document.getElementById("expression"),
    result: document.getElementById("result"),
    error: document.getElementById("error"),
    angleMode: document.getElementById("angle-mode"),
    memoryInd: document.getElementById("memory-ind"),
    secondInd: document.getElementById("second-ind"),
    btnSecond: document.getElementById("btn-second"),
    btnAngle: document.getElementById("btn-angle"),
    keypad: document.getElementById("keypad"),
    historyToggle: document.getElementById("history-toggle"),
    historyPanel: document.getElementById("history-panel"),
    historyList: document.getElementById("history-list"),
    historyEmpty: document.getElementById("history-empty"),
    historyClear: document.getElementById("history-clear"),
    app: document.getElementById("app"),
    calcMode: document.getElementById("calc-mode"),
    graphMode: document.getElementById("graph-mode"),
    modeCalc: document.getElementById("mode-calc"),
    modeGraph: document.getElementById("mode-graph"),
  };

  let graphController = null;

  function loadState() {
    try {
      const angle = localStorage.getItem(STORAGE.angle);
      if (angle === "DEG" || angle === "RAD") state.angleMode = angle;

      const mem = localStorage.getItem(STORAGE.memory);
      if (mem !== null) {
        const n = Number(mem);
        if (Number.isFinite(n)) state.memory = n;
      }

      const ans = localStorage.getItem(STORAGE.ans);
      if (ans !== null) {
        const n = Number(ans);
        if (Number.isFinite(n)) {
          state.ans = n;
          state.resultDisplay = CalcMath.formatNumber(n);
        }
      }

      const hist = localStorage.getItem(STORAGE.history);
      if (hist) {
        const parsed = JSON.parse(hist);
        if (Array.isArray(parsed)) state.history = parsed.slice(0, MAX_HISTORY);
      }

      const mode = localStorage.getItem(STORAGE.mode);
      if (mode === "calc" || mode === "graph") state.uiMode = mode;
    } catch (_) {
      /* ignore corrupt storage */
    }
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE.angle, state.angleMode);
      localStorage.setItem(STORAGE.memory, String(state.memory));
      localStorage.setItem(STORAGE.ans, String(state.ans));
      localStorage.setItem(STORAGE.history, JSON.stringify(state.history.slice(0, MAX_HISTORY)));
      localStorage.setItem(STORAGE.mode, state.uiMode);
    } catch (_) {
      /* quota / private mode */
    }
  }

  function setSecond(on) {
    state.second = on;
    el.btnSecond.classList.toggle("is-active", on);
    el.secondInd.hidden = !on;

    el.keypad.querySelectorAll("[data-second-insert]").forEach((btn) => {
      const primary = btn.getAttribute("data-insert");
      const secondInsert = btn.getAttribute("data-second-insert");
      const secondLabel = btn.getAttribute("data-second-label");
      if (on) {
        if (!btn.dataset.primaryLabel) {
          btn.dataset.primaryLabel = btn.textContent.trim();
        }
        btn.textContent = secondLabel || secondInsert;
        btn.classList.add("is-second-label");
      } else {
        if (btn.dataset.primaryLabel) {
          btn.textContent = btn.dataset.primaryLabel;
        }
        btn.classList.remove("is-second-label");
      }
      // aria follows visible
      if (on && secondLabel) {
        btn.setAttribute("aria-label", secondLabel);
      }
    });
  }

  function clearSecondAfterUse() {
    if (state.second) setSecond(false);
  }

  function render() {
    el.expression.textContent = state.expression;
    el.result.textContent = state.resultDisplay;

    if (state.error) {
      el.error.hidden = false;
      el.error.textContent = state.error;
    } else {
      el.error.hidden = true;
      el.error.textContent = "";
    }

    el.angleMode.textContent = state.angleMode;
    el.btnAngle.textContent = state.angleMode;
    el.memoryInd.hidden = state.memory === 0;

    renderHistory();
  }

  function renderHistory() {
    el.historyList.innerHTML = "";
    if (state.history.length === 0) {
      el.historyEmpty.hidden = false;
      return;
    }
    el.historyEmpty.hidden = true;
    state.history.forEach((item, index) => {
      const li = document.createElement("li");
      li.setAttribute("role", "button");
      li.tabIndex = 0;
      li.innerHTML =
        `<div class="history-expr">${escapeHtml(item.expr)}</div>` +
        `<div class="history-res">= ${escapeHtml(item.result)}</div>`;
      li.addEventListener("click", () => recallHistory(index));
      li.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          recallHistory(index);
        }
      });
      el.historyList.appendChild(li);
    });
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function recallHistory(index) {
    const item = state.history[index];
    if (!item) return;
    state.expression = item.expr;
    state.resultDisplay = item.result;
    state.error = null;
    state.justEvaluated = false;
    el.historyPanel.hidden = true;
    el.historyToggle.setAttribute("aria-expanded", "false");
    render();
  }

  function pushHistory(expr, resultStr) {
    state.history.unshift({ expr, result: resultStr });
    if (state.history.length > MAX_HISTORY) state.history.length = MAX_HISTORY;
    persist();
  }

  function insertText(text) {
    if (state.justEvaluated) {
      // After equals: digit/decimal/Ans/const starts fresh; operator continues with Ans
      const startsFresh = /^[\d.πe]|Ans|sin|cos|tan|ln|log|√|∛|abs|sinh|cosh|tanh|asin|acos|atan|asinh|acosh|atanh|exp|10\^|nPr|nCr|1\//.test(text) ||
        text === "π" || text === "e" || text === "Ans";
      const isOp = ["+", "−", "×", "÷", "^", "%", "!"].includes(text);
      if (isOp) {
        state.expression = "Ans" + text;
      } else if (
        text.endsWith("(") ||
        text === "π" ||
        text === "e" ||
        text === "Ans" ||
        /^[\d.]/.test(text) ||
        text === "√(" ||
        text === "∛(" ||
        text === "1/(" ||
        text.startsWith("10^")
      ) {
        state.expression = text;
      } else {
        state.expression = text;
      }
      state.justEvaluated = false;
    } else {
      state.expression += text;
    }
    state.error = null;
    livePreview();
  }

  function livePreview() {
    if (!state.expression.trim()) {
      state.resultDisplay = CalcMath.formatNumber(state.ans);
      render();
      return;
    }
    try {
      const value = CalcMath.evaluate(normalizeForEval(state.expression), {
        angleMode: state.angleMode,
        ans: state.ans,
      });
      state.resultDisplay = CalcMath.formatNumber(value);
      state.error = null;
    } catch (err) {
      // Incomplete expression — don't show error while typing
      if (isIncomplete(err)) {
        state.error = null;
      } else {
        // Keep last good display; only show hard errors on equals
        state.error = null;
      }
    }
    render();
  }

  function isIncomplete(err) {
    const msg = err && err.message ? err.message : "";
    return (
      msg.includes("Unexpected end") ||
      msg.includes("Syntax error") ||
      msg.includes("Unexpected input") ||
      msg.includes("Unexpected character")
    );
  }

  /**
   * Normalize UI expression for the math engine:
   * - 10^( → wrap as needed (already insert "10^(")
   * - √( and ∛( already mapped in tokenizer
   */
  function normalizeForEval(expr) {
    // Convert "10^(" into "exp10(" style — engine has no 10^ func;
    // we rewrite 10^(...) as (10^(...)) which works: number 10, op ^, (
    // Actually "10^(" tokenizes as number 10, op ^, lparen — good.
    // "e^(" similarly if we inserted exp( for 2nd of ln.
    return expr;
  }

  function allClear() {
    state.expression = "";
    state.resultDisplay = "0";
    state.error = null;
    state.justEvaluated = false;
    setSecond(false);
    render();
  }

  function backspace() {
    if (state.justEvaluated) {
      state.justEvaluated = false;
    }
    if (!state.expression) return;

    // Delete multi-char tokens from the end when possible
    const suffixes = [
      "asinh(", "acosh(", "atanh(",
      "asin(", "acos(", "atan(",
      "sinh(", "cosh(", "tanh(",
      "sin(", "cos(", "tan(",
      "log(", "ln(", "exp(", "abs(",
      "nPr(", "nCr(", "10^(", "1/(",
      "√(", "∛(", "Ans", "π",
    ];
    let cut = 1;
    for (const s of suffixes) {
      if (state.expression.endsWith(s)) {
        cut = s.length;
        break;
      }
    }
    state.expression = state.expression.slice(0, -cut);
    state.error = null;
    livePreview();
  }

  function negate() {
    if (state.justEvaluated) {
      state.expression = "−Ans";
      state.justEvaluated = false;
      livePreview();
      return;
    }
    if (!state.expression) {
      state.expression = "−";
      render();
      return;
    }
    // Wrap entire expression: −(expr) or unwrap
    if (state.expression.startsWith("−(") && state.expression.endsWith(")")) {
      state.expression = state.expression.slice(2, -1);
    } else {
      state.expression = "−(" + state.expression + ")";
    }
    livePreview();
  }

  function equals() {
    if (!state.expression.trim()) return;
    try {
      const value = CalcMath.evaluate(normalizeForEval(state.expression), {
        angleMode: state.angleMode,
        ans: state.ans,
      });
      const formatted = CalcMath.formatNumber(value);
      pushHistory(state.expression, formatted);
      state.ans = value;
      state.resultDisplay = formatted;
      state.error = null;
      state.justEvaluated = true;
      persist();
      render();
    } catch (err) {
      state.error = err.message || "Error";
      render();
    }
  }

  function toggleAngle() {
    state.angleMode = state.angleMode === "DEG" ? "RAD" : "DEG";
    persist();
    livePreview();
    if (graphController) graphController.onAngleModeChanged();
  }

  function setUiMode(mode) {
    if (mode !== "calc" && mode !== "graph") return;
    state.uiMode = mode;
    const isGraph = mode === "graph";

    el.calcMode.hidden = isGraph;
    el.graphMode.hidden = !isGraph;
    el.app.classList.toggle("is-graph", isGraph);

    el.modeCalc.classList.toggle("is-active", !isGraph);
    el.modeGraph.classList.toggle("is-active", isGraph);
    el.modeCalc.setAttribute("aria-selected", isGraph ? "false" : "true");
    el.modeGraph.setAttribute("aria-selected", isGraph ? "true" : "false");

    // Hide history when switching to graph
    if (isGraph && !el.historyPanel.hidden) {
      el.historyPanel.hidden = true;
      el.historyToggle.setAttribute("aria-expanded", "false");
    }

    persist();

    if (isGraph) {
      if (!graphController && globalThis.CalcGraph) {
        graphController = CalcGraph.createGraphController({
          root: el.graphMode,
          getAngleMode: () => state.angleMode,
        });
      }
      if (graphController) graphController.show();
    } else if (graphController) {
      graphController.hide();
    }
  }

  function memoryClear() {
    state.memory = 0;
    persist();
    render();
  }

  function memoryRecall() {
    const text = CalcMath.formatNumber(state.memory);
    if (state.justEvaluated || !state.expression) {
      state.expression = text;
      state.justEvaluated = false;
    } else {
      state.expression += text;
    }
    livePreview();
  }

  function memoryAdd() {
    const v = currentValueOrAns();
    if (v === null) return;
    state.memory += v;
    persist();
    render();
  }

  function memorySub() {
    const v = currentValueOrAns();
    if (v === null) return;
    state.memory -= v;
    persist();
    render();
  }

  function currentValueOrAns() {
    try {
      if (state.expression.trim() && !state.justEvaluated) {
        return CalcMath.evaluate(normalizeForEval(state.expression), {
          angleMode: state.angleMode,
          ans: state.ans,
        });
      }
      return state.ans;
    } catch (err) {
      state.error = err.message || "Error";
      render();
      return null;
    }
  }

  function handleAction(action) {
    switch (action) {
      case "second":
        setSecond(!state.second);
        render();
        break;
      case "ac":
        allClear();
        break;
      case "backspace":
        backspace();
        break;
      case "equals":
        equals();
        clearSecondAfterUse();
        break;
      case "negate":
        negate();
        clearSecondAfterUse();
        break;
      case "toggle-angle":
        toggleAngle();
        break;
      case "mc":
        memoryClear();
        break;
      case "mr":
        memoryRecall();
        clearSecondAfterUse();
        break;
      case "mplus":
        memoryAdd();
        break;
      case "mminus":
        memorySub();
        break;
      case "paren-open":
        insertText("(");
        clearSecondAfterUse();
        break;
      case "paren-close":
        insertText(")");
        clearSecondAfterUse();
        break;
      default:
        break;
    }
  }

  function onKeypadClick(e) {
    const btn = e.target.closest("button.key");
    if (!btn || !el.keypad.contains(btn)) return;

    btn.classList.add("is-pressed");
    setTimeout(() => btn.classList.remove("is-pressed"), 100);

    const action = btn.getAttribute("data-action");
    if (action) {
      handleAction(action);
      return;
    }

    let insert = btn.getAttribute("data-insert");
    if (state.second && btn.hasAttribute("data-second-insert")) {
      insert = btn.getAttribute("data-second-insert");
    }
    if (insert != null) {
      insertText(insert);
      clearSecondAfterUse();
    }
  }

  function onKeyboard(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const tag = e.target && e.target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    // Graph mode uses its own key handling for Trace
    if (state.uiMode === "graph") return;

    const key = e.key;

    if (key === "Escape") {
      e.preventDefault();
      allClear();
      return;
    }
    if (key === "Backspace") {
      e.preventDefault();
      backspace();
      return;
    }
    if (key === "Enter" || key === "=") {
      e.preventDefault();
      equals();
      return;
    }
    if (key === "(") {
      e.preventDefault();
      insertText("(");
      return;
    }
    if (key === ")") {
      e.preventDefault();
      insertText(")");
      return;
    }
    if (/^[0-9.]$/.test(key)) {
      e.preventDefault();
      insertText(key);
      return;
    }
    if (key === "+") {
      e.preventDefault();
      insertText("+");
      return;
    }
    if (key === "-") {
      e.preventDefault();
      insertText("−");
      return;
    }
    if (key === "*") {
      e.preventDefault();
      insertText("×");
      return;
    }
    if (key === "/") {
      e.preventDefault();
      insertText("÷");
      return;
    }
    if (key === "^") {
      e.preventDefault();
      insertText("^");
      return;
    }
    if (key === "%") {
      e.preventDefault();
      insertText("%");
      return;
    }
    if (key === "!") {
      e.preventDefault();
      insertText("!");
      return;
    }
  }

  // Init
  loadState();
  setSecond(false);
  render();

  el.keypad.addEventListener("click", onKeypadClick);
  document.addEventListener("keydown", onKeyboard);

  el.historyToggle.addEventListener("click", () => {
    if (state.uiMode === "graph") return;
    const open = el.historyPanel.hidden;
    el.historyPanel.hidden = !open;
    el.historyToggle.setAttribute("aria-expanded", open ? "true" : "false");
  });

  el.historyClear.addEventListener("click", () => {
    state.history = [];
    persist();
    renderHistory();
  });

  // Close history when tapping display
  document.querySelector(".display").addEventListener("click", () => {
    if (!el.historyPanel.hidden) {
      el.historyPanel.hidden = true;
      el.historyToggle.setAttribute("aria-expanded", "false");
    }
  });

  el.modeCalc.addEventListener("click", () => setUiMode("calc"));
  el.modeGraph.addEventListener("click", () => setUiMode("graph"));

  el.angleMode.addEventListener("click", () => {
    toggleAngle();
  });

  // Apply persisted mode (creates graph controller lazily)
  setUiMode(state.uiMode);
})();
