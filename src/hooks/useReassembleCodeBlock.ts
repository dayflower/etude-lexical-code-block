import {
  $getSelection,
  $isLineBreakNode,
  $isParagraphNode,
  $isRangeSelection,
  $isTextNode,
  type LexicalEditor,
  type LexicalNode,
  ParagraphNode,
  TextNode,
} from "lexical";
import { useEffect } from "react";
import {
  $replaceWithParagraphsPerLine,
  isCloseFence,
  parseOpenFence,
} from "../codeBlockOps";
import {
  $appendCodeBlockChildren,
  $createMarkdownCodeBlockNode,
  type MarkdownCodeBlockNode,
} from "../MarkdownCodeBlockNode";

// Where the caret was sitting among the paragraphs being fused into a code
// block. Captured before the reassembly so we can drop the caret back at the
// equivalent position inside the new block (e.g. user just typed the third
// backtick into the open fence — caret should remain on the open fence, not
// jump to the close fence's end as the legacy default did).
type ReassembleCaretSource =
  | { kind: "open"; offset: number }
  | { kind: "middle"; lineIndex: number; offset: number }
  | { kind: "close"; offset: number };

function $captureCaretForReassembly(
  openParagraph: ParagraphNode,
  middleParagraphs: ParagraphNode[],
  closeParagraph: ParagraphNode,
): ReassembleCaretSource | null {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return null;
  const anchor = selection.anchor;
  const paragraph = $findParagraphAncestor(anchor.getNode());
  if (!paragraph) return null;
  const offset = $flatOffsetInParagraph(
    paragraph,
    anchor.getNode(),
    anchor.offset,
    anchor.type,
  );
  if (paragraph.is(openParagraph)) return { kind: "open", offset };
  if (paragraph.is(closeParagraph)) return { kind: "close", offset };
  for (let i = 0; i < middleParagraphs.length; i++) {
    if (paragraph.is(middleParagraphs[i])) {
      return { kind: "middle", lineIndex: i, offset };
    }
  }
  return null;
}

function $findParagraphAncestor(node: LexicalNode): ParagraphNode | null {
  let cur: LexicalNode | null = node;
  while (cur) {
    if ($isParagraphNode(cur)) return cur;
    cur = cur.getParent();
  }
  return null;
}

// Flatten an in-paragraph anchor (text- or element-type) to a single character
// offset within the paragraph's concatenated text. Paragraphs may have
// multiple text children (e.g. formatting runs) so a simple `anchor.offset`
// isn't sufficient.
function $flatOffsetInParagraph(
  paragraph: ParagraphNode,
  anchorNode: LexicalNode,
  anchorOffset: number,
  anchorType: "text" | "element",
): number {
  if (anchorType === "element" && anchorNode === paragraph) {
    let sum = 0;
    const children = paragraph.getChildren();
    const stop = Math.min(anchorOffset, children.length);
    for (let i = 0; i < stop; i++) sum += children[i].getTextContentSize();
    return sum;
  }
  if (anchorType === "text" && $isTextNode(anchorNode)) {
    let sum = anchorOffset;
    let cur: LexicalNode | null = anchorNode.getPreviousSibling();
    while (cur) {
      sum += cur.getTextContentSize();
      cur = cur.getPreviousSibling();
    }
    return sum;
  }
  return 0;
}

function $restoreCaretAfterReassembly(
  codeBlock: MarkdownCodeBlockNode,
  source: ReassembleCaretSource | null,
): boolean {
  if (!source) return false;
  if (source.kind === "open") {
    const fence = codeBlock.getOpenFence();
    if (!fence) return false;
    const safe = Math.min(source.offset, fence.getTextContentSize());
    fence.select(safe, safe);
    return true;
  }
  if (source.kind === "close") {
    const fence = codeBlock.getCloseFence();
    if (!fence) return false;
    const safe = Math.min(source.offset, fence.getTextContentSize());
    fence.select(safe, safe);
    return true;
  }
  // 'middle': locate the TextNode on the requested content line and land
  // there. An empty content line has no TextNode to anchor on — fall back to
  // the legacy close-fence-end default in that case.
  const children = codeBlock.getChildren();
  let line = -1;
  for (let i = 1; i < children.length - 1; i++) {
    const child = children[i];
    if ($isLineBreakNode(child)) {
      line++;
      continue;
    }
    if (line === source.lineIndex && $isTextNode(child)) {
      const safe = Math.min(source.offset, child.getTextContentSize());
      child.select(safe, safe);
      return true;
    }
  }
  return false;
}

function $buildCodeBlockFromParagraphs(
  openParagraph: ParagraphNode,
  middleParagraphs: ParagraphNode[],
  closeParagraph: ParagraphNode,
  language: string,
): void {
  const caretSource = $captureCaretForReassembly(
    openParagraph,
    middleParagraphs,
    closeParagraph,
  );

  const codeBlock = $createMarkdownCodeBlockNode(language);
  const closeFenceText = closeParagraph.getTextContent();
  $appendCodeBlockChildren(
    codeBlock,
    openParagraph.getTextContent(),
    middleParagraphs.map((p) => p.getTextContent()),
    closeFenceText,
  );

  openParagraph.replace(codeBlock);
  for (const mid of middleParagraphs) mid.remove();
  closeParagraph.remove();

  if ($restoreCaretAfterReassembly(codeBlock, caretSource)) return;

  // Fallback when the caret wasn't inside any of the fused paragraphs:
  // land at the close fence's end (legacy behavior).
  const closeFenceNode = codeBlock.getCloseFence();
  if (closeFenceNode) {
    closeFenceNode.select(closeFenceText.length, closeFenceText.length);
  }
}

function $tryReassembleAsCloseFence(paragraph: ParagraphNode): boolean {
  if (!isCloseFence(paragraph.getTextContent())) return false;

  const middles: ParagraphNode[] = [];
  let cursor: LexicalNode | null = paragraph.getPreviousSibling();
  while (cursor) {
    if (!$isParagraphNode(cursor)) return false;
    const parsed = parseOpenFence(cursor.getTextContent());
    if (parsed) {
      middles.reverse();
      $buildCodeBlockFromParagraphs(
        cursor,
        middles,
        paragraph,
        parsed.language,
      );
      return true;
    }
    middles.push(cursor);
    cursor = cursor.getPreviousSibling();
  }
  return false;
}

function $tryReassembleAsOpenFence(paragraph: ParagraphNode): boolean {
  const parsed = parseOpenFence(paragraph.getTextContent());
  if (!parsed) return false;
  const language = parsed.language;

  const middles: ParagraphNode[] = [];
  let cursor: LexicalNode | null = paragraph.getNextSibling();
  while (cursor) {
    if (!$isParagraphNode(cursor)) return false;
    if (isCloseFence(cursor.getTextContent())) {
      $buildCodeBlockFromParagraphs(paragraph, middles, cursor, language);
      return true;
    }
    middles.push(cursor);
    cursor = cursor.getNextSibling();
  }
  return false;
}

// Replace a paragraph that contains internal LineBreakNodes with one paragraph
// per line (by text content), returning the new paragraphs. Used to recover
// from dissolved code blocks where Lexical's default Backspace collapsed the
// fences and middle content into a single paragraph.
function $splitParagraphAtLineBreaks(
  paragraph: ParagraphNode,
): ParagraphNode[] {
  const text = paragraph.getTextContent();
  if (text.indexOf("\n") < 0) return [paragraph];
  return $replaceWithParagraphsPerLine(paragraph, text);
}

function $hasInternalLineBreak(paragraph: ParagraphNode): boolean {
  for (const child of paragraph.getChildren()) {
    if ($isLineBreakNode(child)) return true;
  }
  return false;
}

// A multi-line paragraph whose first line is a fence marker is the
// dissolved-then-split state produced when Backspace collapses the
// code block above a content paragraph and a later Enter splits the
// resulting blob. Break it into one paragraph per line so the regular
// fence-pair scan can pick it up. Returns true once this path has been
// taken (regardless of whether reassembly ultimately succeeds), so the
// caller does not fall through to the regular scan.
function $tryRecoverFromDissolvedBlock(paragraph: ParagraphNode): boolean {
  if (!$hasInternalLineBreak(paragraph)) return false;
  const firstLine = paragraph.getTextContent().split("\n", 1)[0];
  if (parseOpenFence(firstLine) === null) return false;

  const split = $splitParagraphAtLineBreaks(paragraph);
  const first = split[0];
  if (first) {
    // `first` is guaranteed to match an open fence by the guard above, so only
    // the open-fence forward scan is needed. When `first` is a bare ``` (an
    // open fence with no language), a later paragraph that also matches ```
    // satisfies the close-fence side, producing a single-line code block via
    // the open-fence path.
    $tryReassembleAsOpenFence(first);
  }
  return true;
}

export function useReassembleCodeBlock(editor: LexicalEditor): void {
  useEffect(() => {
    const $reassembleAtParagraph = (paragraph: ParagraphNode) => {
      if ($tryRecoverFromDissolvedBlock(paragraph)) return;
      if ($tryReassembleAsCloseFence(paragraph)) return;
      $tryReassembleAsOpenFence(paragraph);
    };

    const removeParagraph = editor.registerNodeTransform(
      ParagraphNode,
      $reassembleAtParagraph,
    );

    const removeText = editor.registerNodeTransform(TextNode, (textNode) => {
      const parent = textNode.getParent();
      if (!$isParagraphNode(parent)) return;
      $reassembleAtParagraph(parent);
    });

    return () => {
      removeParagraph();
      removeText();
    };
  }, [editor]);
}
