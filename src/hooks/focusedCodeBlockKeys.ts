import { $getSelection, $isRangeSelection, type NodeKey } from "lexical";
import { $findNearestMarkdownCodeBlockNode } from "../codeBlockOps";

export function $collectFocusedCodeBlockKeys(): Set<NodeKey> {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return new Set();
  const keys = new Set<NodeKey>();
  const anchorBlock = $findNearestMarkdownCodeBlockNode(
    selection.anchor.getNode(),
  );
  if (anchorBlock) keys.add(anchorBlock.getKey());
  const focusBlock = $findNearestMarkdownCodeBlockNode(
    selection.focus.getNode(),
  );
  if (focusBlock) keys.add(focusBlock.getKey());
  return keys;
}
