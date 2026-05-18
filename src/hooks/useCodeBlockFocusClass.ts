import type { LexicalEditor } from "lexical";
import { useEffect } from "react";
import { CSS_CLASSES } from "../constants";
import { $collectFocusedCodeBlockKeys } from "./focusedCodeBlockKeys";

export function useCodeBlockFocusClass(editor: LexicalEditor): void {
  useEffect(() => {
    const removeUpdateListener = editor.registerUpdateListener(
      ({ editorState }) => {
        let focusedKeys = new Set<string>();
        editorState.read(() => {
          focusedKeys = $collectFocusedCodeBlockKeys();
        });

        const root = editor.getRootElement();
        if (!root) return;
        const doms = root.querySelectorAll(`.${CSS_CLASSES.CODE_BLOCK}`);
        doms.forEach((dom) => {
          dom.classList.remove(CSS_CLASSES.FOCUSED);
        });
        focusedKeys.forEach((key) => {
          editor.getElementByKey(key)?.classList.add(CSS_CLASSES.FOCUSED);
        });
      },
    );

    return () => {
      removeUpdateListener();
    };
  }, [editor]);
}
