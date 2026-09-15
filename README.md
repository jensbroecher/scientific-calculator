# Scientific / Graphing Calculator

A polished, mobile-first calculator web app with **Calc** and **Graph** modes (TI-84 / Casio–inspired), in a clean modern dark UI.

Plain HTML + CSS + vanilla JavaScript — no build step. Safe expression parser (no `eval()`).

## Open / run

**Option A — open the file**

```bash
open index.html          # macOS
xdg-open index.html      # Linux
start index.html         # Windows
```

Or open `/workspace/scientific-calculator/index.html` in any modern browser.

**Option B — local static server (recommended)**

```bash
cd /workspace/scientific-calculator
python3 -m http.server 8765
```

Then visit: [http://127.0.0.1:8765/](http://127.0.0.1:8765/)

## Modes

Use the **Calc / Graph** segmented control in the header. Last mode is remembered in `localStorage`.

### Calc mode

- Expression + result display with clear error messages
- History (last 20), persisted, tap to recall
- Basic ops, parentheses, negate, Ans, AC, backspace
- Trig / inverse / hyperbolic; DEG ↔ RAD (persisted; tap the DEG/RAD badge anytime)
- log, ln, exp, 10ˣ, powers, roots, reciprocal, factorial, π, e, %, abs
- nPr / nCr (via 2nd layer on % / Ans)
- Memory: M+, M−, MR, MC (persisted)
- 2nd / SHIFT layer (auto-clears after one use)
- Desktop keyboard: digits, operators, Enter/=, Escape, Backspace

### Graph mode (Y=)

1. Switch to **Graph**.
2. Edit **Y1…Y4** (expressions in `x`). Defaults: Y1=`sin(x)`, Y2=`x^2`.
3. Tap the color swatch to enable/disable each curve.
4. Plot shows axes, light grid, tick labels; window defaults to X/Y ∈ [−10, 10].
5. **In / Out / ZStd** — zoom in, zoom out, reset to standard window.
6. **Drag** the plot to pan (when Trace is off).
7. **Trace** — tap the plot or press Trace; drag horizontally (or ←/→) along the curve; ↑/↓ switch among enabled Yi. Readout shows `(x, y)`.
8. Angle mode (DEG/RAD) matches Calc — tap the status badge to toggle. Trig plots follow the active mode.

Discontinuities (e.g. `1/x`, `tan(x)`) skip large vertical jumps so asymptotes do not draw huge spikes.

## Files

| File         | Role                                   |
|--------------|----------------------------------------|
| `index.html` | Markup, keypad, Graph shell            |
| `styles.css` | Mobile-first dark UI                   |
| `math.js`    | Tokenizer + recursive descent (+ `x`)  |
| `graph.js`   | Y= editor, canvas plot, zoom/pan/trace |
| `app.js`     | Calc UI, mode switch, history, memory  |

## Notes / limitations

- Factorial is limited to non-negative integers up to 170.
- Very large/small results use scientific notation.
- Graph sampling is dense (~2× canvas width) but not adaptive near singularities; extreme zooms may look sparse or noisy.
- Only the variable `x` is supported in Graph expressions (plus constants π, e, and the usual functions).
- Multi-touch pinch-zoom is not implemented (use In/Out or mouse wheel).
