import { $isLineBreakNode, type LexicalEditor } from "lexical";
import { useEffect } from "react";
import {
  $extractValidCodeBlockInfo,
  $findNearestMarkdownCodeBlockNode,
  $unwrapMarkdownCodeBlockNode,
} from "../codeBlockOps";
import {
  MarkdownCodeBlockNode,
  MarkdownCodeFenceNode,
} from "../MarkdownCodeBlockNode";

// Companion to `useCodeBlockValidationOnBlur` that unwraps a broken code block
// immediately. Registered on two node types so both kinds of fence-breaking
// edits trigger validation in the same update cycle as the mutation:
//
//   - `MarkdownCodeBlockNode` transform — fires when the block's own children
//     list changes (LB additions/removals, etc.). Covers the "close fence
//     merged onto last content line" layout produced by close-fence-line-start
//     Backspace, where only a LineBreakNode is removed.
//   - `MarkdownCodeFenceNode` transform — fires when fence text changes (e.g.
//     Backspace inside the fence dropped a backtick). Parent code blocks are
//     not automatically marked dirty by a descendant text-only mutation, so
//     the block transform alone would miss this case.
//
// Two break conditions:
//
//   1. Fence text fails `$extractValidCodeBlockInfo` — e.g. a backtick was
//      deleted out of the open or close fence, or the language got an
//      out-of-charset suffix.
//   2. Close fence has no LineBreakNode immediately before it (the transient
//      "merged onto last content line" layout), leaving `[..., content,
//      closeFence]`. Treated as broken so the block dissolves rather than
//      persisting an invalid visual form like `abc` + `` ``` `` on one line.
//
// The other LB-less layout — `[openFence, LB, closeFence]` produced by
// `$mergeFirstContentLineIntoOpenFence` — is intentionally NOT rejected: that
// is the working state while the user folds content into the open fence to
// edit the language, and is re-canonicalized on blur.
export function useCodeBlockValidationOnEdit(editor: LexicalEditor): void {
  useEffect(() => {
    const $validate = (codeBlock: MarkdownCodeBlockNode) => {
      if (!$extractValidCodeBlockInfo(codeBlock)) {
        $unwrapMarkdownCodeBlockNode(codeBlock);
        return;
      }
      const closeFence = codeBlock.getCloseFence();
      const beforeClose = closeFence?.getPreviousSibling();
      if (beforeClose && !$isLineBreakNode(beforeClose)) {
        $unwrapMarkdownCodeBlockNode(codeBlock);
      }
    };

    const removeBlockTransform = editor.registerNodeTransform(
      MarkdownCodeBlockNode,
      $validate,
    );
    const removeFenceTransform = editor.registerNodeTransform(
      MarkdownCodeFenceNode,
      (fence) => {
        const codeBlock = $findNearestMarkdownCodeBlockNode(fence);
        if (codeBlock) $validate(codeBlock);
      },
    );

    return () => {
      removeBlockTransform();
      removeFenceTransform();
    };
  }, [editor]);
}
