import { AutoFocusPlugin } from "@lexical/react/LexicalAutoFocusPlugin";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { useState } from "react";
import CodeHighlightingPlugin from "./CodeHighlightingPlugin";
import { CSS_CLASSES } from "./constants";
import { initialConfig } from "./editorConfig";
import HtmlPreviewPlugin from "./HtmlPreviewPlugin";
import MarkdownCodeBlockPlugin from "./MarkdownCodeBlockPlugin";
import MarkdownPreviewPlugin from "./MarkdownPreviewPlugin";

export default function Editor() {
  const [markdownSource, setMarkdownSource] = useState("");
  const [htmlOutput, setHtmlOutput] = useState("");
  const [alwaysShowFences, setAlwaysShowFences] = useState(false);

  return (
    <div className="space-y-2">
      <div className="flex gap-4 items-start">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-gray-500 mb-1">Rich editor</p>
          <LexicalComposer initialConfig={initialConfig}>
            <div
              className={`relative border border-gray-300 rounded-lg overflow-hidden ring-blue-400 focus-within:ring-2${
                alwaysShowFences ? ` ${CSS_CLASSES.ALWAYS_SHOW_FENCES}` : ""
              }`}
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
              <MarkdownCodeBlockPlugin />
              <CodeHighlightingPlugin />
              <MarkdownPreviewPlugin onMarkdown={setMarkdownSource} />
              <HtmlPreviewPlugin onHtml={setHtmlOutput} />
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
      <div>
        <p className="text-sm text-gray-500 mb-1">
          HTML output (via $generateHtmlFromNodes)
        </p>
        <pre className="border border-gray-300 rounded-lg p-4 bg-gray-50 font-mono text-sm whitespace-pre-wrap overflow-auto">
          {htmlOutput}
        </pre>
      </div>
      <label className="flex items-center gap-2 text-sm text-gray-600 select-none">
        <input
          type="checkbox"
          checked={alwaysShowFences}
          onChange={(e) => setAlwaysShowFences(e.target.checked)}
        />
        Always show code fences
      </label>
    </div>
  );
}
