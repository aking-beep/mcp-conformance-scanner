// Letter-grade ordering helpers for CLI / CI gating.

import type { Grade } from "./types";

const ORDER: Grade[] = ["F", "D", "C-", "C", "C+", "B-", "B", "B+", "A-", "A", "A+"];

export function parseGrade(input: string): Grade | null {
  const g = input.trim().toUpperCase() as Grade;
  return ORDER.includes(g) ? g : null;
}

export function gradeRank(grade: string): number {
  const idx = ORDER.indexOf(grade.toUpperCase() as Grade);
  return idx === -1 ? -1 : idx;
}

/** True when `actual` meets or exceeds `minimum`. */
export function meetsMinGrade(actual: string, minimum: string): boolean {
  return gradeRank(actual) >= gradeRank(minimum);
}

export const GRADE_LIST = ORDER.join(" | ");
