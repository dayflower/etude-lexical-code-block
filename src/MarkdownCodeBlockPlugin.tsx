import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $createParagraphNode,
  $createTextNode,
  $getNodeByKey,
  $getSelection,
  $isElementNode,
  $isLineBreakNode,
  $isParagraphNode,
  $isRangeSelection,
  $isTextNode,
  COMMAND_PRIORITY_HIGH,
  COMMAND_PRIORITY_LOW,
  INSERT_PARAGRAPH_COMMAND,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_RIGHT_COMMAND,
  KEY_ESCAPE_COMMAND,
  type LexicalEditor,
  type LexicalNode,
  ParagraphNode,
  type PointType,
  TextNode,
} from "lexical";
import { useEffect, useRef } from "react";
import { CSS_CLASSES } from "./constants";
import {
  $appendCodeBlockChildren,
  $createMarkdownCodeBlockNode,
  $isMarkdownCodeBlockNode,
  $isMarkdownCodeFenceNode,
  MarkdownCodeBlockNode,
} from "./MarkdownCodeBlockNode";

const OPEN_FENCE_REGEX = /^```([a-zA-Z0-9_+-]*)\s*$/;
const CLOSE_FENCE_REGEX = /^```\s*$/;

function $findNearestMarkdownCodeBlockNode(
  node: LexicalNode | null,
): MarkdownCodeBlockNode | null {
  let current: LexicalNode | null = node;
  while (current) {
    if ($isMarkdownCodeBlockNode(current)) return current;
    current = current.getParent();
  }
  return null;
}

function $extractValidCodeBlockInfo(
  codeBlock: MarkdownCodeBlockNode,
): { language: string } | null {
  const text = codeBlock.getTextContent();
  const lines = text.split("\n");
  if (lines.length < 2) return null;
  const openMatch = OPEN_FENCE_REGEX.exec(lines[0]);
  if (!openMatch) return null;
  if (!CLOSE_FENCE_REGEX.test(lines[lines.length - 1])) return null;
  return { language: openMatch[1] ?? "" };
}

function $normalizeCodeBlock(
  codeBlock: MarkdownCodeBlockNode,
  language: string,
): void {
  const lines = codeBlock.getTextContent().split("\n");
  for (const child of codeBlock.getChildren()) {
    child.remove();
  }
  $appendCodeBlockChildren(
    codeBlock,
    lines[0],
    lines.slice(1, -1),
    lines[lines.length - 1],
  );
  if (codeBlock.getLanguage() !== language) {
    codeBlock.setLanguage(language);
  }
}

function $unwrapMarkdownCodeBlockNode(codeBlock: MarkdownCodeBlockNode): void {
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

function $exitCodeBlockBefore(codeBlock: MarkdownCodeBlockNode): void {
  const paragraph = $createParagraphNode();
  codeBlock.insertBefore(paragraph);
  paragraph.select();
}

function $exitCodeBlockAfter(codeBlock: MarkdownCodeBlockNode): void {
  const paragraph = $createParagraphNode();
  codeBlock.insertAfter(paragraph);
  paragraph.select();
}

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

function useReassembleCodeBlock(editor: LexicalEditor): void {
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

function useRemoveEmptyCodeBlock(editor: LexicalEditor): void {
  useEffect(() => {
    const remove = editor.registerNodeTransform(
      MarkdownCodeBlockNode,
      (codeBlock) => {
        if (codeBlock.isEmpty()) {
          codeBlock.remove();
        }
      },
    );
    return () => {
      remove();
    };
  }, [editor]);
}

function useInsertParagraphBehavior(editor: LexicalEditor): void {
  useEffect(() => {
    const remove = editor.registerCommand(
      INSERT_PARAGRAPH_COMMAND,
      () => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection) || !selection.isCollapsed())
          return false;

        const anchor = selection.anchor;
        const anchorNode = anchor.getNode();

        const codeBlock = $findNearestMarkdownCodeBlockNode(anchorNode);
        if (codeBlock) {
          const openFence = codeBlock.getFirstChild();
          const closeFence = codeBlock.getLastChild();

          if (
            $isMarkdownCodeFenceNode(openFence) &&
            $isCursorAtCodeBlockStart(anchor, codeBlock, openFence)
          ) {
            $exitCodeBlockBefore(codeBlock);
            return true;
          }

          if (
            $isMarkdownCodeFenceNode(closeFence) &&
            $isCursorAtCodeBlockEnd(anchor, codeBlock, closeFence)
          ) {
            $exitCodeBlockAfter(codeBlock);
            return true;
          }

          selection.insertLineBreak();
          return true;
        }

        if (!$isTextNode(anchorNode)) return false;
        const parent = anchorNode.getParent();
        if (!$isParagraphNode(parent)) return false;
        if (anchor.offset !== anchorNode.getTextContentSize()) return false;

        const text = parent.getTextContent();
        const match = OPEN_FENCE_REGEX.exec(text);
        if (!match) return false;

        const language = match[1] ?? "";
        const codeBlockNode = $createMarkdownCodeBlockNode(language);
        $appendCodeBlockChildren(
          codeBlockNode,
          `\`\`\`${language}`,
          [""],
          "```",
        );
        parent.replace(codeBlockNode);
        codeBlockNode.select(2, 2);
        return true;
      },
      COMMAND_PRIORITY_LOW,
    );

    return () => {
      remove();
    };
  }, [editor]);
}

function useEscapeKeyBehavior(editor: LexicalEditor): void {
  useEffect(() => {
    const remove = editor.registerCommand(
      KEY_ESCAPE_COMMAND,
      (event) => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection) || !selection.isCollapsed())
          return false;

        const anchorNode = selection.anchor.getNode();
        const codeBlock = $findNearestMarkdownCodeBlockNode(anchorNode);
        if (!codeBlock) return false;

        event?.preventDefault();

        const next = codeBlock.getNextSibling();
        if ($isElementNode(next)) {
          next.selectStart();
        } else {
          const paragraph = $createParagraphNode();
          codeBlock.insertAfter(paragraph);
          paragraph.select();
        }
        return true;
      },
      COMMAND_PRIORITY_HIGH,
    );

    return () => {
      remove();
    };
  }, [editor]);
}

function $isCursorAtCodeBlockStart(
  anchor: PointType,
  codeBlock: MarkdownCodeBlockNode,
  openFence: LexicalNode,
): boolean {
  const anchorNode = anchor.getNode();
  if (anchorNode.is(openFence)) return anchor.offset === 0;
  if (anchorNode.is(codeBlock)) return anchor.offset === 0;
  return false;
}

function $isCursorAtCodeBlockEnd(
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

function $isCursorOnCloseFenceLine(
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

function useArrowKeyExitBehavior(editor: LexicalEditor): void {
  useEffect(() => {
    function $tryExit(
      event: KeyboardEvent | null,
      requireEnd: boolean,
    ): boolean {
      const selection = $getSelection();
      if (!$isRangeSelection(selection) || !selection.isCollapsed())
        return false;

      const anchor = selection.anchor;
      const anchorNode = anchor.getNode();

      const codeBlock = $findNearestMarkdownCodeBlockNode(anchorNode);
      if (!codeBlock) return false;
      if (codeBlock.getNextSibling() !== null) return false;

      const closeFence = codeBlock.getLastChild();
      if (!$isMarkdownCodeFenceNode(closeFence)) return false;

      if (requireEnd) {
        if (!$isCursorAtCodeBlockEnd(anchor, codeBlock, closeFence))
          return false;
      } else {
        if (!$isCursorOnCloseFenceLine(anchor, codeBlock, closeFence))
          return false;
      }

      event?.preventDefault();
      $exitCodeBlockAfter(codeBlock);
      return true;
    }

    const removeRight = editor.registerCommand(
      KEY_ARROW_RIGHT_COMMAND,
      (event) => $tryExit(event, true),
      COMMAND_PRIORITY_LOW,
    );
    const removeDown = editor.registerCommand(
      KEY_ARROW_DOWN_COMMAND,
      (event) => $tryExit(event, false),
      COMMAND_PRIORITY_LOW,
    );

    return () => {
      removeRight();
      removeDown();
    };
  }, [editor]);
}

function useSelectionFocusTracking(editor: LexicalEditor): void {
  const focusedKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const removeUpdateListener = editor.registerUpdateListener(
      ({ editorState }) => {
        const newFocusedKeys = new Set<string>();
        editorState.read(() => {
          const selection = $getSelection();
          if (!$isRangeSelection(selection)) return;
          const anchorBlock = $findNearestMarkdownCodeBlockNode(
            selection.anchor.getNode(),
          );
          if (anchorBlock) newFocusedKeys.add(anchorBlock.getKey());
          const focusBlock = $findNearestMarkdownCodeBlockNode(
            selection.focus.getNode(),
          );
          if (focusBlock) newFocusedKeys.add(focusBlock.getKey());
        });

        const doms = document.querySelectorAll(`.${CSS_CLASSES.CODE_BLOCK}`);
        doms.forEach((dom) => {
          dom.classList.remove(CSS_CLASSES.FOCUSED);
        });
        newFocusedKeys.forEach((key) => {
          editor.getElementByKey(key)?.classList.add(CSS_CLASSES.FOCUSED);
        });

        const prev = focusedKeysRef.current;
        const exited = [...prev].filter((k) => !newFocusedKeys.has(k));
        focusedKeysRef.current = newFocusedKeys;

        if (exited.length === 0) return;

        editor.update(() => {
          for (const key of exited) {
            const node = $getNodeByKey(key);
            if (!$isMarkdownCodeBlockNode(node)) continue;
            const info = $extractValidCodeBlockInfo(node);
            if (info) {
              $normalizeCodeBlock(node, info.language);
            } else {
              $unwrapMarkdownCodeBlockNode(node);
            }
          }
        });
      },
    );

    return () => {
      removeUpdateListener();
    };
  }, [editor]);
}

export default function MarkdownCodeBlockPlugin() {
  const [editor] = useLexicalComposerContext();
  useInsertParagraphBehavior(editor);
  useEscapeKeyBehavior(editor);
  useArrowKeyExitBehavior(editor);
  useSelectionFocusTracking(editor);
  useReassembleCodeBlock(editor);
  useRemoveEmptyCodeBlock(editor);
  return null;
}
