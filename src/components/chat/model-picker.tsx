"use client";

import { ChevronDown, Cpu } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ChatModelOption {
  id: string;
  displayName: string;
  modelKey: string;
  providerName: string;
  providerType: string;
  isDefault: boolean;
}

const PROVIDER_LABEL: Record<string, string> = {
  ANTHROPIC: "Anthropic",
  OPENAI: "OpenAI",
  GOOGLE: "Google",
  LOCAL: "Local",
};

interface ModelPickerProps {
  models: ChatModelOption[];
  value: string | null;
  onChange: (id: string) => void;
  disabled?: boolean;
}

export function ModelPicker({ models, value, onChange, disabled }: ModelPickerProps) {
  const selected = models.find((m) => m.id === value) ?? models[0];

  if (models.length === 0) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <Cpu className="h-3.5 w-3.5" />
        No models configured
      </span>
    );
  }

  const groups = new Map<string, ChatModelOption[]>();
  for (const m of models) {
    const key = PROVIDER_LABEL[m.providerType] ?? m.providerType;
    groups.set(key, [...(groups.get(key) ?? []), m]);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground cursor-pointer disabled:opacity-50",
            disabled && "pointer-events-none"
          )}
        >
          {selected?.displayName ?? "Select model"}
          <ChevronDown className="h-3 w-3" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-64">
        {Array.from(groups.entries()).map(([groupName, groupModels], i) => (
          <div key={groupName}>
            {i > 0 && <DropdownMenuSeparator />}
            <DropdownMenuLabel>{groupName}</DropdownMenuLabel>
            {groupModels.map((m) => (
              <DropdownMenuItem key={m.id} onClick={() => onChange(m.id)}>
                <span className="flex-1 truncate">
                  {m.displayName}
                  <span className="ml-1.5 text-xs text-muted-foreground">{m.modelKey}</span>
                </span>
                {m.id === (selected?.id ?? "") && <Check className="h-4 w-4 text-primary" />}
              </DropdownMenuItem>
            ))}
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
