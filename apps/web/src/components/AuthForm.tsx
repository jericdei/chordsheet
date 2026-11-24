"use client";

import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useTRPC } from "@/lib/trpc";
import { Button, Field, Input, Spinner, errorMessage } from "./ui";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const onSuccess = () => {
    router.replace("/setlists");
    router.refresh();
  };
  const login = useMutation(trpc.auth.login.mutationOptions({ onSuccess }));
  const register = useMutation(trpc.auth.register.mutationOptions({ onSuccess }));
  const mutation = mode === "login" ? login : register;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (mode === "login") login.mutate({ email: form.email, password: form.password });
    else register.mutate(form);
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">{mode === "login" ? "Welcome back" : "Create your account"}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {mode === "login" ? "Sign in to your songs and setlists." : "Start building chord sheets and setlists."}
        </p>
      </div>
      {mode === "register" && (
        <Field label="Name">
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoComplete="name" placeholder="Optional" />
        </Field>
      )}
      <Field label="Email">
        <Input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} autoComplete="email" autoFocus />
      </Field>
      <Field label="Password" hint={mode === "register" ? "At least 8 characters" : undefined}>
        <Input
          type="password"
          required
          minLength={mode === "register" ? 8 : 1}
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          autoComplete={mode === "login" ? "current-password" : "new-password"}
        />
      </Field>
      {mutation.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{errorMessage(mutation.error)}</p>}
      <Button type="submit" variant="primary" className="w-full justify-center" disabled={mutation.isPending}>
        {mutation.isPending && <Spinner />}
        {mode === "login" ? "Sign in" : "Create account"}
      </Button>
      <p className="text-center text-sm text-slate-500">
        {mode === "login" ? (
          <>
            New here? <Link href="/register" className="font-medium text-brand-600 hover:underline">Create an account</Link>
          </>
        ) : (
          <>
            Already have an account? <Link href="/login" className="font-medium text-brand-600 hover:underline">Sign in</Link>
          </>
        )}
      </p>
    </form>
  );
}
