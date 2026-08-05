"use client";

import { useState } from "react";

export type AccessProfile = {
  token: string;
  email: string;
  firstName: string;
};

const STORAGE_KEY = "mcp_access_v1";

export function loadStoredAccess(): AccessProfile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AccessProfile;
    if (!parsed?.token || !parsed?.email) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function persistAccess(profile: AccessProfile) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
}

export function AccessGate({
  onUnlocked,
}: {
  onUnlocked: (profile: AccessProfile) => void;
}) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [companySize, setCompanySize] = useState<"solo" | "small" | "mid" | "enterprise">("small");
  const [newsletter, setNewsletter] = useState(true);
  const [contributeTesting, setContributeTesting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/access", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          firstName,
          lastName,
          email,
          company,
          companySize,
          newsletter,
          contributeTesting,
        }),
      });
      const raw = await res.text();
      let data: { error?: string; token?: string } = {};
      try {
        data = raw ? (JSON.parse(raw) as typeof data) : {};
      } catch {
        throw new Error(raw?.slice(0, 200) || `Signup failed (HTTP ${res.status}).`);
      }
      if (!res.ok) throw new Error(data.error || `Could not continue (HTTP ${res.status})`);
      if (!data.token) throw new Error("Signup succeeded but no access token was returned.");
      const profile: AccessProfile = {
        token: data.token,
        email,
        firstName,
      };
      persistAccess(profile);
      onUnlocked(profile);
    } catch (err: any) {
      setError(err?.message ?? "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card p-5 md:p-6">
      <h2 className="text-lg font-semibold">Unlock your scan report</h2>
      <p className="text-sm text-sub mt-1.5">
        You give us a bit about yourself — we give you the grade and fixes. One-time step; free forever.
        Newsletter and testing opt-in are optional.
      </p>

      <form onSubmit={submit} className="mt-5 space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-sub">First name</label>
            <input className="input mt-1" required value={firstName} onChange={(e) => setFirstName(e.target.value)} autoComplete="given-name" />
          </div>
          <div>
            <label className="text-xs text-sub">Last name</label>
            <input className="input mt-1" required value={lastName} onChange={(e) => setLastName(e.target.value)} autoComplete="family-name" />
          </div>
        </div>

        <div>
          <label className="text-xs text-sub">Work email</label>
          <input className="input mt-1" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-sub">Company</label>
            <input className="input mt-1" required value={company} onChange={(e) => setCompany(e.target.value)} autoComplete="organization" />
          </div>
          <div>
            <label className="text-xs text-sub">Company size</label>
            <select
              className="input mt-1"
              value={companySize}
              onChange={(e) => setCompanySize(e.target.value as typeof companySize)}
            >
              <option value="solo">Solo / freelancer</option>
              <option value="small">Small company (2–50)</option>
              <option value="mid">Mid-size (51–500)</option>
              <option value="enterprise">Enterprise (500+)</option>
            </select>
          </div>
        </div>

        <label className="flex items-start gap-2.5 text-sm text-sub cursor-pointer">
          <input
            type="checkbox"
            className="mt-1"
            checked={newsletter}
            onChange={(e) => setNewsletter(e.target.checked)}
          />
          <span>Email me product updates / the ARC Labs newsletter</span>
        </label>

        <label className="flex items-start gap-2.5 text-sm text-sub cursor-pointer">
          <input
            type="checkbox"
            className="mt-1"
            checked={contributeTesting}
            onChange={(e) => setContributeTesting(e.target.checked)}
          />
          <span>I&apos;m open to helping test this free — you can reach out</span>
        </label>

        {error && <p className="text-sm text-bad">{error}</p>}

        <button type="submit" className="btn-primary w-full sm:w-auto" disabled={loading}>
          {loading ? "Unlocking…" : "Continue to my report"}
        </button>

        <p className="text-[11px] text-sub">
          We use this to contact you about the scanner and ARC Labs. No password. Don&apos;t paste secrets into scan headers on a shared demo.
        </p>
      </form>
    </div>
  );
}
