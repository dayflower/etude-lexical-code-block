import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $getRoot,
  $isParagraphNode,
  $isTextNode,
  IS_BOLD,
  IS_CODE,
  IS_ITALIC,
  IS_STRIKETHROUGH,
  type LexicalNode,
} from "lexical";
import { useEffect } from "react";
import { $isMarkdownCodeBlockNode } from "./MarkdownCodeBlockNode";

function applyTextFormat(text: string, format: number): string {
  let result = text;
  if (format & IS_CODE) result = `\`${result}\``;
  if (format & IS_STRIKETHROUGH) result = `~~${result}~~`;
  if (format & IS_ITALIC) result = `*${result}*`;
  if (format & IS_BOLD) result = `**${result}**`;
  return result;
}

function serializeInlineNode(node: LexicalNode): string {
  if ($isTextNode(node)) {
    return applyTextFormat(node.getTextContent(), node.getFormat());
  }
  return node.getTextContent();
}

function serializeToMarkdown(): string {
  const root = $getRoot();
  const blocks: string[] = [];

  for (const block of root.getChildren()) {
    if ($isParagraphNode(block)) {
      const line = block.getChildren().map(serializeInlineNode).join("");
      blocks.push(line);
    } else if ($isMarkdownCodeBlockNode(block)) {
      blocks.push(block.getTextContent());
    } else {
      blocks.push(block.getTextContent());
    }
  }

  return blocks.join("\n\n");
}

interface Props {
  onMarkdown: (md: string) => void;
}

export default function MarkdownPreviewPlugin({ onMarkdown }: Props) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        onMarkdown(serializeToMarkdown());
      });
    });
  }, [editor, onMarkdown]);

  return null;
}
