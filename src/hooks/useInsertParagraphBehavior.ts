import {
  $getSelection,
  $isParagraphNode,
  $isRangeSelection,
  $isTextNode,
  COMMAND_PRIORITY_LOW,
  INSERT_PARAGRAPH_COMMAND,
  type LexicalEditor,
} from "lexical";
import { useEffect } from "react";
import {
  $exitCodeBlockAfter,
  $exitCodeBlockBefore,
  $findNearestMarkdownCodeBlockNode,
  $isCursorAtCodeBlockEnd,
  $isCursorAtCodeBlockStart,
  OPEN_FENCE_REGEX,
} from "../codeBlockOps";
import {
  $appendCodeBlockChildren,
  $createMarkdownCodeBlockNode,
  $isMarkdownCodeFenceNode,
} from "../MarkdownCodeBlockNode";

export function useInsertParagraphBehavior(editor: LexicalEditor): void {
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
