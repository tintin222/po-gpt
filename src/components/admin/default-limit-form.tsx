"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { formatTokens } from "@/lib/utils";

export function DefaultLimitForm({ initialValue }: { initialValue: number }) {
  const router = useRouter();
  const [value, setValue] = useState(String(initialValue));
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defaultMonthlyTokenLimit: value }),
      });
      if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error);
      toast.success("Default limit saved");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const n = parseInt(value, 10);

  return (
    <form onSubmit={save} className="flex items-end gap-2">
      <div className="flex-1">
        <Input
          type="number"
          min={0}
          step={1000}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="0 = unlimited"
        />
        <p className="mt-1.5 text-xs text-muted-foreground">
          {Number.isFinite(n) && n > 0 ? `≈ ${formatTokens(n)} tokens per user per month` : "Unlimited"}
        </p>
      </div>
      <Button type="submit" disabled={saving}>
        {saving && <Spinner className="text-primary-foreground" />}
        Save
      </Button>
    </form>
  );
}
