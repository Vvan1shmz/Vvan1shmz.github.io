import list from "./categories.json";

export const categories = list;

export type CategoryId = (typeof categories)[number]["id"];

export const categoryIds = categories.map((category) => category.id) as [
  CategoryId,
  ...CategoryId[],
];

export function getCategory(id: string) {
  return categories.find((category) => category.id === id);
}
