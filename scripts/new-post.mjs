import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const categories = JSON.parse(
  readFileSync(join(root, "src/data/categories.json"), "utf8"),
);
const allowed = new Set(categories.map((item) => item.id));

const title = process.argv[2]?.trim();
const category = (process.argv[3] ?? "notes").trim();

if (!title) {
  console.error('Usage: npm run new-post -- "post title" [category]');
  console.error(`Categories: ${[...allowed].join(", ")}`);
  process.exit(1);
}

if (!allowed.has(category)) {
  console.error(`Unknown category "${category}". Use: ${[...allowed].join(", ")}`);
  process.exit(1);
}

const slug = title
  .normalize("NFKD")
  .replace(/[^\w\s-]/g, "")
  .trim()
  .toLowerCase()
  .replace(/[\s_]+/g, "-")
  .replace(/-+/g, "-");

if (!slug || slug === "category") {
  console.error("That title does not make a usable filename.");
  process.exit(1);
}

const dir = join(root, "src/content/blog");
mkdirSync(dir, { recursive: true });
const file = join(dir, `${slug}.md`);

if (existsSync(file)) {
  console.error(`Already exists: src/content/blog/${slug}.md`);
  process.exit(1);
}

const today = new Date();
const date = [
  today.getFullYear(),
  String(today.getMonth() + 1).padStart(2, "0"),
  String(today.getDate()).padStart(2, "0"),
].join("-");

writeFileSync(
  file,
  `---
title: ${JSON.stringify(title)}
date: ${date}
description: ""
category: ${category}
draft: true
---

`,
);

console.log(`Created src/content/blog/${slug}.md (${category}, draft)`);
console.log("Set draft: false when it should go on the site, then run npm run build.");
