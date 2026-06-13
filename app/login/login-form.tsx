"use client";

import { useActionState } from "react";
import { Tractor, LogIn } from "lucide-react";
import { login, type LoginState } from "./actions";

const initialState: LoginState = {};

export function LoginForm() {
  const [state, formAction, pending] = useActionState(login, initialState);

  return (
    <div className="min-h-screen bg-stone-100 flex flex-col justify-center px-5">
      <div className="max-w-md mx-auto w-full">
        {/* Brand header */}
        <div className="bg-stone-900 text-white rounded-3xl px-6 py-7 shadow-lg mb-5">
          <div className="flex items-center gap-2">
            <Tractor className="w-6 h-6 text-green-400" />
            <span className="font-extrabold uppercase tracking-tight text-xl">
              MowRoute
            </span>
          </div>
          <p className="text-stone-400 text-sm mt-2">
            Sign in to work the route.
          </p>
        </div>

        {/* Sign-in card */}
        <form
          action={formAction}
          className="bg-white rounded-3xl border border-stone-200 p-6 shadow-sm"
        >
          <label className="block text-xs font-bold uppercase tracking-wide text-stone-400 mb-1.5">
            Email
          </label>
          <input
            name="email"
            type="email"
            autoComplete="email"
            autoCapitalize="none"
            required
            placeholder="you@example.com"
            className="w-full rounded-xl border border-stone-200 px-3 py-3 text-base outline-none focus:border-green-500 mb-4"
          />

          <label className="block text-xs font-bold uppercase tracking-wide text-stone-400 mb-1.5">
            Password
          </label>
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
            placeholder="••••••••"
            className="w-full rounded-xl border border-stone-200 px-3 py-3 text-base outline-none focus:border-green-500 mb-4"
          />

          {state.error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2 mb-4">
              {state.error}
            </div>
          )}

          <button
            type="submit"
            disabled={pending}
            className="w-full py-3.5 rounded-xl font-bold uppercase tracking-wide flex items-center justify-center gap-2 bg-green-600 text-white disabled:bg-stone-200 disabled:text-stone-400 active:scale-[0.99] transition"
          >
            <LogIn className="w-5 h-5" />
            {pending ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="text-xs text-stone-400 text-center mt-5 px-4">
          Accounts are created by Katy. Ask the owner if you need access.
        </p>
      </div>
    </div>
  );
}
