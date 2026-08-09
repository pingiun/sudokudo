/**
 * Backtracking sudoku solver with solution counting.
 *
 * Grids are Uint8Array(81), row-major, 0 = empty, 1-9 = digit.
 * Only the *count* of solutions ever leaves this module, so internal search
 * order does not affect the deterministic puzzle output.
 */

export const GRID_SIZE = 81;

export function rowOf(index: number): number {
  return Math.floor(index / 9);
}

export function colOf(index: number): number {
  return index % 9;
}

export function boxOf(index: number): number {
  return Math.floor(rowOf(index) / 3) * 3 + Math.floor(colOf(index) / 3);
}

const ALL_CANDIDATES = 0b1111111110; // bits 1..9 set

interface Masks {
  rows: number[];
  cols: number[];
  boxes: number[];
}

/** Build used-digit bitmasks per row/col/box. Returns null if the grid has a direct conflict. */
function buildMasks(grid: Uint8Array): Masks | null {
  const rows = new Array<number>(9).fill(0);
  const cols = new Array<number>(9).fill(0);
  const boxes = new Array<number>(9).fill(0);
  for (let i = 0; i < GRID_SIZE; i++) {
    const digit = grid[i]!;
    if (digit === 0) continue;
    const bit = 1 << digit;
    const r = rowOf(i);
    const c = colOf(i);
    const b = boxOf(i);
    if ((rows[r]! & bit) || (cols[c]! & bit) || (boxes[b]! & bit)) return null;
    rows[r]! |= bit;
    cols[c]! |= bit;
    boxes[b]! |= bit;
  }
  return { rows, cols, boxes };
}

function candidatesFor(masks: Masks, index: number): number {
  const used = masks.rows[rowOf(index)]! | masks.cols[colOf(index)]! | masks.boxes[boxOf(index)]!;
  return ALL_CANDIDATES & ~used;
}

function popcount(x: number): number {
  let count = 0;
  while (x) {
    x &= x - 1;
    count++;
  }
  return count;
}

/**
 * Count solutions of the grid, stopping early once `limit` is reached.
 * Uses minimum-remaining-values cell selection to keep the search fast.
 */
export function countSolutions(grid: Uint8Array, limit = 2): number {
  const masks = buildMasks(grid);
  if (masks === null) return 0;
  const work = grid.slice();
  let count = 0;

  function search(): void {
    if (count >= limit) return;

    // Pick the empty cell with the fewest candidates.
    let bestIndex = -1;
    let bestCandidates = 0;
    let bestCount = 10;
    for (let i = 0; i < GRID_SIZE; i++) {
      if (work[i] !== 0) continue;
      const cands = candidatesFor(masks!, i);
      const n = popcount(cands);
      if (n === 0) return; // dead end
      if (n < bestCount) {
        bestCount = n;
        bestIndex = i;
        bestCandidates = cands;
        if (n === 1) break;
      }
    }

    if (bestIndex === -1) {
      count++;
      return;
    }

    const r = rowOf(bestIndex);
    const c = colOf(bestIndex);
    const b = boxOf(bestIndex);
    for (let digit = 1; digit <= 9; digit++) {
      const bit = 1 << digit;
      if (!(bestCandidates & bit)) continue;
      work[bestIndex] = digit;
      masks!.rows[r]! |= bit;
      masks!.cols[c]! |= bit;
      masks!.boxes[b]! |= bit;
      search();
      work[bestIndex] = 0;
      masks!.rows[r]! &= ~bit;
      masks!.cols[c]! &= ~bit;
      masks!.boxes[b]! &= ~bit;
      if (count >= limit) return;
    }
  }

  search();
  return count;
}

/** True if the grid has exactly one solution. */
export function hasUniqueSolution(grid: Uint8Array): boolean {
  return countSolutions(grid, 2) === 1;
}

/** True if the completely filled grid satisfies all sudoku constraints. */
export function isValidSolution(grid: Uint8Array): boolean {
  if (grid.length !== GRID_SIZE) return false;
  for (let i = 0; i < GRID_SIZE; i++) {
    const digit = grid[i]!;
    if (digit < 1 || digit > 9) return false;
  }
  return buildMasks(grid) !== null;
}
