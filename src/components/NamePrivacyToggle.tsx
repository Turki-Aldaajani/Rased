"use client";

import { useState } from "react";
import { useCurrentUser } from "@/components/CurrentUser";
import { Chip } from "@/components/ui/chip";

/**
 * Self-service switch for showing/hiding a member's name on the public
 * discovery cards. Only the member themself can see or flip it — same
 * ownership check as `useCurrentUser` uses everywhere else, no real auth.
 */
export function NamePrivacyToggle({
  memberId,
  initialValue,
}: {
  memberId: string;
  initialValue: boolean;
}) {
  const { member } = useCurrentUser();
  const [value, setValue] = useState(initialValue);
  const [busy, setBusy] = useState(false);

  if (member?.id !== memberId) return null;

  async function toggle() {
    const next = !value;
    setBusy(true);
    try {
      await fetch(`/api/members/${memberId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ showNameOnDiscoveries: next }),
      });
      setValue(next);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Chip selected={value} disabled={busy} onClick={toggle}>
      {value ? "اسمي ظاهر على الاكتشافات" : "اسمي مخفي على الاكتشافات"}
    </Chip>
  );
}
