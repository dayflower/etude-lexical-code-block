import {
  $createParagraphNode,
  $createTextNode,
  $isLineBreakNode,
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

function $tryReassembleAsCloseFence(paragraph: ParagraphNode): boolean {
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

function $tryReassembleAsOpenFence(paragraph: ParagraphNode): boolean {
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

// Replace a paragraph that contains internal LineBreakNodes with one paragraph
// per line (by text content), returning the new paragraphs. Used to recover
// from dissolved code blocks where Lexical's default Backspace collapsed the
// fences and middle content into a single paragraph.
function $splitParagraphAtLineBreaks(
  paragraph: ParagraphNode,
): ParagraphNode[] {
  const text = paragraph.getTextContent();
  const lines = text.split("\n");
  if (lines.length <= 1) return [paragraph];

  const created: ParagraphNode[] = [];
  let prev: LexicalNode = paragraph;
  for (const line of lines) {
    const newPara = $createParagraphNode();
    if (line.length > 0) {
      newPara.append($createTextNode(line));
    }
    prev.insertAfter(newPara);
    prev = newPara;
    created.push(newPara);
  }
  paragraph.remove();
  return created;
}

function $hasInternalLineBreak(paragraph: ParagraphNode): boolean {
  for (const child of paragraph.getChildren()) {
    if ($isLineBreakNode(child)) return true;
  }
  return false;
}

export function useReassembleCodeBlock(editor: LexicalEditor): void {
  useEffect(() => {
    const $reassembleAtParagraph = (paragraph: ParagraphNode) => {
      // A multi-line paragraph whose first line is a fence marker is the
      // dissolved-then-split state produced when Backspace collapses the
      // code block above a content paragraph and a later Enter splits the
      // resulting blob. Break it into one paragraph per line so the regular
      // fence-pair scan below can pick it up.
      if ($hasInternalLineBreak(paragraph)) {
        const firstLine = paragraph.getTextContent().split("\n", 1)[0];
        if (OPEN_FENCE_REGEX.test(firstLine)) {
          const split = $splitParagraphAtLineBreaks(paragraph);
          const first = split[0];
          if (first) {
            if ($tryReassembleAsCloseFence(first)) return;
            $tryReassembleAsOpenFence(first);
          }
          return;
        }
      }

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
