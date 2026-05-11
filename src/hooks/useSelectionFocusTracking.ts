import {
  $getNodeByKey,
  $getSelection,
  $isRangeSelection,
  type LexicalEditor,
} from "lexical";
import { useEffect, useRef } from "react";
import {
  $extractValidCodeBlockInfo,
  $findNearestMarkdownCodeBlockNode,
  $normalizeCodeBlock,
  $unwrapMarkdownCodeBlockNode,
} from "../codeBlockOps";
import { CSS_CLASSES } from "../constants";
import { $isMarkdownCodeBlockNode } from "../MarkdownCodeBlockNode";

export function useSelectionFocusTracking(editor: LexicalEditor): void {
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
