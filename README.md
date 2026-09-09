# Vvan1shmz

Personal site: https://vvan1shmz.github.io

## Write a post

```bash
npm run new-post -- "post title" notes
```

Categories: `notes` | `reading` | `making` | `research`. Default is `notes`.

The file lands in `src/content/blog/` as a draft. `npm run dev` shows drafts locally. Production hides them.

When it is ready:

```bash
npm run publish-post -- post-title
git add src/content/blog && git commit -m "Publish the new post." && git push
```

A GitHub Action rebuilds `docs/` and GitHub Pages updates. You do not need to run `npm run build` for a normal post.

`npm run publish-post` with no argument lists drafts.

## About

English: `src/content/pages/about.md`  
Chinese: `src/content/pages/about-zh.md`

Keep the two files in sync. After About edits, push the markdown; the Action rebuilds the site.
