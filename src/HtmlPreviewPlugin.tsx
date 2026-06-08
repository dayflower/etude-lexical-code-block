import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useEffect } from "react";
import { getEditorHtml } from "./getEditorHtml";

interface Props {
  onHtml: (html: string) => void;
}

export default function HtmlPreviewPlugin({ onHtml }: Props) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerUpdateListener(() => {
      onHtml(getEditorHtml(editor));
    });
  }, [editor, onHtml]);

  return null;
}
