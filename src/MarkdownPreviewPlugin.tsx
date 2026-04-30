import { $isCodeNode } from "@lexical/code-core";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $getRoot,
  $isParagraphNode,
  $isTextNode,
  type LexicalNode,
} from "lexical";
import { useEffect } from "react";

function applyTextFormat(text: string, format: number): string {
  let result = text;
  if (format & 16) result = `\`${result}\``;
  if (format & 4) result = `~~${result}~~`;
  if (format & 2) result = `*${result}*`;
  if (format & 1) result = `**${result}**`;
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
    } else if ($isCodeNode(block)) {
      const lang = block.getLanguage() ?? "";
      const content = block.getTextContent();
      blocks.push(`\`\`\`${lang}\n${content}\n\`\`\``);
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
