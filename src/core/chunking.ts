import type { Interval } from "./finding";
import type { Target, TargetStructure } from "./target";

/**
 * Story 50: a Document past the character limit is chunked rather than refused
 * or silently truncated, so long pieces still get structural Passes. The split
 * is made in the one canonical string — the same coordinate system Containment
 * and Anchors use — at Section boundaries where possible, and at top-level
 * block boundaries when a single Section is itself too long. Each chunk keeps
 * the whole Document's canonical string and its own interval within it, so a
 * Finding the model returns is anchored in global coordinates and Containment
 * still measures it against the text the model actually saw.
 *
 * The limit is a setting (`DEFAULT_CHARACTER_LIMIT` is only the seed) and it
 * bounds the whole model input, overlap included: a chunk is over the limit
 * only when one indivisible block is. The overlap repeats whole preceding
 * blocks at the start of the next chunk so a problem at a boundary is visible
 * from both sides. Pure and DOM-free.
 */
export const DEFAULT_CHARACTER_LIMIT = 12_000;

/** The smallest limit a Writer can set, so a Document is never chunked into
 * single characters. The setting and the UI share this one floor. */
export const MIN_CHARACTER_LIMIT = 500;

/**
 * The context repeated at the start of the next chunk. It is a budget in
 * characters, rounded out to whole blocks: every chunk after the first carries
 * at least one whole preceding block, and more while they fit within the
 * budget. A block longer than the budget still overlaps, because cutting it
 * mid-prose would hand the model a fragment; the chunk's own text is shortened
 * so the total still fits.
 */
export const CHUNK_OVERLAP = 400;

/**
 * Splits a document-scope Target into Targets that each fit under `limit`,
 * Section by Section, with preceding-block overlap at each boundary. Returns a
 * one-element list — the Target itself — when it already fits or when it
 * carries no structure (a local Scope or an already-chunked Target).
 *
 * A single block longer than the limit is emitted as its own chunk rather than
 * cut mid-prose: a chunk may exceed the limit only when no boundary exists to
 * split on.
 */
export function chunkTarget(
  target: Target,
  limit: number,
  overlap: number = CHUNK_OVERLAP,
): Target[] {
  if (!Number.isFinite(limit) || limit <= 0) return [target];
  if (target.text.length <= limit) return [target];

  const structure = target.structure;
  if (structure === undefined || structure.blocks.length < 2) return [target];

  const packed = packUnits(structure, limit, overlap);
  if (packed.length > 0) {
    // The blocks omit the final newline the canonical string ends with, so the
    // outer bounds are pinned to the Target's own interval: the Run covers
    // exactly the text it was asked about, neither short nor over.
    packed[0].start = Math.min(packed[0].start, target.interval.start);
    packed[packed.length - 1].end = Math.max(packed[packed.length - 1].end, target.interval.end);
  }
  return packed.map((interval) => subTarget(target, interval, overlap, structure.blocks));
}

/**
 * The units chunking packs, largest-preference first: the preamble before the
 * first heading, then one unit per Section. When the Document has no headings
 * every top-level block is its own unit, so the split still happens.
 */
function chunkUnits(structure: TargetStructure): Interval[] {
  const blocks = structure.blocks;
  const sections = structure.sections;
  if (sections.length === 0) return blocks.map((block) => ({ ...block }));

  const units: Interval[] = [];
  const firstSectionStart = sections[0].start;
  const preamble = blocks.filter((block) => block.end <= firstSectionStart);
  if (preamble.length > 0) {
    units.push({ start: preamble[0].start, end: preamble[preamble.length - 1].end });
  }
  for (const section of sections) units.push({ ...section });
  return units;
}

/**
 * Greedily packs units under the limit, keeping whole Sections together when
 * they fit. A unit that is itself over the limit once its overlap is included
 * (a Section longer than one call) is split at its block boundaries instead, so
 * no unit is ever simply refused.
 */
function packUnits(structure: TargetStructure, limit: number, overlap: number): Interval[] {
  const units = chunkUnits(structure);
  const blocks = structure.blocks;
  const chunks: Interval[] = [];
  let current: Interval | null = null;

  for (const unit of units) {
    if (expandedLength(unit.start, unit.end, blocks, overlap) > limit) {
      if (current !== null) {
        chunks.push(current);
        current = null;
      }
      const within = blocks.filter((block) => block.start >= unit.start && block.end <= unit.end);
      chunks.push(...greedyPack(within, limit, blocks, overlap));
      continue;
    }
    if (current === null) {
      current = { ...unit };
      continue;
    }
    if (expandedLength(current.start, unit.end, blocks, overlap) <= limit) {
      current.end = unit.end;
    } else {
      chunks.push(current);
      current = { ...unit };
    }
  }

  if (current !== null) chunks.push(current);
  return chunks;
}

/**
 * Extends the current chunk while the next interval would still fit under the
 * limit once the chunk's own overlap is included, otherwise starts a new one. A
 * single interval longer than the limit is emitted alone rather than cut.
 */
function greedyPack(
  intervals: Interval[],
  limit: number,
  blocks: Interval[],
  overlap: number,
): Interval[] {
  const chunks: Interval[] = [];
  let current: Interval | null = null;

  for (const interval of intervals) {
    if (current === null) {
      current = { ...interval };
    } else if (expandedLength(current.start, interval.end, blocks, overlap) <= limit) {
      current.end = interval.end;
    } else {
      chunks.push(current);
      current = { ...interval };
    }
  }

  if (current !== null) chunks.push(current);
  return chunks;
}

/** A chunk's own text plus the overlap its start pulls in. */
function expandedLength(
  start: number,
  end: number,
  blocks: Interval[],
  overlap: number,
): number {
  return end - overlapStart(start, blocks, overlap);
}

/**
 * One chunk as a Target. The canonical string and the outline stay the whole
 * Document's, so the Finding's coordinates are global; only the interval, the
 * text and the `{{document}}` value change. The structure is dropped so an
 * already-chunked Target is never chunked again.
 */
function subTarget(
  target: Target,
  interval: Interval,
  overlap: number,
  blocks: Interval[],
): Target {
  const start = overlapStart(interval.start, blocks, overlap);
  const chunk = { start, end: interval.end };
  const text = target.canonical.slice(chunk.start, chunk.end);
  return {
    ...target,
    interval: chunk,
    text,
    documentText: text,
    contextAbove: "",
    contextBelow: "",
    structure: undefined,
  };
}

/**
 * Moves a chunk's start back over whole preceding blocks so a problem at the
 * boundary is visible from both sides. Every chunk after the first carries at
 * least the immediately preceding block; more are included while they fit
 * within `overlap`. The first chunk already starts at 0 and never moves.
 */
function overlapStart(start: number, blocks: Interval[], overlap: number): number {
  if (overlap <= 0) return start;
  const index = blocks.findIndex((block) => block.start === start);
  if (index <= 0) return start;

  let chosen = index - 1;
  while (chosen > 0 && blocks[index].start - blocks[chosen - 1].start <= overlap) {
    chosen -= 1;
  }
  return blocks[chosen].start;
}
