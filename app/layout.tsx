import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MCP Conformance Scanner — grade any MCP server",
  description:
    "Free tool to scan an MCP server for protocol compliance, security, and Claude/OpenAI/Gemini/Bedrock compatibility. Get a grade, recommendations, and a shareable report.",
  openGraph: {
    title: "MCP Conformance Scanner",
    description:
      "Grade any MCP server on protocol compliance, security, and multi-model compatibility. Free.",
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
