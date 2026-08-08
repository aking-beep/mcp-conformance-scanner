import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ARC Labs 0.9 Beta — MCP Conformance Scanner",
  description:
    "Scan your MCP server for production readiness in under 30 seconds. Free security checks, configuration validation, and best-practice recommendations.",
  openGraph: {
    title: "ARC Labs — MCP Conformance Scanner (0.9 Beta)",
    description:
      "Free · Open Source. Scan MCP servers for production readiness — score, severity, actionable fixes.",
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
