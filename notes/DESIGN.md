# Architecture

This is a React + Lexical rich text editor etude implementing Markdown-style fenced code blocks (` ```lang … ``` `) with live Prism.js syntax highlighting. The build outputs to `docs/` for GitHub Pages deployment.

## Editor structure

`Editor.tsx` sets up a `LexicalComposer` with a dual-panel layout (rich editor left, Markdown source preview right) and an "always show fences" toggle. The custom plugins are:

- **`MarkdownCodeBlockPlugin`** — a thin wrapper that composes the hooks in `src/hooks/` (see below) with shared operations from `src/codeBlockOps.ts`. The hooks cover creation, reassembly, navigation, Backspace handling, validation, and garbage collection of code blocks.
- **`CodeHighlightingPlugin`** — runs Prism.js over the block contents and reconciles the highlight node tree
- **`MarkdownPreviewPlugin`** — serializes the editor state back to Markdown for the right-hand preview
- **`editorConfig.ts`** — registers custom nodes, the Lexical theme (token CSS classes), and initial state

`codeBlockOps.ts` centralizes the structural primitives reused across the hooks: `$findNearestMarkdownCodeBlockNode`, `$extractValidCodeBlockInfo`, `$normalizeCodeBlock`, `$unwrapMarkdownCodeBlockNode`, `$exitCodeBlockBefore` / `$exitCodeBlockAfter`, the fence regexes (`OPEN_FENCE_REGEX`, `CLOSE_FENCE_REGEX`), and a family of caret-position predicates (`$isCursorAtCodeBlockStart`, `$isCursorAtCodeBlockEnd`, `$isCursorAtFirstContentLineStart`, `$isCursorAtCloseFenceLineStart`, `$isCursorOnCloseFenceLine`).

## Custom node types (`MarkdownCodeBlockNode.tsx`)

- **`MarkdownCodeBlockNode`** (`ElementNode`) — renders as `<pre>` and stores `__language`. The expected child layout is

      [ openFence, LineBreak, …middle…, LineBreak, closeFence ]

  where *middle* is a sequence of `CodeHighlightNode`s (from `@lexical/code-core`) separated by `LineBreakNode`s. The node exposes `getCodeText()`, which walks the middle children and returns the joined source text (or `null` when the surrounding fences are missing). It also tolerates the transient "close fence merged onto the last content line" layout (no trailing LB before the close fence) so callers can read the text during Backspace-induced merges. A shared `$appendCodeBlockChildren(block, openText, codeLines, closeText)` helper constructs the canonical layout and is reused by `importDOM`, reassembly, and normalization paths.
- **`MarkdownCodeFenceNode`** (`TextNode` subclass) — the literal `` ```lang `` and `` ``` `` markers. Visually muted via CSS until the block is focused.
- **`importDOM`** — converts pasted `<pre><code class="language-…">…</code></pre>` HTML into the block structure, detecting the language from `data-language`, `language-*` classes, or ancestor markup.

## `MarkdownCodeBlockPlugin` hooks (`src/hooks/`)

`MarkdownCodeBlockPlugin.tsx` is a 20-line wrapper that wires the following hooks (each in its own file under `src/hooks/`) onto the editor instance:

1. **`useInsertParagraphBehavior`** (`useInsertParagraphBehavior.ts`) — intercepts `INSERT_PARAGRAPH_COMMAND`; when the current paragraph text matches `` ```lang ``, replaces it with a fresh code block. Also handles Enter on the open/close fence lines to exit above/below the block.
2. **`useReassembleCodeBlock`** (`useReassembleCodeBlock.ts`) — node transform on both `ParagraphNode` and `TextNode`; scans siblings for matching open/close fence paragraphs and fuses them into a single `MarkdownCodeBlockNode`. Runs in both directions (forward from an open fence via `$tryReassembleAsOpenFence`, backward from a close fence via `$tryReassembleAsCloseFence`) so the pair is found regardless of typing order. Also recovers from the "dissolved-then-split" state — see Implementation notes.
3. **`useEscapeKeyBehavior`** (`useEscapeKeyBehavior.ts`) — Escape jumps the cursor to the next sibling element (or inserts a new paragraph after the block).
4. **`useArrowKeyExitBehavior`** (`useArrowKeyExitBehavior.ts`) — ArrowRight / ArrowDown on the close-fence line moves out to the following block; ArrowLeft / ArrowUp on the open-fence line moves out above.
5. **`useBackspaceKeyBehavior`** (`useBackspaceKeyBehavior.ts`) — handles `KEY_BACKSPACE_COMMAND` for three boundary cases inside a code block:
   - **At the very start of the block**: if the preceding sibling is an empty paragraph, remove it so the block survives (Lexical's default would dissolve the block by merging the open fence into the previous paragraph). When the preceding sibling is a non-empty paragraph, dissolve the block ourselves through `$dissolveCodeBlockMergingIntoPrev` — it unwraps the block into plain paragraphs via `$replaceWithParagraphsPerLine` and moves the first row's children into the preceding paragraph, so the merged text drops the `MarkdownCodeFenceNode` / `CodeHighlightNode` types (and their CSS classes) instead of keeping them as Lexical's default merge would. `useReassembleCodeBlock` still rebuilds the block on the next split.
   - **At the start of the first content line**: merge that line's text into the open fence (e.g. `` ```ts `` + `foo` → `` ```tsfoo ``). The fence text is re-matched against `OPEN_FENCE_REGEX` and the block's `__language` is updated.
   - **At the start of the close-fence line**: drop the LB before the close fence so the close fence sits on the same visual line as the last content. This is a transient layout — `$extractValidCodeBlockInfo` rejects it, so `useCodeBlockValidationOnBlur` unwraps the block on blur.
6. **`useCodeBlockFocusClass`** (`useCodeBlockFocusClass.ts`) — toggles the `.is-focused` class on the code block whose selection currently covers it.
7. **`useCodeBlockValidationOnBlur`** (`useCodeBlockValidationOnBlur.ts`) — on blur validates the previously focused block: invalid layouts are unwrapped back to paragraphs, valid ones are re-normalized via `$normalizeCodeBlock`. Both hooks share `$collectFocusedCodeBlockKeys` (`focusedCodeBlockKeys.ts`) to derive the focused-block key set from the current selection.
8. **`useRemoveEmptyCodeBlock`** (`useRemoveEmptyCodeBlock.ts`) — garbage-collects code blocks whose children have all been deleted.

## `CodeHighlightingPlugin` (`CodeHighlightingPlugin.tsx`)

- Reads the middle text of a `MarkdownCodeBlockNode` via `getCodeText()`, resolves a language alias (`js → javascript`, `ts → typescript`, `py → python`, …), and runs `Prism.tokenize`.
- Flattens Prism's nested token tree into a linear `[{ kind: "linebreak" } | { kind: "highlight", text, highlightType }]` sequence, with at least one leading line break so an empty block still has an editable middle line.
- Inspects whether the close fence's previous sibling is a `LineBreakNode` and passes that as `trailingLineBreak` to `expectedChildrenFromCodeText`. When the close fence has been merged onto the last content line (the transient Backspace state above), the final LB is omitted so the rebuild does not silently re-canonicalize that layout.
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
- **Preserving the cursor across re-tokenization.** Prism produces a fresh token tree on every edit, so naively swapping the middle children loses the selection. `getOffsetInBlock` / `setOffsetInBlock` translate the caret to a flat character offset before the rebuild and back into the new tree afterwards. The "get" side accepts both text-type and element-type selections (the latter is what Lexical leaves behind after `$insertLineBreak` when the new LB's next sibling is not a text node). The "set" side prefers landing the caret on a neighbouring content `TextNode` so the result is a valid text selection, but falls back to an element-type selection on the block itself when the boundary is adjacent only to another LB (an empty line) or to a fence — those positions are not valid text anchors.
- **Keeping an editable empty line.** The expected child sequence always starts with a `LineBreakNode`, even when the code text is empty, so a freshly created or fully cleared block still has a middle line the user can type into. Without this, the trailing-fence-exit logic has nowhere to land the cursor.
- **Distinguishing "on the close fence line".** ArrowDown / ArrowRight should escape the block only when the caret is on the last line. `$isCursorOnCloseFenceLine` walks forward from the current node and returns true iff no `LineBreakNode` is encountered before the close fence — a structural check that works regardless of where in that line the caret sits.
- **Validation on blur.** If the user breaks a block (e.g. deletes the close fence), the structure is no longer a valid code block. `useCodeBlockValidationOnBlur` checks the layout when the selection leaves the block and unwraps it into plain paragraphs rather than leaving a malformed node in the tree.
- **Block deletion.** Deleting all middle content can leave an empty `MarkdownCodeBlockNode`. A dedicated transform removes such empty shells so the document does not accumulate ghost blocks.
- **Backspace at block boundaries.** Lexical's default Backspace dissolves the block when the caret is at its very start, and collapses the line above when the caret is at a line start. Neither default is right for a fenced block, so `useBackspaceKeyBehavior` intercepts three boundaries. At the block start it splits into two sub-cases by the preceding sibling: an empty paragraph is removed so the block survives, while a non-empty paragraph triggers an explicit dissolve that goes through plain `ParagraphNode` / `TextNode` rows (so the merged-in text does not inherit the `MarkdownCodeFenceNode` / `CodeHighlightNode` types and their CSS classes — falling through to Lexical's default merge would have left those classes stuck on text outside any code block). At the first content line it folds the line back into the open fence (re-extracting the language from the merged text); at the close fence line it joins the close fence with the last content line. The last case intentionally yields a layout that `$extractValidCodeBlockInfo` rejects — it is allowed to exist only while the caret is inside the block, and `useCodeBlockValidationOnBlur` unwraps it on blur. `CodeHighlightingPlugin` carries a `trailingLineBreak` flag through the rebuild so this transient state is preserved instead of being re-canonicalized.
- **Dissolved-then-split recovery.** A code block can end up dissolved into a single paragraph containing both fences and the middle content separated by internal `LineBreakNode`s — e.g. when Backspace falls through to Lexical's default because the block has no previous sibling (or a non-paragraph sibling) to handle ourselves, or when external edits produce a similar shape. If the user then presses Enter inside this paragraph, the split point would otherwise produce two paragraphs that no longer match the fence-pair scan. `useReassembleCodeBlock` detects a paragraph whose first line matches `OPEN_FENCE_REGEX` and which contains internal LBs, splits it into one paragraph per line with `$splitParagraphAtLineBreaks`, and then feeds the resulting head paragraph back through the normal fence-pair scan — so the code block re-forms on the next edit.
