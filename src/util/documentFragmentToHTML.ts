import encodeEntities from "./encodeEntities";

export default function documentFragmentToHTML(fragment: DocumentFragment) {
  return Array.from(fragment.childNodes)
    .map((node) => {
      return node.nodeType === node.TEXT_NODE && node.textContent != null
        ? encodeEntities(node.textContent)
        : (node as Element).outerHTML;
    })
    .join("");
}
