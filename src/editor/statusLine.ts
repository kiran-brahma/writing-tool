/**
 * Story 200: what the Status line says about the Document's length. The count
 * itself is `wordCount` over the canonical text, the same one the Library and
 * Revisions show, so every word count in Obelus agrees.
 */
export function wordCountLabel(count: number): string {
  return `${count.toLocaleString("en")} ${count === 1 ? "word" : "words"}`;
}
