"use client";

import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";

export function MonthPicker({ month }: { month: string }) {
  const router = useRouter();
  return (
    <Input
      type="month"
      value={month}
      onChange={(e) => {
        if (e.target.value) router.push(`/admin/usage?month=${e.target.value}`);
      }}
      className="w-44"
      aria-label="Select month"
    />
  );
}
