import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useArrowKeyExitBehavior } from "./hooks/useArrowKeyExitBehavior";
import { useBackspaceKeyBehavior } from "./hooks/useBackspaceKeyBehavior";
import { useEscapeKeyBehavior } from "./hooks/useEscapeKeyBehavior";
import { useInsertParagraphBehavior } from "./hooks/useInsertParagraphBehavior";
import { useReassembleCodeBlock } from "./hooks/useReassembleCodeBlock";
import { useRemoveEmptyCodeBlock } from "./hooks/useRemoveEmptyCodeBlock";
import { useSelectionFocusTracking } from "./hooks/useSelectionFocusTracking";

export default function MarkdownCodeBlockPlugin() {
  const [editor] = useLexicalComposerContext();
  useInsertParagraphBehavior(editor);
  useEscapeKeyBehavior(editor);
  useArrowKeyExitBehavior(editor);
  useBackspaceKeyBehavior(editor);
  useSelectionFocusTracking(editor);
  useReassembleCodeBlock(editor);
  useRemoveEmptyCodeBlock(editor);
  return null;
}
