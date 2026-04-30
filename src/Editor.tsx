import { AutoFocusPlugin } from "@lexical/react/LexicalAutoFocusPlugin";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { useState } from "react";
import { initialConfig } from "./editorConfig";
import MarkdownPreviewPlugin from "./MarkdownPreviewPlugin";

export default function Editor() {
  const [markdownSource, setMarkdownSource] = useState("");

  return (
    <div className="space-y-2">
      <div className="flex gap-4 items-start">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-gray-500 mb-1">Rich editor</p>
          <LexicalComposer initialConfig={initialConfig}>
            <div
              className={`relative border border-gray-300 rounded-lg overflow-hidden ring-blue-400 focus-within:ring-2`}
            >
              <RichTextPlugin
                contentEditable={
                  <ContentEditable className="min-h-40 p-4 outline-none" />
                }
                placeholder={
                  <div className="pointer-events-none absolute top-4 left-4 text-gray-400">
                    Start typing...
                  </div>
                }
                ErrorBoundary={LexicalErrorBoundary}
              />
              <HistoryPlugin />
              <AutoFocusPlugin />
              <MarkdownPreviewPlugin onMarkdown={setMarkdownSource} />
            </div>
          </LexicalComposer>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-gray-500 mb-1">Markdown source</p>
          <pre className="border border-gray-300 rounded-lg p-4 min-h-40 bg-gray-50 font-mono text-sm whitespace-pre-wrap overflow-auto">
            {markdownSource}
          </pre>
        </div>
      </div>
    </div>
  );
}
