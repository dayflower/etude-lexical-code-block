import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useArrowKeyExitBehavior } from "./hooks/useArrowKeyExitBehavior";
import { useBackspaceKeyBehavior } from "./hooks/useBackspaceKeyBehavior";
import { useCodeBlockFocusClass } from "./hooks/useCodeBlockFocusClass";
import { useCodeBlockValidationOnBlur } from "./hooks/useCodeBlockValidationOnBlur";
import { useEscapeKeyBehavior } from "./hooks/useEscapeKeyBehavior";
import { useInsertParagraphBehavior } from "./hooks/useInsertParagraphBehavior";
import { useReassembleCodeBlock } from "./hooks/useReassembleCodeBlock";
import { useRemoveEmptyCodeBlock } from "./hooks/useRemoveEmptyCodeBlock";

export default function MarkdownCodeBlockPlugin() {
  const [editor] = useLexicalComposerContext();
  useInsertParagraphBehavior(editor);
  useEscapeKeyBehavior(editor);
  useArrowKeyExitBehavior(editor);
  useBackspaceKeyBehavior(editor);
  useCodeBlockFocusClass(editor);
  useCodeBlockValidationOnBlur(editor);
  useReassembleCodeBlock(editor);
  useRemoveEmptyCodeBlock(editor);
  return null;
}
