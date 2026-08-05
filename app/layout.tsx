import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ARC Labs 0.1 — MCP Conformance Scanner",
  description:
    "Free open-source tool to scan an MCP server for protocol compliance, security, and Claude/OpenAI/Gemini/Bedrock compatibility. Overall score, actionable fixes, Markdown export.",
  openGraph: {
    title: "ARC Labs 0.1 — MCP Conformance Scanner",
    description:
      "Free · Open Source · Community Project. Grade any MCP server — score, fixes, shareable report.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans">{children}</body>
    </html>
  );
}
