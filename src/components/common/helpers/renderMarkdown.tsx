import { type TextPart } from "../../../types";
import React, { type TeactNode } from "../../../lib/teact/teact";

class Node {
  private isClosed: boolean = false;
  constructor(
    public markdown: "bold" | "italic" | "breakthrough" | "code" | "text",
    public children: (Node | string)[] | null
  ) {
    if (markdown == "text") this.isClosed = true;
  }

  add(newNode: string | Node) {
    if (this.children == null) {
      this.children = [newNode];
      return;
    }

    const lastChildIdx = this.children.length - 1;
    if (typeof this.children[lastChildIdx] == "string") {
      if (typeof newNode == "string") this.children[lastChildIdx] += newNode;
      else this.children.push(newNode);
      return;
    }

    if (this.children[lastChildIdx].isNodeClosed()) {
      this.children.push(newNode);
    } else this.children[lastChildIdx].add(newNode);
  }

  closeNode(delim: string): boolean {
    if (getMarkdownType(delim) == this.markdown) {
      this.isClosed = true;
      return true;
    }

    if (this.children == null) return false;

    const lastChildIdx = this.children.length - 1;
    if (typeof this.children[lastChildIdx] == "string") return false;

    return this.children[lastChildIdx].closeNode(delim);
  }

  isNodeClosed() {
    return this.isClosed;
  }

  render(type: "html" | "jsx", postProcess: (part: string) => TeactNode) {
    const isJSX = type == "jsx";
    const delim = this.getDelim();
    if (this.children == null || this.children.length == 0) {
      return postProcess(`${delim}${this.isNodeClosed() ? delim : ""}`);
    }

    const childrenResult: TextPart[] = (() => {
      if (isJSX) {
        return this.children.map((child) => {
          if (typeof child == "string") return postProcess(child);
          return child.render(type, postProcess);
        });
      }

      const htmlResult = this.children.reduce((soFar: string, child) => {
        if (typeof child == "string") return soFar + postProcess(child);
        return soFar + (child.render(type, postProcess) as string);
      }, "");

      return [htmlResult];
    })();

    if (this.markdown == "text") return childrenResult;

    if (!this.isNodeClosed()) {
      if (isJSX)
        return (
          <>
            {delim}
            {childrenResult}
          </>
        );
      return `${delim}${childrenResult}`;
    }

    switch (this.markdown) {
      case "bold":
        return isJSX ? <b>{childrenResult}</b> : `<b>${childrenResult}</b>`;
      case "italic":
        return isJSX ? <i>{childrenResult}</i> : `<i>${childrenResult}</i>`;
      case "breakthrough":
        return isJSX ? (
          <del>{childrenResult}</del>
        ) : (
          `<del>${childrenResult}</del>`
        );
      case "code":
        return isJSX ? (
          <code>{childrenResult}</code>
        ) : (
          `<code>${childrenResult}</code>`
        );
      default:
        return isJSX ? <>{childrenResult}</> : `${childrenResult}`;
    }
  }

  private getDelim() {
    switch (this.markdown) {
      case "bold":
        return BOLD;
      case "italic":
        return ITALIC;
      case "breakthrough":
        return BREAKTHROUGH;
      case "code":
        return CODE;
      default:
        return "";
    }
  }
}

const BOLD = "**";
const ITALIC = "__";
const BREAKTHROUGH = "~~";
const CODE = "`";
const DELIMITERS = [BOLD, ITALIC, BREAKTHROUGH, CODE];
export function renderMarkdown(
  text: string,
  type: "html" | "jsx",
  postProcess: (part: string) => TeactNode
) {
  if (text.length < 2) return [text];

  const trees: Node[] = [];
  let currentTree: Node | undefined = undefined;
  for (let i = 0; i < text.length; ++i) {
    const delim = getDelimInPos(text, i);
    if (delim == undefined) {
      if (currentTree == undefined) currentTree = new Node("text", [""]);
      currentTree.add(text[i]);
      continue;
    }

    i += delim.length - 1; // we have already detect the delim, so skip it
    if (currentTree != undefined && currentTree.markdown == "text") {
      trees.push(currentTree);
      currentTree = undefined;
    }

    if (currentTree == undefined) {
      currentTree = new Node(getMarkdownType(delim), null);
      continue;
    }

    const hasClosedANode = currentTree.closeNode(delim);
    if (currentTree.isNodeClosed()) {
      trees.push(currentTree);
      currentTree = undefined;
      continue;
    }

    if (hasClosedANode) continue;
    currentTree.add(new Node(getMarkdownType(delim), null));
  }

  if (currentTree != undefined) trees.push(currentTree);
  return trees.map((t) => t.render(type, postProcess));
}

function getDelimInPos(text: string, index: number) {
  const twoLenDelim =
    index + 1 < text.length ? text[index] + text[index + 1] : undefined;
  if (twoLenDelim != undefined && DELIMITERS.includes(twoLenDelim))
    return twoLenDelim;

  const singleLenDelim = index < text.length ? text[index] : undefined;
  if (singleLenDelim != undefined && DELIMITERS.includes(singleLenDelim))
    return singleLenDelim;
  return undefined;
}

function getMarkdownType(delim: string): Node["markdown"] {
  switch (delim) {
    case BOLD:
      return "bold";
    case ITALIC:
      return "italic";
    case BREAKTHROUGH:
      return "breakthrough";
    case CODE:
      return "code";
    default:
      return "text";
  }
}
