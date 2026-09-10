import { createMarkdownProcessor } from "@astrojs/markdown-remark";

export type PostLang = "en" | "zh";

const processorPromise = createMarkdownProcessor();

export async function renderMarkdown(markdown: string) {
  const processor = await processorPromise;
  const { code } = await processor.render(markdown.trim());
  return code;
}

/** Split a post body into en / zh sections. Markers: <!--lang:en--> <!--lang:zh--> */
export function splitBilingualBody(body: string, source: PostLang) {
  const text = body.replace(/^\uFEFF/, "");
  const parts = text.split(/<!--\s*lang:(en|zh)\s*-->/i);
  if (parts.length === 1) {
    return source === "en"
      ? { en: text.trim(), zh: "" }
      : { en: "", zh: text.trim() };
  }

  const out = { en: "", zh: "" };
  let current: PostLang | null = null;
  for (const part of parts) {
    const key = part.trim().toLowerCase();
    if (key === "en" || key === "zh") {
      current = key;
      continue;
    }
    if (!current) continue;
    out[current] = part.trim();
  }

  if (!out.en && !out.zh) {
    return source === "en"
      ? { en: text.trim(), zh: "" }
      : { en: "", zh: text.trim() };
  }
  return out;
}

export function titlesForPost(data: {
  lang?: PostLang;
  title: string;
  titleOther?: string;
}) {
  const source = data.lang ?? "en";
  const other = data.titleOther?.trim() ?? "";
  if (source === "en") return { en: data.title, zh: other };
  return { en: other, zh: data.title };
}

export function descriptionsForPost(data: {
  lang?: PostLang;
  description: string;
  descriptionOther?: string;
}) {
  const source = data.lang ?? "en";
  const other = data.descriptionOther?.trim() ?? "";
  if (source === "en") return { en: data.description, zh: other };
  return { en: other, zh: data.description };
}

export function detectSourceLang(text: string): PostLang {
  const cjk = (text.match(/[\u4e00-\u9fff]/g) ?? []).length;
  const latin = (text.match(/[A-Za-z]/g) ?? []).length;
  return cjk > latin ? "zh" : "en";
}
