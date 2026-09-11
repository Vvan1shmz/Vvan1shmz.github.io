import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  statSync,
} from "node:fs";
import { basename, dirname, extname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const config = JSON.parse(
  readFileSync(join(root, "obsidian-sync.config.json"), "utf8"),
);
const statePath = join(root, "inbox", ".sync-state.json");
const blogDir = join(root, "src/content/blog");
const inboxDir = join(root, config.inboxFolder);
const publicImagesDir = join(root, "public", "images", "posts");
const allowed = new Set(config.categories);
const IMAGE_EXT = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".svg",
  ".avif",
]);

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const fromInboxOnly = args.has("--inbox-only");
const force = args.has("--force");

function minAgeMinutes() {
  for (const arg of process.argv.slice(2)) {
    const m = arg.match(/^--min-age-minutes=(\d+)$/);
    if (m) return Number(m[1]);
  }
  return 30;
}

const ageMinutes = minAgeMinutes();

function loadState() {
  try {
    return JSON.parse(readFileSync(statePath, "utf8"));
  } catch {
    return { files: {} };
  }
}

function saveState(state) {
  mkdirSync(dirname(statePath), { recursive: true });
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
}

function hashText(text) {
  return createHash("sha256").update(text).digest("hex");
}

function parseFrontmatter(text) {
  if (!text.startsWith("---\n") && !text.startsWith("---\r\n")) {
    return { data: {}, body: text };
  }
  const end = text.indexOf("\n---", 3);
  if (end < 0) return { data: {}, body: text };
  const raw = text.slice(4, end).replace(/\r/g, "");
  const body = text.slice(end + 4).replace(/^\r?\n/, "");
  const data = {};
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    let value = m[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (value === "true") data[key] = true;
    else if (value === "false") data[key] = false;
    else data[key] = value;
  }
  return { data, body };
}

function isPublishable(data, body) {
  if (data.publish === true) return true;
  if (data.publish === false) return false;
  if (typeof data.draft === "boolean") return data.draft === false;
  return /(?:^|\s)#blog(?:\s|$)/m.test(body) || /(?:^|\s)#publish(?:\s|$)/m.test(body);
}

/** Finished when the note has a standalone line that is only 完. */
function isFinished(body) {
  return /^完\s*$/m.test(body.replace(/\r/g, ""));
}

/** Drop the finish marker so it does not appear on the live post. */
function stripFinishedMarker(body) {
  return body
    .replace(/\r/g, "")
    .replace(/^\s*完\s*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isImagePath(path) {
  return IMAGE_EXT.has(extname(path).toLowerCase());
}

function safePublicName(name) {
  const base = basename(name);
  const cleaned = base
    .normalize("NFKD")
    .replace(/[^\w.\u4e00-\u9fff-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned || `image${extname(base).toLowerCase()}`;
}

/** Collect Obsidian wiki embeds and local markdown images. */
function extractImageRefs(body) {
  const refs = [];
  const text = body.replace(/\r/g, "");
  for (const m of text.matchAll(
    /!\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/g,
  )) {
    const path = m[1].trim().replace(/\\/g, "/");
    if (!isImagePath(path)) continue;
    const opt = (m[2] ?? "").split("|")[0].trim();
    const alt =
      !opt || /^\d+(x\d+)?$/i.test(opt)
        ? basename(path, extname(path))
        : opt;
    refs.push({ raw: m[0], path, alt });
  }
  for (const m of text.matchAll(
    /!\[([^\]]*)\]\(([^)\s]+)(?:\s+(?:"[^"]*"|'[^']*'))?\)/g,
  )) {
    const path = m[2].trim().replace(/\\/g, "/");
    if (/^(https?:|data:|mailto:|\/)/i.test(path)) continue;
    if (!isImagePath(path)) continue;
    refs.push({
      raw: m[0],
      path,
      alt: m[1].trim() || basename(path, extname(path)),
    });
  }
  return refs;
}

function walkFiles(dir, out = [], depth = 0) {
  if (!existsSync(dir) || depth > 6) return out;
  for (const name of readdirSync(dir)) {
    if (name.startsWith(".")) continue;
    const path = join(dir, name);
    let st;
    try {
      st = statSync(path);
    } catch {
      continue;
    }
    if (st.isDirectory()) walkFiles(path, out, depth + 1);
    else out.push(path);
  }
  return out;
}

function resolveAttachment(noteDir, relPath) {
  const vaultPath = config.vaultPath;
  const decoded = decodeURIComponent(relPath);
  const candidates = [
    join(noteDir, decoded),
    join(vaultPath, decoded),
    join(vaultPath, "Attachments", basename(decoded)),
    join(vaultPath, "assets", basename(decoded)),
    join(vaultPath, "Diary", basename(decoded)),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  const want = basename(decoded).toLowerCase();
  for (const file of walkFiles(vaultPath)) {
    if (basename(file).toLowerCase() === want && isImagePath(file)) return file;
  }
  return null;
}

function rewriteImages(body, noteDir, slug, copied) {
  const refs = extractImageRefs(body);
  if (!refs.length) return { body, assets: [] };

  let next = body;
  const assets = [];
  const usedNames = new Set();

  for (const ref of refs) {
    const source = resolveAttachment(noteDir, ref.path);
    if (!source) {
      console.warn(`  missing image: ${ref.path} (in ${slug})`);
      continue;
    }
    let name = safePublicName(basename(source));
    let n = 2;
    while (usedNames.has(name.toLowerCase())) {
      const ext = extname(name);
      const stem = name.slice(0, name.length - ext.length);
      name = `${stem}-${n}${ext}`;
      n += 1;
    }
    usedNames.add(name.toLowerCase());

    const destDir = join(publicImagesDir, slug);
    const dest = join(destDir, name);
    const publicUrl = `/images/posts/${slug}/${name}`.split(sep).join("/");
    const fileHash = hashText(readFileSync(source));
    assets.push({ path: ref.path, publicUrl, fileHash });

    if (!dryRun) {
      mkdirSync(destDir, { recursive: true });
      copyFileSync(source, dest);
      copied.push(`${relative(root, dest)}`);
    }

    const md = `![${ref.alt.replace(/[\[\]]/g, "")}](${publicUrl})`;
    next = next.split(ref.raw).join(md);
  }

  return { body: next, assets };
}

function stripCategoryMarks(title) {
  return title
    .replace(/[\[【#]?\s*(notes|reading|making|research|talk|笔记|阅读|制作|研究|杂谈)\s*[\]】]?\s*[:：·-]?\s*/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function categoryFromTitle(title, explicit) {
  if (explicit && allowed.has(explicit)) return explicit;
  for (const rule of config.titleCategoryRules) {
    if (new RegExp(rule.match, "i").test(title)) return rule.category;
  }
  return "notes";
}

function toSlug(value) {
  const ascii = value
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-");
  if (ascii && ascii !== "category") return ascii;
  return value
    .trim()
    .replace(/[\\/:*?"<>|#%{}\\^~[\]`]+/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function firstHeading(body) {
  const m = body.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : "";
}

function firstParagraph(body) {
  const lines = body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && !line.startsWith("!") && !/^#\w/.test(line));
  return (lines[0] ?? "").replace(/^>\s*/, "").slice(0, 160);
}

function walkMarkdown(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name.startsWith(".") || name.startsWith("_")) continue;
    const path = join(dir, name);
    const st = statSync(path);
    if (st.isDirectory()) walkMarkdown(path, out);
    else if (name.endsWith(".md")) out.push(path);
  }
  return out;
}

function sourceDirs() {
  const dirs = [];
  if (!fromInboxOnly) {
    const vaultDiary = join(config.vaultPath, config.diaryFolder);
    if (existsSync(vaultDiary)) dirs.push({ label: "vault", dir: vaultDiary });
  }
  if (existsSync(inboxDir)) dirs.push({ label: "inbox", dir: inboxDir });
  return dirs;
}

function yamlQuote(value) {
  return JSON.stringify(String(value ?? ""));
}

function detectSourceLang(text) {
  const cjk = (text.match(/[\u4e00-\u9fff]/g) ?? []).length;
  const latin = (text.match(/[A-Za-z]/g) ?? []).length;
  return cjk > latin ? "zh" : "en";
}

function splitBilingualBody(body, source) {
  const text = body.replace(/^\uFEFF/, "");
  const parts = text.split(/<!--\s*lang:(en|zh)\s*-->/i);
  if (parts.length === 1) {
    return source === "en"
      ? { en: text.trim(), zh: "" }
      : { en: "", zh: text.trim() };
  }
  const out = { en: "", zh: "" };
  let current = null;
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

function buildPost({
  title,
  titleOther,
  description,
  descriptionOther,
  lang,
  date,
  category,
  bodies,
}) {
  const en = bodies.en?.trim() ?? "";
  const zh = bodies.zh?.trim() ?? "";
  return `---
title: ${yamlQuote(title)}
titleOther: ${yamlQuote(titleOther)}
description: ${yamlQuote(description)}
descriptionOther: ${yamlQuote(descriptionOther)}
lang: ${lang}
date: ${date}
category: ${category}
draft: false
---

<!--lang:en-->
${en}

<!--lang:zh-->
${zh}
`;
}

function normalizeDate(value, fallbackName) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }
  const fromName = fallbackName.match(/(\d{4}-\d{2}-\d{2})/);
  if (fromName) return fromName[1];
  const today = new Date();
  return [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getDate()).padStart(2, "0"),
  ].join("-");
}

mkdirSync(blogDir, { recursive: true });
mkdirSync(inboxDir, { recursive: true });

const state = loadState();
const sources = sourceDirs();
if (!sources.length) {
  console.error("No diary folder found. Expected vault Diary/ or inbox/diary.");
  process.exit(1);
}

const seen = new Set();
const created = [];
const skipped = [];
const copiedImages = [];

for (const source of sources) {
  for (const file of walkMarkdown(source.dir)) {
    const rel = `${source.label}:${relative(source.dir, file)}`;
    if (seen.has(file)) continue;
    seen.add(file);

    const text = readFileSync(file, "utf8");
    const mtimeMs = statSync(file).mtimeMs;
    const ageMs = Date.now() - mtimeMs;
    if (!force && ageMs < ageMinutes * 60 * 1000) {
      skipped.push(
        `${rel} (edited ${Math.round(ageMs / 60000)}m ago; wait ${ageMinutes}m or use --force)`,
      );
      continue;
    }

    const { data, body } = parseFrontmatter(text);
    if (!isPublishable(data, body)) {
      skipped.push(`${rel} (not marked publish)`);
      continue;
    }
    if (!isFinished(body)) {
      skipped.push(`${rel} (not finished — add a line with only 完)`);
      continue;
    }

    const noteDir = dirname(file);
    const imageRefs = extractImageRefs(body);
    const assetHashes = [];
    for (const ref of imageRefs) {
      const abs = resolveAttachment(noteDir, ref.path);
      if (abs) assetHashes.push(hashText(readFileSync(abs)));
      else assetHashes.push(`missing:${ref.path}`);
    }
    const digest = hashText(`${text}\n${assetHashes.join("|")}`);
    const prev = state.files[rel];
    if (prev?.hash === digest) {
      skipped.push(`${rel} (unchanged)`);
      continue;
    }

    const rawTitle =
      (typeof data.title === "string" && data.title) ||
      firstHeading(body) ||
      basename(file, ".md");
    const category = categoryFromTitle(
      rawTitle,
      typeof data.category === "string" ? data.category : undefined,
    );
    const title = stripCategoryMarks(rawTitle) || rawTitle;
    const date = normalizeDate(data.date, basename(file, ".md"));
    const lang =
      data.lang === "en" || data.lang === "zh"
        ? data.lang
        : detectSourceLang(`${title}\n${body}`);

    const slugBase = toSlug(
      (typeof data.slug === "string" && data.slug) || `${date}-${title}`,
    );
    if (!slugBase) {
      skipped.push(`${rel} (bad slug)`);
      continue;
    }

    let slug = slugBase;
    let outPath = join(blogDir, `${slug}.md`);
    let n = 2;
    while (existsSync(outPath) && prev?.slug !== slug) {
      slug = `${slugBase}-${n}`;
      outPath = join(blogDir, `${slug}.md`);
      n += 1;
    }

    const cleaned = stripFinishedMarker(body);
    const { body: withImages } = rewriteImages(
      cleaned,
      noteDir,
      slug,
      copiedImages,
    );
    const bodies = splitBilingualBody(withImages, lang);
    const description =
      (typeof data.description === "string" && data.description) ||
      firstParagraph(bodies[lang] || withImages) ||
      title;
    const titleOther =
      (typeof data.titleOther === "string" && data.titleOther) ||
      (typeof data.title_zh === "string" && data.title_zh) ||
      (typeof data.title_en === "string" && data.title_en) ||
      "";
    const descriptionOther =
      (typeof data.descriptionOther === "string" && data.descriptionOther) ||
      (typeof data.description_zh === "string" && data.description_zh) ||
      (typeof data.description_en === "string" && data.description_en) ||
      "";

    const post = buildPost({
      title,
      titleOther,
      description,
      descriptionOther,
      lang,
      date,
      category,
      bodies,
    });
    if (dryRun) {
      created.push(
        `${rel} -> ${slug}.md (${category}, ${lang}, ${imageRefs.length} images) [dry-run]`,
      );
      continue;
    }

    writeFileSync(outPath, post);
    state.files[rel] = {
      hash: digest,
      slug,
      category,
      images: imageRefs.length,
      syncedAt: new Date().toISOString(),
    };
    created.push(
      `${rel} -> src/content/blog/${slug}.md (${category}, ${lang}, ${imageRefs.length} images)`,
    );
  }
}

if (!dryRun && created.length) saveState(state);

if (created.length) {
  console.log("Synced:");
  for (const line of created) console.log(`  ${line}`);
} else {
  console.log("Nothing new to publish.");
}

if (copiedImages.length) {
  console.log("Images:");
  for (const line of copiedImages) console.log(`  ${line}`);
}

if (skipped.length && args.has("--verbose")) {
  console.log("Skipped:");
  for (const line of skipped) console.log(`  ${line}`);
}

console.log(
  created.length
    ? "Commit src/content/blog, public/images/posts, and inbox/.sync-state.json, then push."
    : `Done. Fresh edits are skipped for ${ageMinutes} minutes unless --force.`,
);
