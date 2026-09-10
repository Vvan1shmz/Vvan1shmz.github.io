# Vvan1shmz

Personal site: https://vvan1shmz.github.io

## Write a post

```bash
npm run new-post -- "post title" notes
```

Categories: `notes` | `reading` | `making` | `research` | `talk`. Default is `notes`.

The file lands in `src/content/blog/` as a draft. `npm run dev` shows drafts locally. Production hides them.

When it is ready:

```bash
npm run publish-post -- post-title
git add src/content/blog && git commit -m "Publish the new post." && git push
```

A GitHub Action rebuilds `docs/` and GitHub Pages updates. You do not need to run `npm run build` for a normal post.

`npm run publish-post` with no argument lists drafts.

## Obsidian diary

Write daily notes in the Obsidian vault folder `Diary/` (template: `Templates/Diary`).

1. Put the category in the title: `[notes]`, `[reading]`, `[making]`, `[research]`, `[talk]` (or 笔记 / 阅读 / 制作 / 研究 / 杂谈).
2. When the note should go live, set `publish: true` (or add `#blog`).
3. Sync:

```bash
npm run sync-diary
```

Notes edited in the last 30 minutes are skipped (so a daily run will not grab a half-written diary). Use `--force` only when you mean it.

Then commit and push the new files under `src/content/blog/` (and `inbox/.sync-state.json` if it changed). A daily Cursor Automation can run this check for you.

The script also reads `inbox/diary/` in this repo, so notes that are already on GitHub can sync in the cloud.

Posts are bilingual. Source language is `lang: en` or `lang: zh`. Put the other title in `titleOther`, and split the body with `<!--lang:en-->` / `<!--lang:zh-->`. The site language toggle switches which version you see. Missing translations fall back to the source text with a short note.

## About

English: `src/content/pages/about.md`  
Chinese: `src/content/pages/about-zh.md`

Keep the two files in sync. After About edits, push the markdown; the Action rebuilds the site.
