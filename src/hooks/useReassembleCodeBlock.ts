import {
  $isLineBreakNode,
  $isParagraphNode,
  type LexicalEditor,
  type LexicalNode,
  ParagraphNode,
  TextNode,
} from "lexical";
import { useEffect } from "react";
import { $replaceWithParagraphsPerLine, parseOpenFence } from "../codeBlockOps";
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
  if (parseOpenFence(paragraph.getTextContent()) === null) return false;

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
    if (parseOpenFence(cursor.getTextContent()) !== null) {
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
        if (parseOpenFence(firstLine) !== null) {
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
