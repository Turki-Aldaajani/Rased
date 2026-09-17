"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

/** The host passcode form, shown until the editor is signed in. */
export default function AdminGate({
  ready,
  authed,
  onSignIn,
  children,
}: {
  ready: boolean;
  authed: boolean;
  onSignIn: (passcode: string) => Promise<boolean>;
  children: ReactNode;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!ready) return <Card className="h-40" />;
  if (authed) return <>{children}</>;

  return (
    <div className="mx-auto max-w-sm py-10">
      <Card className="p-5">
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            if (!(await onSignIn(value))) setError("رمز الدخول غير صحيح.");
          }}
        >
          <div>
            <h1 className="text-base font-semibold text-foreground">
              منطقة المضيف
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              أدخل رمز الدخول المشترك لإدارة النشرة.
            </p>
          </div>
          <Input
            type="password"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="رمز الدخول"
            autoFocus
          />
          {error && (
            <p className="text-sm" style={{ color: "var(--destructive)" }}>
              {error}
            </p>
          )}
          <Button type="submit" className="w-full">
            فتح
          </Button>
        </form>
      </Card>
    </div>
  );
}
