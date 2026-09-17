"use client";

import { Loader2, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * Retry button for a submission whose evaluation failed.
 * The submission was never lost — this just runs the evaluator again and
 * awards the point if it is now due.
 */
export default function RetryEvaluation({
  id,
  attempts,
}: {
  id: string;
  attempts: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function retry() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/contributions/${id}/retry`, {
        method: "POST",
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "لم تنجح إعادة المحاولة.");
        return;
      }
      router.refresh();
    } catch (err) {
      setError((err as Error)?.message ?? "خطأ في الشبكة.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <Button size="sm" onClick={retry} disabled={busy}>
        {busy ? <Loader2 className="animate-spin" /> : <RefreshCw />}
        {busy ? "جارٍ التقييم" : "أعد التقييم"}
      </Button>
      <span className="text-xs text-muted-foreground">
        {attempts === 1 ? "محاولة واحدة حتى الآن" : `${attempts} محاولات`}
      </span>
      {error && (
        <span className="text-xs" style={{ color: "var(--destructive)" }}>
          {error}
        </span>
      )}
    </div>
  );
}
