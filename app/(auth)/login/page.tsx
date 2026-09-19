"use client";

import Image from "next/image";
import { useActionState } from "react";
import { ArrowRight, Lock, Mail } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { login } from "./actions";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(login, undefined);

  return (
    <div className="bg-background flex min-h-screen items-center justify-center p-6">
      <div className="border-border bg-card w-full max-w-md rounded-xl border p-8 shadow-sm">
        <div className="text-center">
          <h1 className="text-foreground flex items-center justify-center gap-2 text-2xl font-bold">
            <Image src="/logo.png" alt="ErrorZero" width={32} height={32} className="rounded-sm" />
            ErrorZero
          </h1>
          <p className="text-muted-foreground mt-1.5 text-sm">
            Precision Engineering &amp; Bug Tracking
          </p>
        </div>

        <div className="border-border my-6 border-t" />

        <form action={formAction} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Work Email</Label>
            <div className="relative">
              <Mail className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="engineer@errorzero.dev"
                className="h-10 pl-9"
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Lock className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                className="h-10 pl-9"
                required
              />
            </div>
          </div>

          {state?.error ? (
            <p className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm">
              {state.error}
            </p>
          ) : null}

          <div className="flex items-center gap-2">
            <Checkbox id="remember" name="remember" />
            <Label htmlFor="remember" className="text-muted-foreground font-normal">
              Remember me
            </Label>
          </div>

          <Button type="submit" disabled={pending} className="h-10 w-full text-sm">
            {pending ? "Signing in..." : "Login"} <ArrowRight />
          </Button>
        </form>

        <div className="border-border my-6 border-t" />

        <p className="text-muted-foreground text-center text-xs leading-relaxed">
          Secure connection established.
          <br />
          Access restricted to authorized personnel.
        </p>
      </div>
    </div>
  );
}
