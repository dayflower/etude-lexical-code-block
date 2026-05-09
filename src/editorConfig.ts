import { CodeHighlightNode } from "@lexical/code-core";
import {
  MarkdownCodeBlockNode,
  MarkdownCodeFenceNode,
} from "./MarkdownCodeBlockNode";

const theme = {
  paragraph: "mb-2",
  codeHighlight: {
    atrule: "token atrule",
    attr: "token attr",
    "attr-name": "token attr-name",
    "attr-value": "token attr-value",
    boolean: "token boolean",
    builtin: "token builtin",
    cdata: "token cdata",
    char: "token char",
    "class-name": "token class-name",
    comment: "token comment",
    constant: "token constant",
    deleted: "token deleted",
    doctype: "token doctype",
    entity: "token entity",
    function: "token function",
    important: "token important",
    inserted: "token inserted",
    keyword: "token keyword",
    namespace: "token namespace",
    number: "token number",
    operator: "token operator",
    prolog: "token prolog",
    property: "token property",
    punctuation: "token punctuation",
    regex: "token regex",
    selector: "token selector",
    string: "token string",
    symbol: "token symbol",
    tag: "token tag",
    url: "token url",
    variable: "token variable",
  },
};

function onError(error: Error) {
  console.error(error);
}

export const initialConfig = {
  namespace: "LexicalCodeBlockTest",
  theme,
  onError,
  nodes: [MarkdownCodeBlockNode, MarkdownCodeFenceNode, CodeHighlightNode],
};
