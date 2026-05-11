import {
  $createParagraphNode,
  $createTextNode,
  $isLineBreakNode,
  type LexicalNode,
  type PointType,
} from "lexical";
import {
  $appendCodeBlockChildren,
  $isMarkdownCodeBlockNode,
  $isMarkdownCodeFenceNode,
  type MarkdownCodeBlockNode,
} from "./MarkdownCodeBlockNode";

export const OPEN_FENCE_REGEX = /^```([a-zA-Z0-9_+-]*)\s*$/;
export const CLOSE_FENCE_REGEX = /^```\s*$/;

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

export function $extractValidCodeBlockInfo(
  codeBlock: MarkdownCodeBlockNode,
): { language: string } | null {
  const first = codeBlock.getFirstChild();
  const last = codeBlock.getLastChild();
  if (!$isMarkdownCodeFenceNode(first) || !$isMarkdownCodeFenceNode(last)) {
    return null;
  }
  const openMatch = OPEN_FENCE_REGEX.exec(first.getTextContent());
  if (!openMatch) return null;
  if (!CLOSE_FENCE_REGEX.test(last.getTextContent())) return null;
  return { language: openMatch[1] ?? "" };
}

export function $normalizeCodeBlock(
  codeBlock: MarkdownCodeBlockNode,
  language: string,
): void {
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

export function $unwrapMarkdownCodeBlockNode(
  codeBlock: MarkdownCodeBlockNode,
): void {
  const text = codeBlock.getTextContent();
  const lines = text.split("\n");
  let prev: LexicalNode = codeBlock;
  for (const line of lines) {
    const paragraph = $createParagraphNode();
    if (line.length > 0) {
      paragraph.append($createTextNode(line));
    }
    prev.insertAfter(paragraph);
    prev = paragraph;
  }
  codeBlock.remove();
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

export function $isCursorAtCodeBlockStart(
  anchor: PointType,
  codeBlock: MarkdownCodeBlockNode,
  openFence: LexicalNode,
): boolean {
  const anchorNode = anchor.getNode();
  if (anchorNode.is(openFence)) return anchor.offset === 0;
  if (anchorNode.is(codeBlock)) return anchor.offset === 0;
  return false;
}

export function $isCursorAtCodeBlockEnd(
  anchor: PointType,
  codeBlock: MarkdownCodeBlockNode,
  closeFence: LexicalNode,
): boolean {
  const anchorNode = anchor.getNode();
  if (anchorNode.is(closeFence)) {
    return anchor.offset === anchorNode.getTextContentSize();
  }
  if (anchorNode.is(codeBlock)) {
    return anchor.offset >= codeBlock.getChildrenSize();
  }
  return false;
}

export function $isCursorOnCloseFenceLine(
  anchor: PointType,
  codeBlock: MarkdownCodeBlockNode,
  closeFence: LexicalNode,
): boolean {
  const anchorNode = anchor.getNode();
  if (anchorNode.is(closeFence)) return true;

  let scan: LexicalNode | null;
  if (anchorNode.is(codeBlock)) {
    if (anchor.offset >= codeBlock.getChildrenSize()) return true;
    scan = codeBlock.getChildAtIndex(anchor.offset);
  } else if (anchorNode.getParent()?.is(codeBlock)) {
    scan = anchorNode.getNextSibling();
  } else {
    return false;
  }

  while (scan && !scan.is(closeFence)) {
    if ($isLineBreakNode(scan)) return false;
    scan = scan.getNextSibling();
  }
  return scan?.is(closeFence) ?? false;
}
