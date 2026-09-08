import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";
import { categoryIds } from "./data/categories";

const blog = defineCollection({
  loader: glob({ pattern: "**/[^_]*.md", base: "./src/content/blog" }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    description: z.string(),
    category: z.enum(categoryIds).default("notes"),
    draft: z.boolean().optional().default(false),
  }),
});

const pages = defineCollection({
  loader: glob({ pattern: "*.md", base: "./src/content/pages" }),
  schema: z.object({
    lede: z.string(),
    goal: z.string(),
    beliefs: z.array(z.string()),
    likes: z.string(),
    dislikes: z.array(z.string()),
  }),
});

export const collections = { blog, pages };
