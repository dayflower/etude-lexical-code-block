import {
  $createParagraphNode,
  $createTextNode,
  $isLineBreakNode,
  type LexicalNode,
  type ParagraphNode,
  type PointType,
} from "lexical";
import {
  $appendCodeBlockChildren,
  $isMarkdownCodeBlockNode,
  $isMarkdownCodeFenceNode,
  FIRST_CONTENT_LINE_CHILD_INDEX,
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

export function $extractValidCodeBlockInfo(
  codeBlock: MarkdownCodeBlockNode,
): { language: string } | null {
  const first = codeBlock.getFirstChild();
  const last = codeBlock.getLastChild();
  if (!$isMarkdownCodeFenceNode(first) || !$isMarkdownCodeFenceNode(last)) {
    return null;
  }
  const parsedOpen = parseOpenFence(first.getTextContent());
  if (!parsedOpen) return null;
  if (!isCloseFence(last.getTextContent())) return null;
  // The close fence must sit on its own line. The "merged" transient state
  // (no LB between last content and close fence) is allowed while focused but
  // is not a persistable layout — let the caller unwrap it on blur.
  if (!$isLineBreakNode(last.getPreviousSibling())) return null;
  return { language: parsedOpen.language };
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

// Replace `node` with one paragraph per "\n"-separated line of `text`. Empty
// lines become empty paragraphs; non-empty lines get a single TextNode child.
// Returns the newly inserted paragraphs in document order.
export function $replaceWithParagraphsPerLine(
  node: LexicalNode,
  text: string,
): ParagraphNode[] {
  const lines = text.split("\n");
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
  $replaceWithParagraphsPerLine(codeBlock, codeBlock.getTextContent());
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

// Canonical child layout is [openFence, LB(sep), firstContent, ...]. The
// "very start of the first content line" sits just after the separator LB,
// either as an element-type anchor on the block at offset 2 (empty first
// line) or as a text-type anchor at offset 0 of the first content child.
export function $isCursorAtFirstContentLineStart(
  anchor: PointType,
  codeBlock: MarkdownCodeBlockNode,
): boolean {
  const anchorNode = anchor.getNode();

  if (anchorNode.is(codeBlock)) {
    return anchor.offset === FIRST_CONTENT_LINE_CHILD_INDEX;
  }

  if (anchor.offset !== 0) return false;
  const firstContent = codeBlock.getChildAtIndex(
    FIRST_CONTENT_LINE_CHILD_INDEX,
  );
  return firstContent !== null && anchorNode.is(firstContent);
}

// Mirror of $isCursorAtFirstContentLineStart for the opposite end. The "very
// start of the close fence line" sits just before the closeFence, either as an
// element-type anchor on the block at offset (childrenSize - 1) or as a
// text-type anchor at offset 0 of the close fence.
export function $isCursorAtCloseFenceLineStart(
  anchor: PointType,
  codeBlock: MarkdownCodeBlockNode,
  closeFence: LexicalNode,
): boolean {
  const anchorNode = anchor.getNode();
  if (anchorNode.is(closeFence)) return anchor.offset === 0;
  if (anchorNode.is(codeBlock)) {
    return anchor.offset === codeBlock.getChildrenSize() - 1;
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
