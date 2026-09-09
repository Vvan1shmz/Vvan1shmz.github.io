import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, "src/content/blog");

function isDraft(text) {
  const end = text.indexOf("\n---", 3);
  if (!text.startsWith("---") || end < 0) return false;
  return /^draft:\s*true\s*$/m.test(text.slice(0, end));
}

function listDrafts() {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".md") && !name.startsWith("_"))
    .filter((name) => isDraft(readFileSync(join(dir, name), "utf8")))
    .map((name) => name.slice(0, -3));
}

const slug = process.argv[2]?.trim();

if (!slug) {
  const drafts = listDrafts();
  if (!drafts.length) {
    console.log("No drafts.");
    process.exit(0);
  }
  console.log("Drafts:");
  for (const id of drafts) console.log(`  ${id}`);
  console.log('\nPublish one with: npm run publish-post -- "' + drafts[0] + '"');
  process.exit(0);
}

const file = join(dir, `${slug}.md`);
let text;
try {
  text = readFileSync(file, "utf8");
} catch {
  console.error(`Missing src/content/blog/${slug}.md`);
  process.exit(1);
}

const end = text.indexOf("\n---", 3);
if (!text.startsWith("---") || end < 0) {
  console.error("That file has no frontmatter.");
  process.exit(1);
}

const fm = text.slice(0, end);
const rest = text.slice(end);
if (/^draft:\s*false\s*$/m.test(fm)) {
  console.log(`Already published: src/content/blog/${slug}.md`);
  process.exit(0);
}

let nextFm = fm.replace(/^draft:\s*true\s*$/m, "draft: false");
if (nextFm === fm) nextFm = `${fm}\ndraft: false`;
writeFileSync(file, `${nextFm}${rest}`);
console.log(`Published src/content/blog/${slug}.md`);
console.log("Push to main and GitHub Pages will rebuild.");
