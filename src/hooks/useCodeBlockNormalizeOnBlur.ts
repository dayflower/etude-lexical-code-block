import { $getNodeByKey, type LexicalEditor } from "lexical";
import { useEffect, useRef } from "react";
import {
  $extractValidCodeBlockInfo,
  $normalizeCodeBlock,
} from "../codeBlockOps";
import { $isMarkdownCodeBlockNode } from "../MarkdownCodeBlockNode";
import { $collectFocusedCodeBlockKeys } from "./focusedCodeBlockKeys";

// On blur, re-canonicalize any code block the selection just left. The only
// non-canonical layout that can reach blur is the merged-on-empty form
// (`[openFence, LB, closeFence]`) produced by
// `$mergeFirstContentLineIntoOpenFence` — invalid blocks and case-4 (close
// fence merged onto last content line) are dissolved on the spot by
// `useCodeBlockValidationOnEdit`, so they never survive to here.
export function useCodeBlockNormalizeOnBlur(editor: LexicalEditor): void {
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
            if (!info) continue;
            $normalizeCodeBlock(node, info.language);
          }
        });
      },
    );

    return () => {
      removeUpdateListener();
    };
  }, [editor]);
}
