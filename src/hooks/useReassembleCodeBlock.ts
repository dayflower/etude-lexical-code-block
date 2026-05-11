import {
  $isParagraphNode,
  type LexicalEditor,
  type LexicalNode,
  ParagraphNode,
  TextNode,
} from "lexical";
import { useEffect } from "react";
import { OPEN_FENCE_REGEX } from "../codeBlockOps";
import {
  $appendCodeBlockChildren,
  $createMarkdownCodeBlockNode,
  $isMarkdownCodeFenceNode,
} from "../MarkdownCodeBlockNode";

function $buildCodeBlockFromParagraphs(
  openParagraph: ParagraphNode,
  middleParagraphs: ParagraphNode[],
  closeParagraph: ParagraphNode,
  language: string,
): void {
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

  const closeFenceNode = codeBlock.getLastChild();
  if ($isMarkdownCodeFenceNode(closeFenceNode)) {
    closeFenceNode.select(closeFenceText.length, closeFenceText.length);
  }
}

function $tryReassembleFromClose(paragraph: ParagraphNode): boolean {
  if (!OPEN_FENCE_REGEX.test(paragraph.getTextContent())) return false;

  const middles: ParagraphNode[] = [];
  let cursor: LexicalNode | null = paragraph.getPreviousSibling();
  while (cursor) {
    if (!$isParagraphNode(cursor)) return false;
    const match = OPEN_FENCE_REGEX.exec(cursor.getTextContent());
    if (match) {
      const language = match[1] ?? "";
      middles.reverse();
      $buildCodeBlockFromParagraphs(cursor, middles, paragraph, language);
      return true;
    }
    middles.push(cursor);
    cursor = cursor.getPreviousSibling();
  }
  return false;
}

function $tryReassembleFromOpen(paragraph: ParagraphNode): boolean {
  const match = OPEN_FENCE_REGEX.exec(paragraph.getTextContent());
  if (!match) return false;
  const language = match[1] ?? "";

  const middles: ParagraphNode[] = [];
  let cursor: LexicalNode | null = paragraph.getNextSibling();
  while (cursor) {
    if (!$isParagraphNode(cursor)) return false;
    if (OPEN_FENCE_REGEX.test(cursor.getTextContent())) {
      $buildCodeBlockFromParagraphs(paragraph, middles, cursor, language);
      return true;
    }
    middles.push(cursor);
    cursor = cursor.getNextSibling();
  }
  return false;
}

export function useReassembleCodeBlock(editor: LexicalEditor): void {
  useEffect(() => {
    const $reassembleAtParagraph = (paragraph: ParagraphNode) => {
      if ($tryReassembleFromClose(paragraph)) return;
      $tryReassembleFromOpen(paragraph);
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
