/** The computed value of a CSS custom property, trimmed. */
export function cssVar(name: string, root: Element = document.documentElement): string {
  return getComputedStyle(root).getPropertyValue(name).trim();
}
