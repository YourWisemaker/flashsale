import { useEffect } from "react";

/**
 * Title per page; account pages also ask search engines not to index them.
 * index.html already has a robots tag, so this changes that one tag
 * (and puts it back on the way out) rather than adding a second,
 * contradicting one.
 */
export function usePageMeta(title: string, { noindex = false } = {}) {
  useEffect(() => {
    document.title = `${title} | Arief Shop`;
    if (!noindex) return;

    let meta = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    const previous = meta?.content ?? null;
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "robots";
      document.head.appendChild(meta);
    }
    meta.content = "noindex";

    return () => {
      if (previous === null) meta.remove();
      else meta.content = previous;
    };
  }, [title, noindex]);
}
