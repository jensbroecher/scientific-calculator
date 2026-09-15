/**
 * Safe math expression tokenizer + recursive-descent evaluator.
 * No eval() on user input.
 */
(function (global) {
  "use strict";

  const FACTORIAL_MAX = 170; // 170! is near Number.MAX_VALUE

  class MathError extends Error {
    constructor(message) {
      super(message);
      this.name = "MathError";
    }
  }

  const CONSTANTS = {
    π: Math.PI,
    pi: Math.PI,
    e: Math.E,
  };

  // Function names (multi-char) — longest first for matching
  const FUNCS = [
    "asinh", "acosh", "atanh",
    "asin", "acos", "atan",
    "sinh", "cosh", "tanh",
    "sin", "cos", "tan",
    "log", "ln", "exp", "abs",
    "sqrt", "cbrt",
    "nPr", "nCr",
  ];

  function tokenize(input) {
    const src = String(input)
      .replace(/×/g, "*")
      .replace(/÷/g, "/")
      .replace(/−/g, "-")
      .replace(/√/g, "sqrt")
      .replace(/∛/g, "cbrt")
      .replace(/\s+/g, "");

    const tokens = [];
    let i = 0;

    while (i < src.length) {
      const ch = src[i];

      // Number (incl. scientific notation like 1.2e-3 as a single number token
      // only when e/E is part of a literal — Ambiguous with constant e:
      // we treat digit.digit[eE][+-]?digits as number; bare e is constant.
      if (/\d/.test(ch) || (ch === "." && i + 1 < src.length && /\d/.test(src[i + 1]))) {
        let j = i;
        while (j < src.length && /\d/.test(src[j])) j++;
        if (j < src.length && src[j] === ".") {
          j++;
          while (j < src.length && /\d/.test(src[j])) j++;
        }
        // scientific exponent on a number literal
        if (j < src.length && (src[j] === "e" || src[j] === "E")) {
          const next = src[j + 1];
          if (next === "+" || next === "-" || /\d/.test(next)) {
            j++;
            if (src[j] === "+" || src[j] === "-") j++;
            if (j >= src.length || !/\d/.test(src[j])) {
              throw new MathError("Invalid number format");
            }
            while (j < src.length && /\d/.test(src[j])) j++;
          }
        }
        const numStr = src.slice(i, j);
        const value = Number(numStr);
        if (!Number.isFinite(value)) throw new MathError("Invalid number");
        tokens.push({ type: "number", value });
        i = j;
        continue;
      }

      // Multi-char functions / Ans / nPr / nCr
      let matched = false;
      for (const name of FUNCS) {
        if (src.startsWith(name, i)) {
          tokens.push({ type: "func", value: name });
          i += name.length;
          matched = true;
          break;
        }
      }
      if (matched) continue;

      if (src.startsWith("Ans", i)) {
        tokens.push({ type: "ans" });
        i += 3;
        continue;
      }

      // Variable x (graphing / f(x))
      if (ch === "x" && !/[a-zA-Z0-9_]/.test(src[i + 1] || "")) {
        tokens.push({ type: "var", value: "x" });
        i += 1;
        continue;
      }

      // Constants π / e (standalone)
      if (ch === "π" || (ch === "p" && src.startsWith("pi", i))) {
        if (ch === "π") {
          tokens.push({ type: "number", value: Math.PI });
          i += 1;
        } else {
          tokens.push({ type: "number", value: Math.PI });
          i += 2;
        }
        continue;
      }
      if (ch === "e" && !/[a-zA-Z0-9_]/.test(src[i + 1] || "")) {
        tokens.push({ type: "number", value: Math.E });
        i += 1;
        continue;
      }

      // Operators & punctuation
      if (ch === "+" || ch === "-" || ch === "*" || ch === "/" || ch === "^" || ch === "!") {
        tokens.push({ type: "op", value: ch });
        i++;
        continue;
      }
      if (ch === "(") {
        tokens.push({ type: "lparen" });
        i++;
        continue;
      }
      if (ch === ")") {
        tokens.push({ type: "rparen" });
        i++;
        continue;
      }
      if (ch === "%") {
        tokens.push({ type: "op", value: "%" });
        i++;
        continue;
      }
      if (ch === ",") {
        tokens.push({ type: "comma" });
        i++;
        continue;
      }

      throw new MathError(`Unexpected character: ${ch}`);
    }

    return tokens;
  }

  /**
   * Insert implicit multiplication: 2π, 2(, )(, )2, πsin, Ans(, etc.
   */
  function insertImplicitMul(tokens) {
    const out = [];
    const isValueLeft = (p) =>
      p.type === "number" || p.type === "ans" || p.type === "var" || p.type === "rparen" ||
      (p.type === "op" && p.value === "!");
    const isValueRight = (t) =>
      t.type === "number" || t.type === "ans" || t.type === "var" || t.type === "lparen" || t.type === "func";
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      const prev = out[out.length - 1];
      if (prev && isValueLeft(prev) && isValueRight(t)) {
        out.push({ type: "op", value: "*" });
      }
      out.push(t);
    }
    return out;
  }

  function createParser(tokens, options) {
    const angleMode = options.angleMode || "DEG"; // DEG | RAD
    const ans = options.ans ?? 0;
    const variables = options.variables || {};
    let pos = 0;

    function peek() {
      return tokens[pos];
    }
    function consume() {
      return tokens[pos++];
    }
    function expect(type, value) {
      const t = peek();
      if (!t || t.type !== type || (value !== undefined && t.value !== value)) {
        throw new MathError("Unexpected end of expression or syntax error");
      }
      return consume();
    }

    function toRad(x) {
      return angleMode === "DEG" ? (x * Math.PI) / 180 : x;
    }
    function fromRad(x) {
      return angleMode === "DEG" ? (x * 180) / Math.PI : x;
    }

    function factorial(n) {
      if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
        throw new MathError("Factorial requires a non-negative integer");
      }
      if (n > FACTORIAL_MAX) throw new MathError("Factorial overflow");
      let r = 1;
      for (let i = 2; i <= n; i++) r *= i;
      return r;
    }

    function permutation(n, r) {
      if (!Number.isInteger(n) || !Number.isInteger(r) || n < 0 || r < 0 || r > n) {
        throw new MathError("nPr requires integers with 0 ≤ r ≤ n");
      }
      if (n > FACTORIAL_MAX) throw new MathError("nPr overflow");
      let result = 1;
      for (let i = 0; i < r; i++) result *= n - i;
      return result;
    }

    function combination(n, r) {
      if (!Number.isInteger(n) || !Number.isInteger(r) || n < 0 || r < 0 || r > n) {
        throw new MathError("nCr requires integers with 0 ≤ r ≤ n");
      }
      r = Math.min(r, n - r);
      let result = 1;
      for (let i = 0; i < r; i++) {
        result = (result * (n - i)) / (i + 1);
      }
      return Math.round(result);
    }

    function applyFunc(name, args) {
      if (name === "nPr" || name === "nCr") {
        if (args.length !== 2) throw new MathError(`${name} needs two arguments`);
        return name === "nPr" ? permutation(args[0], args[1]) : combination(args[0], args[1]);
      }
      if (args.length !== 1) throw new MathError(`${name} needs one argument`);
      const x = args[0];
      switch (name) {
        case "sin": return Math.sin(toRad(x));
        case "cos": return Math.cos(toRad(x));
        case "tan": {
          const rad = toRad(x);
          // Near odd multiples of π/2 in DEG, tan is undefined
          if (angleMode === "DEG") {
            const mod = ((x % 180) + 180) % 180;
            if (Math.abs(mod - 90) < 1e-10) throw new MathError("tan undefined");
          }
          const t = Math.tan(rad);
          if (!Number.isFinite(t)) throw new MathError("tan undefined");
          return t;
        }
        case "asin":
          if (x < -1 || x > 1) throw new MathError("asin domain error (|x| ≤ 1)");
          return fromRad(Math.asin(x));
        case "acos":
          if (x < -1 || x > 1) throw new MathError("acos domain error (|x| ≤ 1)");
          return fromRad(Math.acos(x));
        case "atan": return fromRad(Math.atan(x));
        case "sinh": return Math.sinh(x);
        case "cosh": return Math.cosh(x);
        case "tanh": return Math.tanh(x);
        case "asinh": return Math.asinh(x);
        case "acosh":
          if (x < 1) throw new MathError("acosh domain error (x ≥ 1)");
          return Math.acosh(x);
        case "atanh":
          if (x <= -1 || x >= 1) throw new MathError("atanh domain error (|x| < 1)");
          return Math.atanh(x);
        case "ln":
          if (x <= 0) throw new MathError("ln domain error (x > 0)");
          return Math.log(x);
        case "log":
          if (x <= 0) throw new MathError("log domain error (x > 0)");
          return Math.log10(x);
        case "exp": return Math.exp(x);
        case "abs": return Math.abs(x);
        case "sqrt":
          if (x < 0) throw new MathError("√ domain error (x ≥ 0)");
          return Math.sqrt(x);
        case "cbrt": return Math.cbrt(x);
        default:
          throw new MathError(`Unknown function: ${name}`);
      }
    }

    // expression = term { ("+"|"-") term }
    function parseExpression() {
      let left = parseTerm();
      while (peek() && peek().type === "op" && (peek().value === "+" || peek().value === "-")) {
        const op = consume().value;
        const right = parseTerm();
        left = op === "+" ? left + right : left - right;
      }
      return left;
    }

    // term = power { ("*"|"/") power }
    function parseTerm() {
      let left = parsePower();
      while (peek() && peek().type === "op" && (peek().value === "*" || peek().value === "/")) {
        const op = consume().value;
        const right = parsePower();
        if (op === "/") {
          if (right === 0) throw new MathError("Division by zero");
          left = left / right;
        } else {
          left = left * right;
        }
      }
      return left;
    }

    // power = unary { "^" unary }  (right-associative)
    function parsePower() {
      let left = parseUnary();
      if (peek() && peek().type === "op" && peek().value === "^") {
        consume();
        const right = parsePower();
        if (left < 0 && !Number.isInteger(right)) {
          // Complex result for non-integer powers of negative — reject
          const result = Math.pow(left, right);
          if (!Number.isFinite(result)) throw new MathError("Invalid power");
          return result;
        }
        const result = Math.pow(left, right);
        if (!Number.isFinite(result)) throw new MathError("Overflow or invalid power");
        return result;
      }
      return left;
    }

    // unary = ("+"|"-") unary | postfix
    function parseUnary() {
      if (peek() && peek().type === "op" && peek().value === "+") {
        consume();
        return parseUnary();
      }
      if (peek() && peek().type === "op" && peek().value === "-") {
        consume();
        return -parseUnary();
      }
      return parsePostfix();
    }

    // postfix = primary { "!" | "%" }
    function parsePostfix() {
      let value = parsePrimary();
      while (peek() && peek().type === "op" && (peek().value === "!" || peek().value === "%")) {
        const op = consume().value;
        if (op === "!") {
          value = factorial(value);
        } else {
          value = value / 100;
        }
      }
      return value;
    }

    // primary = number | ans | func args | "(" expression ")"
    function parsePrimary() {
      const t = peek();
      if (!t) throw new MathError("Unexpected end of expression");

      if (t.type === "number") {
        consume();
        return t.value;
      }
      if (t.type === "ans") {
        consume();
        return ans;
      }
      if (t.type === "var") {
        const name = consume().value;
        if (!Object.prototype.hasOwnProperty.call(variables, name)) {
          throw new MathError(`Undefined variable: ${name}`);
        }
        const v = variables[name];
        if (!Number.isFinite(v)) throw new MathError(`Invalid value for ${name}`);
        return v;
      }
      if (t.type === "func") {
        const name = consume().value;
        expect("lparen");
        const args = [];
        if (peek() && peek().type !== "rparen") {
          args.push(parseExpression());
          while (peek() && peek().type === "comma") {
            consume();
            args.push(parseExpression());
          }
        }
        expect("rparen");
        return applyFunc(name, args);
      }
      if (t.type === "lparen") {
        consume();
        const v = parseExpression();
        expect("rparen");
        return v;
      }

      throw new MathError("Syntax error");
    }

    function evaluate() {
      if (tokens.length === 0) return 0;
      const result = parseExpression();
      if (pos < tokens.length) throw new MathError("Unexpected input after expression");
      if (!Number.isFinite(result)) throw new MathError("Result is not a finite number");
      return result;
    }

    return { evaluate };
  }

  function formatNumber(n) {
    if (!Number.isFinite(n)) return String(n);
    if (Object.is(n, -0)) return "0";

    const abs = Math.abs(n);
    // Scientific notation for very large / small
    if ((abs !== 0 && abs < 1e-6) || abs >= 1e12) {
      return n.toExponential(10).replace(/\.?0+e/, "e").replace(/e\+/, "e+").replace(/e-/, "e-");
    }

    // Trim floating noise
    let s = Number(n.toPrecision(12)).toString();
    if (s.includes("e") || s.includes("E")) {
      return s;
    }
    return s;
  }

  function evaluate(expression, options = {}) {
    const raw = tokenize(expression);
    const tokens = insertImplicitMul(raw);
    const parser = createParser(tokens, options);
    return parser.evaluate();
  }

  /**
   * Evaluate f(x) with a bound variable. Convenience for graphing.
   */
  function evaluateAt(expression, x, options = {}) {
    return evaluate(expression, {
      ...options,
      variables: { ...(options.variables || {}), x },
    });
  }

  global.CalcMath = {
    evaluate,
    evaluateAt,
    formatNumber,
    MathError,
    FACTORIAL_MAX,
  };
})(typeof window !== "undefined" ? window : globalThis);
