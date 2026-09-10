import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  statSync,
} from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const config = JSON.parse(
  readFileSync(join(root, "obsidian-sync.config.json"), "utf8"),
);
const statePath = join(root, "inbox", ".sync-state.json");
const blogDir = join(root, "src/content/blog");
const inboxDir = join(root, config.inboxFolder);
const allowed = new Set(config.categories);

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const fromInboxOnly = args.has("--inbox-only");

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

function stripCategoryMarks(title) {
  return title
    .replace(/[\[【#]?\s*(notes|reading|making|research|笔记|阅读|制作|研究)\s*[\]】]?\s*[:：·-]?\s*/gi, "")
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

function buildPost({ title, date, description, category, body }) {
  return `---
title: ${yamlQuote(title)}
date: ${date}
description: ${yamlQuote(description)}
category: ${category}
draft: false
---

${body.trim()}\n`;
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

for (const source of sources) {
  for (const file of walkMarkdown(source.dir)) {
    const rel = `${source.label}:${relative(source.dir, file)}`;
    if (seen.has(file)) continue;
    seen.add(file);

    const text = readFileSync(file, "utf8");
    const digest = hashText(text);
    const prev = state.files[rel];
    if (prev?.hash === digest) {
      skipped.push(`${rel} (unchanged)`);
      continue;
    }

    const { data, body } = parseFrontmatter(text);
    if (!isPublishable(data, body)) {
      skipped.push(`${rel} (not marked publish)`);
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
    const description =
      (typeof data.description === "string" && data.description) ||
      firstParagraph(body) ||
      title;
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

    const post = buildPost({ title, date, description, category, body });
    if (dryRun) {
      created.push(`${rel} -> ${slug}.md (${category}) [dry-run]`);
      continue;
    }

    writeFileSync(outPath, post);
    state.files[rel] = { hash: digest, slug, category, syncedAt: new Date().toISOString() };
    created.push(`${rel} -> src/content/blog/${slug}.md (${category})`);
  }
}

if (!dryRun && created.length) saveState(state);

if (created.length) {
  console.log("Synced:");
  for (const line of created) console.log(`  ${line}`);
} else {
  console.log("Nothing new to publish.");
}

if (skipped.length && args.has("--verbose")) {
  console.log("Skipped:");
  for (const line of skipped) console.log(`  ${line}`);
}

console.log(
  created.length
    ? "Commit src/content/blog and inbox/.sync-state.json, then push."
    : "Done.",
);
