"use client";

import { LockKeyhole } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function AdminLogin() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/admin/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: form.get("password") }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Sign-in failed.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sign-in failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className="mx-auto max-w-md">
      <CardHeader>
        <span className="mb-3 grid size-10 place-items-center rounded-xl bg-lime-300/10 text-lime-300">
          <LockKeyhole aria-hidden="true" className="size-5" />
        </span>
        <CardTitle>Admin sign in</CardTitle>
        <CardDescription>
          Enter the private admin password to manage leagues and imports.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <label
              className="mb-1.5 block text-sm font-medium text-zinc-200"
              htmlFor="admin-password"
            >
              Password
            </label>
            <input
              autoComplete="current-password"
              autoFocus
              className="h-11 w-full rounded-xl border border-white/10 bg-zinc-950 px-3 text-white outline-none focus:border-lime-300/60 focus:ring-2 focus:ring-lime-300/20"
              id="admin-password"
              name="password"
              required
              type="password"
            />
          </div>
          {error ? (
            <p className="text-sm text-red-300" role="alert">
              {error}
            </p>
          ) : null}
          <Button className="w-full" disabled={pending} type="submit">
            {pending ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
