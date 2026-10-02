/** Images already requested by Vega for this view, not a second download/cache. */
export function renderedImages(view: any): Map<string, HTMLImageElement> {
  const images = new Map<string, HTMLImageElement>();
  const visit = (node: any) => {
    if (node.image)
      images.set(node.url || node.image.url || node.image.src, node.image);
    node.items?.forEach(visit);
  };
  visit(view.scenegraph().root);
  return images;
}
/** Embed loaded tile pixels so SVGs and report HTML remain self-contained. */
export async function exportSVG(view: any): Promise<string> {
  const raw = await view.toSVG();
  if (!raw.includes("<image")) return raw;
  const doc = new DOMParser().parseFromString(raw, "image/svg+xml");
  const images = renderedImages(view);
  const encoded = new Map<string, string>();
  for (const node of doc.querySelectorAll("image")) {
    const href =
      node.getAttribute("href") ||
      node.getAttributeNS("http://www.w3.org/1999/xlink", "href") ||
      "";
    if (href.startsWith("data:")) continue;
    if (!encoded.has(href)) {
      const image = images.get(href);
      if (!image?.complete || !image.naturalWidth)
        throw new Error(
          "Street tiles could not be loaded. Switch to built-in boundaries or retry before exporting.",
        );
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      canvas.getContext("2d")!.drawImage(image, 0, 0);
      encoded.set(href, canvas.toDataURL("image/png"));
    }
    node.removeAttributeNS("http://www.w3.org/1999/xlink", "href");
    node.setAttribute("href", encoded.get(href)!);
  }
  return new XMLSerializer().serializeToString(doc.documentElement);
}
