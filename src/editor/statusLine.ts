/**
 * Story 200: what the Status line says about the Document's length. The count
 * itself is `wordCount` over the canonical text, the same one the Library and
 * Revisions show, so every word count in Obelus agrees.
 */
export function wordCountLabel(count: number): string {
  return `${count.toLocaleString("en")} ${count === 1 ? "word" : "words"}`;
}

/**
 * Story 253: how the Status line offers the Rail below 1024px, with the count
 * of open Findings, so the Writer sees how much work is waiting without
 * opening it. "open" is the word the Rail's own count uses.
 */
export function railOfferLabel(openFindingCount: number): string {
  return `Rail · ${openFindingCount.toLocaleString("en")} open`;
}
