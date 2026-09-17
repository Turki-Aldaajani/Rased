"use client";

import { useCallback, useEffect, useState } from "react";

const PASS_KEY = "rased:admin";

/**
 * The same shared passcode the host area already uses, kept in sessionStorage.
 * Newsletter pages reuse it so an editor signs in once.
 */
export function useAdminSession() {
  const [passcode, setPasscode] = useState("");
  const [authed, setAuthed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = sessionStorage.getItem(PASS_KEY);
    } catch {
      /* private mode */
    }
    if (!stored) {
      setReady(true);
      return;
    }
    (async () => {
      const res = await fetch("/api/admin/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode: stored }),
      });
      if (res.ok) {
        setPasscode(stored!);
        setAuthed(true);
      }
      setReady(true);
    })();
  }, []);

  const signIn = useCallback(async (value: string) => {
    const res = await fetch("/api/admin/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passcode: value }),
    });
    if (!res.ok) return false;
    try {
      sessionStorage.setItem(PASS_KEY, value);
    } catch {
      /* ignore */
    }
    setPasscode(value);
    setAuthed(true);
    return true;
  }, []);

  /** fetch() with the passcode header attached. */
  const send = useCallback(
    async (url: string, init: RequestInit = {}) =>
      fetch(url, {
        ...init,
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          "x-admin-passcode": passcode,
          ...(init.headers ?? {}),
        },
      }),
    [passcode],
  );

  return { passcode, authed, ready, signIn, send };
}
