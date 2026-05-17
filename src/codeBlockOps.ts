import {
  $createParagraphNode,
  $createTextNode,
  $getSelection,
  $isRangeSelection,
  type LexicalNode,
  type ParagraphNode,
  type PointType,
} from "lexical";
import {
  $appendCodeBlockChildren,
  $isMarkdownCodeBlockNode,
  type MarkdownCodeBlockNode,
} from "./MarkdownCodeBlockNode";

const OPEN_FENCE_REGEX = /^```([a-zA-Z0-9_+-]*)\s*$/;
const CLOSE_FENCE_REGEX = /^```\s*$/;

export function parseOpenFence(text: string): { language: string } | null {
  const match = OPEN_FENCE_REGEX.exec(text);
  if (!match) return null;
  return { language: match[1] ?? "" };
}

export function isCloseFence(text: string): boolean {
  return CLOSE_FENCE_REGEX.test(text);
}

export function $findNearestMarkdownCodeBlockNode(
  node: LexicalNode | null,
): MarkdownCodeBlockNode | null {
  let current: LexicalNode | null = node;
  while (current) {
    if ($isMarkdownCodeBlockNode(current)) return current;
    current = current.getParent();
  }
  return null;
}

export function $getCollapsedCaretInCodeBlock(): {
  anchor: PointType;
  codeBlock: MarkdownCodeBlockNode;
} | null {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return null;
  const anchor = selection.anchor;
  const codeBlock = $findNearestMarkdownCodeBlockNode(anchor.getNode());
  if (!codeBlock) return null;
  return { anchor, codeBlock };
}

export function $extractValidCodeBlockInfo(
  codeBlock: MarkdownCodeBlockNode,
): { language: string } | null {
  const open = codeBlock.getOpenFence();
  const close = codeBlock.getCloseFence();
  if (!open || !close) return null;
  const parsedOpen = parseOpenFence(open.getTextContent());
  if (!parsedOpen) return null;
  if (!isCloseFence(close.getTextContent())) return null;
  // The "merged" transient states (close fence on the last content line, or
  // close fence sharing the only separator LB with no trailing LB) are not
  // persistable layouts but the block itself is still valid. We let
  // `$normalizeCodeBlock` rebuild them to canonical on blur rather than
  // unwrapping — unwrap would split the fences into separate paragraphs the
  // reassembly transform cannot re-pair (e.g. "abc```" is not a close fence),
  // trapping the cursor back inside a re-created block on blur.
  return { language: parsedOpen.language };
}

export function $normalizeCodeBlock(
  codeBlock: MarkdownCodeBlockNode,
  language: string,
): void {
  // Always rebuild as the canonical layout (trailing LB before close fence),
  // regardless of `codeBlock.hasTrailingLineBreak()`. This collapses the
  // transient "close fence merged" state on blur — preserving the merged
  // state across focus loss is not desired, so we intentionally do not
  // consult the predicate here.
  const codeText = codeBlock.getCodeText() ?? "";
  const codeLines = codeText.split("\n");
  const openFenceText =
    codeBlock.getFirstChild()?.getTextContent() ?? `\`\`\`${language}`;
  const closeFenceText = codeBlock.getLastChild()?.getTextContent() ?? "```";
  for (const child of codeBlock.getChildren()) {
    child.remove();
  }
  $appendCodeBlockChildren(codeBlock, openFenceText, codeLines, closeFenceText);
  if (codeBlock.getLanguage() !== language) {
    codeBlock.setLanguage(language);
  }
}

// Replace `node` with one paragraph per "\n"-separated line of `text`. Empty
// lines become empty paragraphs; non-empty lines get a single TextNode child.
// Returns the newly inserted paragraphs in document order.
export function $replaceWithParagraphsPerLine(
  node: LexicalNode,
  text?: string,
): ParagraphNode[] {
  const lines = (text ?? node.getTextContent()).split("\n");
  const created: ParagraphNode[] = [];
  let prev: LexicalNode = node;
  for (const line of lines) {
    const paragraph = $createParagraphNode();
    if (line.length > 0) {
      paragraph.append($createTextNode(line));
    }
    prev.insertAfter(paragraph);
    prev = paragraph;
    created.push(paragraph);
  }
  node.remove();
  return created;
}

export function $unwrapMarkdownCodeBlockNode(
  codeBlock: MarkdownCodeBlockNode,
): void {
  $replaceWithParagraphsPerLine(codeBlock);
}

export function $exitCodeBlockBefore(codeBlock: MarkdownCodeBlockNode): void {
  const paragraph = $createParagraphNode();
  codeBlock.insertBefore(paragraph);
  paragraph.select();
}

export function $exitCodeBlockAfter(codeBlock: MarkdownCodeBlockNode): void {
  const paragraph = $createParagraphNode();
  codeBlock.insertAfter(paragraph);
  paragraph.select();
}
