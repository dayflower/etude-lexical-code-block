import { spawnSync } from "node:child_process";

const SESSION = "etude-verify";
const URL = process.env.E2E_URL ?? "http://localhost:5173/";

function run(args, { capture = false } = {}) {
  const r = spawnSync("playwright-cli", [`-s=${SESSION}`, ...args], {
    encoding: "utf8",
    stdio: capture ? ["ignore", "pipe", "pipe"] : ["ignore", "pipe", "pipe"],
  });
  if (r.status !== 0) {
    throw new Error(
      `playwright-cli ${args.join(" ")} failed (exit ${r.status}): ${r.stderr || r.stdout}`,
    );
  }
  return r.stdout;
}

export function pw(...args) {
  return run(args);
}

export function pwRaw(...args) {
  return run(["--raw", ...args]).replace(/\n$/, "");
}

export function pwJson(...args) {
  const out = pwRaw(...args);
  if (out === "") return undefined;
  return JSON.parse(out);
}

export function pwEval(expr) {
  return pwJson("eval", expr);
}

export async function setup() {
  pw("open", URL);
}

export async function teardown() {
  try {
    pw("close");
  } catch {
    // ignore: browser may already be closed
  }
}

export async function resetEditor() {
  pw("goto", URL);
  pw("click", "[contenteditable=true]");
}

export function getEditorHtml() {
  return pwEval(
    "() => document.querySelector('[data-lexical-editor=true]').outerHTML",
  );
}

export function getCodeBlock() {
  return pwEval(
    "() => document.querySelector('pre.markdown-code-block')?.outerHTML ?? null",
  );
}

// Escape characters that JSON.stringify leaves intact but are unsafe to splice
// into a JavaScript source string (see CodeQL js/bad-code-sanitization).
const UNSAFE_JS_CHAR_MAP = {
  "<": "\\u003C",
  ">": "\\u003E",
  "/": "\\u002F",
  "\b": "\\b",
  "\f": "\\f",
  "\n": "\\n",
  "\r": "\\r",
  "\t": "\\t",
  "\0": "\\0",
  "\u2028": "\\u2028",
  "\u2029": "\\u2029",
};

function escapeUnsafeJsChars(str) {
  return str.replace(
    /[<>/\b\f\n\r\t\0\u2028\u2029]/g,
    (ch) => UNSAFE_JS_CHAR_MAP[ch],
  );
}

export function getCodeBlockAttr(name) {
  const safeName = escapeUnsafeJsChars(JSON.stringify(name));
  return pwEval(
    `() => document.querySelector('pre.markdown-code-block')?.getAttribute(${safeName}) ?? null`,
  );
}

export function getCodeBlockCount() {
  return pwEval(
    "() => document.querySelectorAll('pre.markdown-code-block').length",
  );
}

// Markdown source panel sits in the second column. The rich editor's own <pre>
// is inside [data-lexical-editor=true], so we exclude that.
export function getMarkdownSource() {
  return pwEval(
    `() => {
      const all = document.querySelectorAll('pre');
      for (const el of all) {
        if (!el.closest('[data-lexical-editor=true]')) return el.textContent;
      }
      return null;
    }`,
  );
}

export function getParagraphTexts() {
  return pwEval(
    `() => Array.from(document.querySelectorAll('[data-lexical-editor=true] p')).map(p => p.textContent)`,
  );
}

export function getCodeBlockChildrenSummary() {
  return pwEval(
    `() => {
      const block = document.querySelector('pre.markdown-code-block');
      if (!block) return null;
      return Array.from(block.childNodes).map(n => {
        if (n.nodeName === 'BR') return { kind: 'br' };
        if (n.nodeType === 1) {
          const el = n;
          return {
            kind: 'span',
            classes: Array.from(el.classList),
            text: el.textContent,
          };
        }
        return { kind: 'other', node: n.nodeName, text: n.textContent };
      });
    }`,
  );
}

export function getCursorInfo() {
  return pwEval(
    `() => {
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount) return null;
      const r = sel.getRangeAt(0);
      const node = r.startContainer;
      const parent = node.parentElement;
      return {
        nodeName: node.nodeName,
        text: (node.textContent ?? '').slice(0, 80),
        offset: r.startOffset,
        collapsed: r.collapsed,
        parentTag: parent?.tagName ?? null,
        parentClass: parent?.className ?? null,
      };
    }`,
  );
}

// Position the DOM selection by walking children of the code block's <pre>
// element. `nth` selects the nth direct child (BR or span); `offset` is the
// position inside that child (for span/text children). For an element-anchor
// (between children), pass `nth = -1` and `offset = <child index>` to place
// the selection at the pre element itself.
function setSelectionInCodeBlock(nth, offset) {
  pwEval(
    `() => {
      const block = document.querySelector('pre.markdown-code-block');
      if (!block) throw new Error('no code block');
      const sel = window.getSelection();
      const range = document.createRange();
      if (${nth} === -1) {
        range.setStart(block, ${offset});
      } else {
        const child = block.childNodes[${nth}];
        if (!child) throw new Error('child not found at ' + ${nth});
        const target = child.firstChild ?? child;
        range.setStart(target, ${offset});
      }
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
      block.focus();
      return true;
    }`,
  );
}

// Caret at offset 0 of the open fence (= block start).
export function moveCursorToBlockStart() {
  setSelectionInCodeBlock(0, 0);
}

// Caret at offset 0 of the close fence (= close-fence-line start when the
// canonical trailing LB is in place).
export function moveCursorToCloseFenceLineStart() {
  pwEval(
    `() => {
      const block = document.querySelector('pre.markdown-code-block');
      if (!block) throw new Error('no code block');
      const last = block.lastChild;
      if (!last) throw new Error('no last child');
      const target = last.firstChild ?? last;
      const sel = window.getSelection();
      const range = document.createRange();
      range.setStart(target, 0);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
      block.focus();
      return true;
    }`,
  );
}

// Set the caret on the Nth `<p>` inside the editor at the given character
// offset within its first text node (or as an element-type anchor on the
// paragraph when it has no text child yet).
export function moveCursorToParagraph(nth, offset = 0) {
  pwEval(
    `() => {
      const ps = document.querySelectorAll('[data-lexical-editor=true] p');
      const p = ps[${nth}];
      if (!p) throw new Error('no paragraph at index ' + ${nth});
      const sel = window.getSelection();
      const range = document.createRange();
      const t = p.firstChild;
      if (t && t.nodeType === 3) {
        range.setStart(t, ${offset});
      } else {
        range.setStart(p, ${offset});
      }
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
      p.focus();
      return true;
    }`,
  );
}

// Caret at offset 0 of the first content line. The canonical layout puts
// the first content node as block.childNodes[2] (open fence, BR, first
// content); for an empty block, that index has no node yet, so we fall back
// to an element-type selection on the block at child index 2.
export function moveCursorToFirstContentLineStart() {
  pwEval(
    `() => {
      const block = document.querySelector('pre.markdown-code-block');
      if (!block) throw new Error('no code block');
      const sel = window.getSelection();
      const range = document.createRange();
      const third = block.childNodes[2];
      if (third && third.nodeName !== 'BR') {
        const target = third.firstChild ?? third;
        range.setStart(target, 0);
      } else {
        range.setStart(block, 2);
      }
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
      block.focus();
      return true;
    }`,
  );
}
