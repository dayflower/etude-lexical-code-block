# Architecture

This is a React + Lexical rich text editor etude implementing Markdown-style fenced code blocks (` ```lang … ``` `) with live Prism.js syntax highlighting. The build outputs to `docs/` for GitHub Pages deployment.

## Editor structure

`Editor.tsx` sets up a `LexicalComposer` with a dual-panel layout (rich editor left, Markdown source preview right) and an "always show fences" toggle. The custom plugins are:

- **`MarkdownCodeBlockPlugin`** — structural plugin that creates, reassembles, validates, and exits code blocks (six hooks, see below)
- **`CodeHighlightingPlugin`** — runs Prism.js over the block contents and reconciles the highlight node tree
- **`MarkdownPreviewPlugin`** — serializes the editor state back to Markdown for the right-hand preview
- **`editorConfig.ts`** — registers custom nodes, the Lexical theme (token CSS classes), and initial state

## Custom node types (`MarkdownCodeBlockNode.tsx`)

- **`MarkdownCodeBlockNode`** (`ElementNode`) — renders as `<pre>` and stores `__language`. The expected child layout is

      [ openFence, LineBreak, …middle…, LineBreak, closeFence ]

  where *middle* is a sequence of `CodeHighlightNode`s (from `@lexical/code-core`) separated by `LineBreakNode`s.
- **`MarkdownCodeFenceNode`** (`TextNode` subclass) — the literal `` ```lang `` and `` ``` `` markers. Visually muted via CSS until the block is focused.
- **`importDOM`** — converts pasted `<pre><code class="language-…">…</code></pre>` HTML into the block structure, detecting the language from `data-language`, `language-*` classes, or ancestor markup.

## `MarkdownCodeBlockPlugin` hooks (`MarkdownCodeBlockPlugin.tsx`)

1. **`useInsertParagraphBehavior`** — intercepts `INSERT_PARAGRAPH_COMMAND`; when the current paragraph text matches `` ```lang ``, replaces it with a fresh code block. Also handles Enter on the open/close fence lines to exit above/below the block.
2. **`useReassembleCodeBlock`** — node transform on both `ParagraphNode` and `TextNode`; scans siblings for matching open/close fence paragraphs and fuses them into a single `MarkdownCodeBlockNode`. Runs in both directions (forward from an open fence, backward from a close fence) so the pair is found regardless of typing order.
3. **`useEscapeKeyBehavior`** — Escape jumps the cursor to the next sibling element (or inserts a new paragraph after the block).
4. **`useArrowKeyExitBehavior`** — ArrowRight / ArrowDown on the close-fence line moves out to the following block; ArrowLeft / ArrowUp on the open-fence line moves out above.
5. **`useSelectionFocusTracking`** — toggles the `.is-focused` class, and on blur validates the block: invalid layouts are unwrapped back to paragraphs, valid ones are re-normalized.
6. **`useRemoveEmptyCodeBlock`** — garbage-collects code blocks whose children have all been deleted.

## `CodeHighlightingPlugin` (`CodeHighlightingPlugin.tsx`)

- Extracts the middle text of a `MarkdownCodeBlockNode`, resolves a language alias (`js → javascript`, `ts → typescript`, `py → python`, …), and runs `Prism.tokenize`.
- Flattens Prism's nested token tree into a linear `[{ kind: "linebreak" } | { kind: "text", type, text }]` sequence, with at least one leading line break so an empty block still has an editable middle line.
- Diffs the expected sequence against the existing middle children; if they differ, rebuilds the middle. Cursor position is captured beforehand as a character offset within the flat code text and restored afterwards, so re-tokenization on every keystroke does not move the caret.

## CSS-driven visual modes

The fence-visibility behaviour is entirely CSS-driven via class names centralized in `constants.ts`:

- **Default**: `.markdown-code-fence` text is `color: transparent`, hiding the `` ``` `` markers in finished blocks.
- **Focused** (`.markdown-code-block.is-focused`): fences become visible so the user can edit them.
- **Always-show-fences** (`.always-show-fences`): renders fences in a muted slate colour at all times, even when not focused.

Token colours come from the Lexical theme (`editorConfig.ts`), mapped to standard Prism `.token.<type>` classes.

## Implementation notes

Areas that required more than a straight Lexical mapping:

- **Detecting fence input.** The plugin does not parse on every keystroke; instead it listens for `INSERT_PARAGRAPH_COMMAND` and matches the paragraph against `` /^```([a-zA-Z0-9_+-]*)\s*$/ ``. This keeps the hot path cheap and avoids false positives mid-line.
- **Reassembling fragmented blocks.** Users can type the close fence first, paste fences on separate lines, or delete characters that break a block. Two complementary node transforms (forward-scan from an open fence, backward-scan from a close fence) handle every ordering. Registering the transform on `TextNode` as well as `ParagraphNode` was necessary because plain text mutations inside a paragraph do not fire a paragraph transform on their own.
- **Preserving the cursor across re-tokenization.** Prism produces a fresh token tree on every edit, so naively swapping the middle children loses the selection. `getOffsetInBlock` / `setOffsetInBlock` translate the caret to a flat character offset before the rebuild and back into the new tree afterwards. The "set" side also has to nudge the caret off `LineBreakNode` boundaries onto a neighbouring text node so the resulting position is always a valid text selection.
- **Keeping an editable empty line.** The expected child sequence always starts with a `LineBreakNode`, even when the code text is empty, so a freshly created or fully cleared block still has a middle line the user can type into. Without this, the trailing-fence-exit logic has nowhere to land the cursor.
- **Distinguishing "on the close fence line".** ArrowDown / ArrowRight should escape the block only when the caret is on the last line. `$isCursorOnCloseFenceLine` walks forward from the current node and returns true iff no `LineBreakNode` is encountered before the close fence — a structural check that works regardless of where in that line the caret sits.
- **Validation on blur.** If the user breaks a block (e.g. deletes the close fence), the structure is no longer a valid code block. `useSelectionFocusTracking` checks the layout when the selection leaves the block and unwraps it into plain paragraphs rather than leaving a malformed node in the tree.
- **Block deletion.** Deleting all middle content can leave an empty `MarkdownCodeBlockNode`. A dedicated transform removes such empty shells so the document does not accumulate ghost blocks.
