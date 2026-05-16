import { $getNodeByKey, type LexicalEditor } from "lexical";
import { useEffect, useRef } from "react";
import {
  $extractValidCodeBlockInfo,
  $normalizeCodeBlock,
  $unwrapMarkdownCodeBlockNode,
} from "../codeBlockOps";
import { $isMarkdownCodeBlockNode } from "../MarkdownCodeBlockNode";
import { $collectFocusedCodeBlockKeys } from "./focusedCodeBlockKeys";

export function useCodeBlockValidationOnBlur(editor: LexicalEditor): void {
  const focusedKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const removeUpdateListener = editor.registerUpdateListener(
      ({ editorState }) => {
        let current = new Set<string>();
        editorState.read(() => {
          current = $collectFocusedCodeBlockKeys();
        });

        const prev = focusedKeysRef.current;
        const exited = [...prev].filter((k) => !current.has(k));
        focusedKeysRef.current = current;

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
