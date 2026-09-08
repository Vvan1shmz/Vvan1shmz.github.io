import { getCollection, type CollectionEntry } from "astro:content";
import { categories, getCategory, type CategoryId } from "../data/categories";

export type BlogPost = CollectionEntry<"blog">;

export async function getPublishedPosts(): Promise<BlogPost[]> {
  try {
    return (await getCollection("blog", ({ data }) => !data.draft)).sort(
      (a, b) => b.data.date.valueOf() - a.data.date.valueOf(),
    );
  } catch {
    return [];
  }
}

export function formatDate(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${m}-${d}-${y}`;
}

export function postsInCategory(posts: BlogPost[], category: CategoryId) {
  return posts.filter((post) => post.data.category === category);
}

export function usedCategories(posts: BlogPost[]) {
  const present = new Set(posts.map((post) => post.data.category));
  return categories.filter((category) => present.has(category.id));
}

export function groupedPosts(posts: BlogPost[]) {
  return usedCategories(posts).map((category) => ({
    ...category,
    posts: postsInCategory(posts, category.id),
  }));
}

export { getCategory };
