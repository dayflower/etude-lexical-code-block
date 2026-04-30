import { CodeHighlightNode, CodeNode } from "@lexical/code-core";

const theme = {
  paragraph: "mb-2",
  code: "block font-mono text-sm bg-gray-100 rounded p-3 mb-2 whitespace-pre overflow-auto",
};

function onError(error: Error) {
  console.error(error);
}

export const initialConfig = {
  namespace: "LexicalCodeBlockTest",
  theme,
  onError,
  nodes: [CodeNode, CodeHighlightNode],
};
