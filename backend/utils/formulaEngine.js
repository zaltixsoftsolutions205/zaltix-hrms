/**
 * formulaEngine.js
 * ---------------------------------------------------------------------------
 * Secure formula parsing + evaluation for GlobalTable `formula` fields.
 *
 * SECURITY: this is a hand-written tokenizer + recursive-descent parser that
 * produces a small AST. User text is NEVER passed to eval(), new Function(),
 * vm, or any other code-execution facility. Only the constructs below exist;
 * everything else is a parse error.
 *
 * Grammar
 *   expression := term (('+' | '-') term)*
 *   term       := factor (('*' | '/') factor)*
 *   factor     := ('-' | '+') factor | primary
 *   primary    := NUMBER
 *               | FUNCTION '(' expression (',' expression)* ')'
 *               | REFERENCE
 *               | '(' expression ')'
 *
 * References
 *   dealValue          -> custom field with key "dealValue" in the same table
 *   native.dealValue   -> native entity field (must be numeric)
 *
 * Functions: ROUND(x [, digits 0-10]), ABS(x), MIN(...), MAX(...), SUM(...)
 *
 * Semantics
 *   - Every operand is a number. If ANY referenced value is empty (null) the
 *     whole result is null (an incomplete record has no total).
 *   - Division by zero, or a non-finite result, evaluates to null.
 *   - Results are rounded to 10 decimal places to hide float noise (0.1+0.2).
 *
 * Limits: 500 characters, 200 AST nodes, nesting depth 20.
 * ---------------------------------------------------------------------------
 */

const MAX_LENGTH = 500;
const MAX_NODES = 200;
const MAX_DEPTH = 20;

const FUNCTIONS = {
  ROUND: { min: 1, max: 2 },
  ABS: { min: 1, max: 1 },
  MIN: { min: 1, max: 20 },
  MAX: { min: 1, max: 20 },
  SUM: { min: 1, max: 20 },
};

class FormulaError extends Error {
  constructor(message) {
    super(message);
    this.name = 'FormulaError';
  }
}

/* ------------------------------ tokenizer -------------------------------- */

const NUMBER_RE = /^(\d+(\.\d+)?|\.\d+)/;
const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)?/;

const tokenize = (src) => {
  const tokens = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) {
      i += 1;
    } else if (/[0-9.]/.test(ch)) {
      const m = NUMBER_RE.exec(src.slice(i));
      if (!m) throw new FormulaError(`Invalid number at position ${i + 1}`);
      tokens.push({ t: 'num', v: Number(m[0]), pos: i });
      i += m[0].length;
    } else if (/[A-Za-z_]/.test(ch)) {
      const m = IDENT_RE.exec(src.slice(i));
      tokens.push({ t: 'id', v: m[0], pos: i });
      i += m[0].length;
    } else if ('+-*/(),'.includes(ch)) {
      tokens.push({ t: ch, pos: i });
      i += 1;
    } else {
      throw new FormulaError(`Unexpected character "${ch}" at position ${i + 1}`);
    }
  }
  return tokens;
};

/* ------------------------------- parser ---------------------------------- */

const parseTokens = (tokens) => {
  let pos = 0;
  let nodes = 0;

  const peek = () => tokens[pos];
  const next = () => tokens[pos++];
  const node = (n) => {
    nodes += 1;
    if (nodes > MAX_NODES) throw new FormulaError(`Formula is too complex (max ${MAX_NODES} elements)`);
    return n;
  };
  const expect = (type, what) => {
    const tok = next();
    if (!tok || tok.t !== type) throw new FormulaError(`Expected ${what}`);
    return tok;
  };

  const parseExpression = (depth) => {
    if (depth > MAX_DEPTH) throw new FormulaError(`Formula is nested too deeply (max ${MAX_DEPTH})`);
    let left = parseTerm(depth);
    while (peek() && (peek().t === '+' || peek().t === '-')) {
      const op = next().t;
      const right = parseTerm(depth);
      left = node({ type: 'bin', op, left, right });
    }
    return left;
  };

  const parseTerm = (depth) => {
    let left = parseFactor(depth);
    while (peek() && (peek().t === '*' || peek().t === '/')) {
      const op = next().t;
      const right = parseFactor(depth);
      left = node({ type: 'bin', op, left, right });
    }
    return left;
  };

  const parseFactor = (depth) => {
    if (depth > MAX_DEPTH) throw new FormulaError(`Formula is nested too deeply (max ${MAX_DEPTH})`);
    const tok = peek();
    if (tok && (tok.t === '-' || tok.t === '+')) {
      next();
      return node({ type: 'unary', op: tok.t, arg: parseFactor(depth + 1) });
    }
    return parsePrimary(depth);
  };

  const parsePrimary = (depth) => {
    const tok = next();
    if (!tok) throw new FormulaError('Formula ended unexpectedly');

    if (tok.t === 'num') return node({ type: 'num', value: tok.v });

    if (tok.t === '(') {
      const inner = parseExpression(depth + 1);
      expect(')', '")"');
      return inner;
    }

    if (tok.t === 'id') {
      // function call
      if (peek() && peek().t === '(') {
        const name = tok.v.toUpperCase();
        if (tok.v.includes('.') || !FUNCTIONS[name]) {
          throw new FormulaError(`Unknown function "${tok.v}". Allowed: ${Object.keys(FUNCTIONS).join(', ')}`);
        }
        next(); // (
        const args = [parseExpression(depth + 1)];
        while (peek() && peek().t === ',') {
          next();
          args.push(parseExpression(depth + 1));
        }
        expect(')', '")"');
        const { min, max } = FUNCTIONS[name];
        if (args.length < min || args.length > max) {
          throw new FormulaError(`${name} expects ${min === max ? min : `${min}-${max}`} argument(s)`);
        }
        return node({ type: 'call', name, args });
      }

      // reference
      if (tok.v.includes('.')) {
        const [prefix, key] = tok.v.split('.');
        if (prefix !== 'native') {
          throw new FormulaError(`Unknown reference prefix "${prefix}". Use native.<field> for entity fields`);
        }
        return node({ type: 'ref', source: 'native', key });
      }
      return node({ type: 'ref', source: 'custom', key: tok.v });
    }

    throw new FormulaError(`Unexpected "${tok.t}" at position ${tok.pos + 1}`);
  };

  const ast = parseExpression(0);
  if (pos < tokens.length) {
    throw new FormulaError(`Unexpected "${tokens[pos].t === 'id' ? tokens[pos].v : tokens[pos].t}" at position ${tokens[pos].pos + 1}`);
  }
  return ast;
};

const collectRefs = (ast, out = []) => {
  switch (ast.type) {
    case 'ref': out.push({ source: ast.source, key: ast.key }); break;
    case 'unary': collectRefs(ast.arg, out); break;
    case 'bin': collectRefs(ast.left, out); collectRefs(ast.right, out); break;
    case 'call': ast.args.forEach((a) => collectRefs(a, out)); break;
    default: break;
  }
  return out;
};

/**
 * Parses an expression. Returns { ast, refs } where refs is a de-duplicated
 * list of { source: 'custom'|'native', key }. Throws FormulaError.
 */
const parseFormula = (expression) => {
  if (typeof expression !== 'string' || !expression.trim()) throw new FormulaError('Formula is empty');
  if (expression.length > MAX_LENGTH) throw new FormulaError(`Formula cannot exceed ${MAX_LENGTH} characters`);

  const ast = parseTokens(tokenize(expression));
  const seen = new Set();
  const refs = collectRefs(ast).filter((r) => {
    const id = `${r.source}:${r.key}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  return { ast, refs };
};

/* ------------------------------ evaluator -------------------------------- */

const finalize = (v) => {
  if (v === null || !Number.isFinite(v)) return null;
  return Math.round(v * 1e10) / 1e10;
};

/**
 * Evaluates an AST. `resolve(source, key)` must return a finite number or null.
 * Returns a number or null.
 */
const evaluateFormula = (ast, resolve) => {
  const ev = (n) => {
    switch (n.type) {
      case 'num':
        return n.value;
      case 'ref': {
        const v = resolve(n.source, n.key);
        return typeof v === 'number' && Number.isFinite(v) ? v : null;
      }
      case 'unary': {
        const v = ev(n.arg);
        if (v === null) return null;
        return n.op === '-' ? -v : v;
      }
      case 'bin': {
        const a = ev(n.left);
        const b = ev(n.right);
        if (a === null || b === null) return null;
        if (n.op === '+') return a + b;
        if (n.op === '-') return a - b;
        if (n.op === '*') return a * b;
        return b === 0 ? null : a / b;
      }
      case 'call': {
        const args = n.args.map(ev);
        if (args.some((a) => a === null)) return null;
        switch (n.name) {
          case 'ABS': return Math.abs(args[0]);
          case 'MIN': return Math.min(...args);
          case 'MAX': return Math.max(...args);
          case 'SUM': return args.reduce((s, x) => s + x, 0);
          case 'ROUND': {
            const digits = args.length > 1 ? args[1] : 0;
            if (!Number.isInteger(digits) || digits < 0 || digits > 10) return null;
            const f = 10 ** digits;
            return Math.round(args[0] * f) / f;
          }
          default: return null;
        }
      }
      default:
        return null;
    }
  };
  return finalize(ev(ast));
};

module.exports = {
  parseFormula,
  evaluateFormula,
  FormulaError,
  FUNCTION_NAMES: Object.keys(FUNCTIONS),
  MAX_LENGTH,
};