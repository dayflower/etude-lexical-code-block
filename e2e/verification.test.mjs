// E2E coverage of the manual verification scenarios for the code-block
// plugin. Drives the running dev server with playwright-cli and asserts
// via node:assert. Run with:
//
//   npm run dev   # in a separate shell (http://localhost:5173/)
//   node --test e2e/verification.test.mjs

import { strict as assert } from "node:assert";
import { after, before, describe, test } from "node:test";
import {
  getCodeBlock,
  getCodeBlockAttr,
  getCodeBlockChildrenSummary,
  getCodeBlockCount,
  getCursorInfo,
  getEditorHtml,
  getMarkdownSource,
  getParagraphTexts,
  moveCursorToBlockStart,
  moveCursorToCloseFenceLineStart,
  moveCursorToFirstContentLineStart,
  pw,
  pwEval,
  resetEditor,
  setup,
  teardown,
} from "./helpers.mjs";

before(setup);
after(teardown);

describe("creation", () => {
  test("opening fence with language creates a code block", async () => {
    await resetEditor();
    pw("type", "```js");
    pw("press", "Enter");
    assert.equal(getCodeBlockCount(), 1);
    assert.equal(getCodeBlockAttr("data-language"), "js");
    const children = getCodeBlockChildrenSummary();
    // Canonical empty layout: [openFence, separator LB, trailing LB, closeFence]
    assert.equal(children.length, 4);
    assert.equal(children[0].kind, "span");
    assert.ok(children[0].classes.includes("markdown-code-fence"));
    assert.equal(children[0].text, "```js");
    assert.equal(children[1].kind, "br");
    assert.equal(children[2].kind, "br");
    assert.equal(children[3].kind, "span");
    assert.ok(children[3].classes.includes("markdown-code-fence"));
    assert.equal(children[3].text, "```");
  });

  test("opening fence without language creates a code block", async () => {
    await resetEditor();
    pw("type", "```");
    pw("press", "Enter");
    assert.equal(getCodeBlockCount(), 1);
    assert.equal(getCodeBlockAttr("data-language"), "");
  });
});

describe("content input", () => {
  test("typed text appears as a content line between fences", async () => {
    await resetEditor();
    pw("type", "```js");
    pw("press", "Enter");
    pw("type", "const x = 1;");
    const html = getCodeBlock();
    assert.match(html, /```js<\/span>/);
    assert.match(html, /const x = 1;/);
    assert.match(html, /<span class="markdown-code-fence"[^>]*>```<\/span>/);
    assert.equal(getMarkdownSource(), "```js\nconst x = 1;\n```");
  });

  test("exiting the block applies Prism token classes to JS content", async () => {
    await resetEditor();
    pw("type", "```js");
    pw("press", "Enter");
    pw("type", "const x = 1;");
    // Highlighting only fires once the caret leaves the block (the
    // validation listener in useCodeBlockValidationOnBlur watches for
    // focus-departure rather than DOM blur). Escape exits to a new paragraph.
    pw("press", "Escape");
    const html = getCodeBlock();
    assert.match(
      html,
      /class="token keyword"[^>]*>const</,
      "expected `const` to be highlighted as a keyword token after exit",
    );
    assert.match(html, /class="token number"[^>]*>1</);
  });
});

describe("backspace at code block start", () => {
  test("no previous sibling — block unchanged", async () => {
    await resetEditor();
    pw("type", "```js");
    pw("press", "Enter");
    pw("type", "alpha");
    const before = getEditorHtml();
    moveCursorToBlockStart();
    pw("press", "Backspace");
    assert.equal(getEditorHtml(), before);
  });

  test("prev empty paragraph — paragraph removed, block intact", async () => {
    await resetEditor();
    pw("press", "Enter");
    pw("type", "```js");
    pw("press", "Enter");
    pw("type", "alpha");
    assert.equal(getParagraphTexts().length, 1, "an empty paragraph precedes");
    moveCursorToBlockStart();
    pw("press", "Backspace");
    assert.equal(getCodeBlockCount(), 1, "block survives");
    assert.equal(getParagraphTexts().length, 0, "empty paragraph removed");
    assert.equal(getMarkdownSource(), "```js\nalpha\n```");
  });

  test("prev non-empty paragraph — block dissolves into prev", async () => {
    await resetEditor();
    pw("type", "hello");
    pw("press", "Enter");
    pw("type", "```js");
    pw("press", "Enter");
    pw("type", "world");
    moveCursorToBlockStart();
    pw("press", "Backspace");
    assert.equal(getCodeBlockCount(), 0, "no code block remains");
    // No leaking fence/highlight classes.
    const html = getEditorHtml();
    assert.doesNotMatch(html, /markdown-code-fence/);
    assert.doesNotMatch(html, /class="token/);
    // The dissolved layout is paragraph-per-line, with the open-fence line
    // merged into the previous paragraph.
    assert.deepEqual(getParagraphTexts(), ["hello```js", "world", "```"]);
  });
});

describe("backspace at first content line start", () => {
  test("merges first content line into open fence text", async () => {
    await resetEditor();
    pw("type", "```js");
    pw("press", "Enter");
    pw("type", "alpha");
    moveCursorToFirstContentLineStart();
    pw("press", "Backspace");
    // "alpha" was absorbed into the open fence; it is no longer a fence
    // (parseOpenFence rejects "```jsalpha"), so the block normalizes
    // differently. The verification scenario states the language is
    // re-parsed from the absorbed text.
    const fenceText = pwEval(
      "() => document.querySelector('pre.markdown-code-block .markdown-code-fence')?.textContent ?? null",
    );
    assert.equal(fenceText, "```jsalpha");
    // After the merge, the data-language attribute should reflect the new
    // parse of the open fence ("jsalpha" is still a valid identifier).
    assert.equal(getCodeBlockAttr("data-language"), "jsalpha");
  });
});

describe("backspace at close fence line start", () => {
  test("prev = content — close fence joins onto last content line", async () => {
    await resetEditor();
    pw("type", "```js");
    pw("press", "Enter");
    pw("type", "alpha");
    moveCursorToCloseFenceLineStart();
    pw("press", "Backspace");
    const children = getCodeBlockChildrenSummary();
    // Expected layout: [openFence, BR, content "alpha", closeFence] — the
    // trailing BR is gone and close fence is the immediate next sibling.
    assert.equal(children.length, 4);
    assert.equal(children[0].text, "```js");
    assert.equal(children[1].kind, "br");
    assert.equal(children[2].text, "alpha");
    assert.equal(children[3].text, "```");
    const cursor = getCursorInfo();
    assert.equal(cursor.text, "alpha");
    assert.equal(cursor.offset, 5, "caret sits at the end of content");
  });

  test("prev = empty line — empty line collapses, caret at close fence start", async () => {
    await resetEditor();
    pw("type", "```js");
    pw("press", "Enter");
    pw("type", "alpha");
    pw("press", "Enter"); // adds a trailing empty line above close fence
    moveCursorToCloseFenceLineStart();
    pw("press", "Backspace");
    const children = getCodeBlockChildrenSummary();
    // Expected: [openFence, BR, "alpha", BR, closeFence] — the second empty
    // line has been removed.
    assert.equal(children.length, 5);
    assert.equal(children[2].text, "alpha");
    assert.equal(children[4].text, "```");
    const cursor = getCursorInfo();
    assert.equal(cursor.text, "```");
    assert.equal(cursor.offset, 0, "caret at close fence start");
  });

  test("prev = open fence ([openFence, LB, closeFence]) — caret slides up", async () => {
    await resetEditor();
    pw("type", "```js");
    // A freshly created empty block is [openFence, BR, BR, closeFence].
    // One close-fence-line Backspace collapses the empty middle line and
    // lands the block in the transient [openFence, BR, closeFence] state.
    pw("press", "Enter");
    moveCursorToCloseFenceLineStart();
    pw("press", "Backspace");
    let children = getCodeBlockChildrenSummary();
    assert.equal(children.length, 3, "transient [open, LB, close] layout");

    // A second Backspace at the close-fence-line start in this transient
    // layout finds only the open fence above it: no LB to drop, no content
    // to merge into. The caret slides up to the empty line / open fence
    // area; the block layout is left unchanged.
    moveCursorToCloseFenceLineStart();
    pw("press", "Backspace");
    children = getCodeBlockChildrenSummary();
    assert.equal(children.length, 3, "block layout unchanged");
    assert.equal(children[0].text, "```js");
    assert.equal(children[1].kind, "br");
    assert.equal(children[2].text, "```");
    // The caret should no longer be inside the close fence. Lexical
    // materializes the element-type anchor by parking the DOM caret in the
    // open fence area, so we assert "moved out of the close fence" rather
    // than a specific offset.
    const cursor = getCursorInfo();
    assert.notEqual(cursor.text, "```", "caret left the close fence span");
  });
});

describe("exit keys", () => {
  test("Escape inserts a paragraph after the block and focuses it", async () => {
    await resetEditor();
    pw("type", "```js");
    pw("press", "Enter");
    pw("type", "alpha");
    pw("press", "Escape");
    const html = getEditorHtml();
    assert.match(
      html,
      /<\/pre><p class="mb-2"[^>]*><br><\/p>/,
      "trailing empty paragraph follows the block",
    );
    const cursor = getCursorInfo();
    // Lexical lands the caret on the new empty paragraph; an empty <p>
    // renders as `<p><br></p>` and the selection anchor points at the <p>
    // element itself (not the <br>).
    assert.equal(cursor.nodeName, "P");
  });

  test("ArrowDown from last line exits to a new paragraph below", async () => {
    await resetEditor();
    pw("type", "```js");
    pw("press", "Enter");
    pw("type", "alpha");
    // Move caret to the close fence line (last position in the block).
    moveCursorToCloseFenceLineStart();
    pw("press", "End");
    pw("press", "ArrowDown");
    const html = getEditorHtml();
    assert.match(html, /<\/pre><p class="mb-2"[^>]*><br><\/p>/);
  });
});

// The validation listener (useCodeBlockValidationOnBlur) runs whenever the
// caret leaves a code block — not on DOM blur. Escape is the simplest
// trigger that also surfaces canonical/unwrap behavior.
describe("validation on exit", () => {
  test("canonical structure is preserved across exit", async () => {
    await resetEditor();
    pw("type", "```js");
    pw("press", "Enter");
    pw("type", "alpha");
    const beforeBlock = getCodeBlockChildrenSummary();
    pw("press", "Escape");
    assert.equal(getCodeBlockCount(), 1);
    const afterBlock = getCodeBlockChildrenSummary();
    // [openFence, BR, content, BR, closeFence] preserved across exit.
    assert.equal(afterBlock.length, 5);
    assert.equal(afterBlock[0].text, "```js");
    assert.equal(afterBlock[4].text, "```");
    // The text content of the middle line is preserved (Prism may have
    // split it into multiple token spans on exit, so compare on flat text).
    const beforeText = beforeBlock
      .filter((c) => c.kind === "span")
      .map((c) => c.text)
      .join("");
    const afterText = afterBlock
      .filter((c) => c.kind === "span")
      .map((c) => c.text)
      .join("");
    assert.equal(afterText, beforeText);
  });

  test("broken close fence unwraps on exit", async () => {
    await resetEditor();
    pw("type", "```js");
    pw("press", "Enter");
    pw("type", "alpha");
    // Drive corruption through the keyboard so Lexical's selection model
    // stays in sync: append text past the close fence so the close fence
    // becomes "```BROKEN" (rejected by isCloseFence).
    moveCursorToCloseFenceLineStart();
    pw("press", "End");
    pw("type", "BROKEN");
    assert.match(getCodeBlock(), /```BROKEN/);
    pw("press", "Escape");
    assert.equal(getCodeBlockCount(), 0, "block was unwrapped");
    assert.deepEqual(getParagraphTexts(), ["```js", "alpha", "```BROKEN", ""]);
  });
});

describe("always-show-fences toggle", () => {
  test("toggling the checkbox adds/removes the class", async () => {
    await resetEditor();
    pw("type", "```js");
    pw("press", "Enter");
    const wrapperSelector =
      "() => !!document.querySelector('.always-show-fences')";
    assert.equal(pwEval(wrapperSelector), false);
    pw("click", "input[type=checkbox]");
    assert.equal(pwEval(wrapperSelector), true);
    pw("click", "input[type=checkbox]");
    assert.equal(pwEval(wrapperSelector), false);
  });
});

// HTML <pre> paste conversion: drives a synthetic ClipboardEvent at the
// contenteditable. Skipped by default since the synthetic event path can be
// flaky under playwright-cli; enable with E2E_PASTE=1.
describe("html <pre> paste", { skip: !process.env.E2E_PASTE }, () => {
  test("pasting <pre> converts to a code block", async () => {
    await resetEditor();
    pwEval(
      `() => {
        const editor = document.querySelector('[contenteditable=true]');
        const data = new DataTransfer();
        data.setData('text/html', '<pre><code class="language-js">const y = 2;</code></pre>');
        const ev = new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true });
        editor.focus();
        editor.dispatchEvent(ev);
        return true;
      }`,
    );
    assert.equal(getCodeBlockCount(), 1);
    assert.equal(getCodeBlockAttr("data-language"), "js");
  });
});
