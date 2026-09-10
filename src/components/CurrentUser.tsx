"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Member } from "@/lib/db/schema";

const STORAGE_KEY = "rased:member";

interface CurrentUserValue {
  members: Member[];
  member: Member | null;
  ready: boolean;
  setMemberId: (id: string | null) => void;
  refresh: () => Promise<void>;
}

const Ctx = createContext<CurrentUserValue | null>(null);

/**
 * "Who am I" for the whole app. No auth — just a name kept in localStorage,
 * which is all this MVP needs.
 */
export function CurrentUserProvider({ children }: { children: ReactNode }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [memberId, setId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/members", { cache: "no-store" });
      const data = (await res.json()) as { members: Member[] };
      setMembers(data.members ?? []);
    } catch {
      setMembers([]);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await refresh();
      if (cancelled) return;
      try {
        setId(localStorage.getItem(STORAGE_KEY));
      } catch {
        /* private mode — just stay signed out */
      }
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const setMemberId = useCallback((id: string | null) => {
    setId(id);
    try {
      if (id) localStorage.setItem(STORAGE_KEY, id);
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo<CurrentUserValue>(() => {
    const member = members.find((m) => m.id === memberId) ?? null;
    return { members, member, ready, setMemberId, refresh };
  }, [members, memberId, ready, setMemberId, refresh]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCurrentUser(): CurrentUserValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useCurrentUser must be used inside the provider");
  return ctx;
}
