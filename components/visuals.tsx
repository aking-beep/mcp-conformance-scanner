"use client";

import type { CheckStatus, Grade } from "@/lib/mcp/types";

export function colorForScore(score: number): string {
  if (score >= 85) return "#35d0a5";
  if (score >= 70) return "#8bd06b";
  if (score >= 55) return "#f0b23a";
  return "#f0554d";
}

export function statusMeta(status: CheckStatus): { glyph: string; color: string; label: string } {
  switch (status) {
    case "pass":
      return { glyph: "✓", color: "#35d0a5", label: "Pass" };
    case "warn":
      return { glyph: "!", color: "#f0b23a", label: "Warn" };
    case "fail":
      return { glyph: "✗", color: "#f0554d", label: "Fail" };
    default:
      return { glyph: "–", color: "#5c6b85", label: "N/A" };
  }
}

export function StatusChip({ status, text }: { status: CheckStatus; text?: string }) {
  const m = statusMeta(status);
  return (
    <span
      className="pill"
      style={{ borderColor: m.color + "55", color: m.color, background: m.color + "12" }}
    >
      <span className="font-bold">{m.glyph}</span>
      {text ?? m.label}
    </span>
  );
}

export function ScoreBar({ score }: { score: number }) {
  const color = colorForScore(score);
  return (
    <div className="track">
      <span
        style={{ width: `${Math.max(3, score)}%`, background: color, transition: "width .8s cubic-bezier(.2,.7,.2,1)" }}
      />
    </div>
  );
}

export function Gauge({ score, size = 132, label }: { score: number; size?: number; label?: string }) {
  const stroke = 12;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score)) / 100;
  const color = colorForScore(score);
  return (
    <div className="relative inline-grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#232c3d" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - pct)}
          style={{ transition: "stroke-dashoffset 1s cubic-bezier(.2,.7,.2,1)" }}
        />
      </svg>
      <div className="absolute text-center">
        <div className="text-3xl font-bold" style={{ color }}>{score}</div>
        {label && <div className="text-[11px] uppercase tracking-wide text-sub">{label}</div>}
      </div>
    </div>
  );
}

const GRADE_COLOR: Record<string, string> = {
  A: "#35d0a5",
  B: "#8bd06b",
  C: "#f0b23a",
  D: "#f08a3a",
  F: "#f0554d",
};

export function GradeBadge({ grade, size = "lg" }: { grade: Grade; size?: "lg" | "sm" }) {
  const base = grade[0];
  const color = GRADE_COLOR[base] ?? "#93a0b7";
  const dim = size === "lg" ? "h-24 w-24 text-5xl" : "h-12 w-12 text-xl";
  return (
    <div
      className={`grid place-items-center rounded-2xl font-bold ${dim}`}
      style={{ color, background: color + "14", border: `1px solid ${color}55`, boxShadow: `0 0 40px -12px ${color}` }}
    >
      {grade}
    </div>
  );
}
