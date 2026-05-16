import {
  $createParagraphNode,
  $createTextNode,
  type LexicalNode,
  type ParagraphNode,
} from "lexical";
import {
  $appendCodeBlockChildren,
  $isMarkdownCodeBlockNode,
  $isMarkdownCodeFenceNode,
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
  if (!codeBlock.hasTrailingLineBreak()) return null;
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
