"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { KeyRound, Plus, Server, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Spinner } from "@/components/ui/spinner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MODEL_CATALOG, PROVIDER_LABELS, type CatalogEntry } from "@/lib/catalog";

interface ModelRow {
  id: string;
  modelKey: string;
  displayName: string;
  kind: "CHAT" | "EMBEDDING";
  enabled: boolean;
  isDefault: boolean;
  toolsEnabled: boolean;
  inputPricePerMTok: number | null;
  outputPricePerMTok: number | null;
}

interface ProviderRow {
  id: string;
  name: string;
  type: "ANTHROPIC" | "OPENAI" | "GOOGLE" | "LOCAL";
  apiKeyHint: string | null;
  baseUrl: string | null;
  models: ModelRow[];
}

async function api(path: string, method: string, body?: unknown) {
  const res = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `Request failed (${res.status})`);
  }
  return res.json();
}

export function ProvidersManager({ providers }: { providers: ProviderRow[] }) {
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus />
          Add provider
        </Button>
      </div>

      {providers.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-14 text-center">
            <Server className="h-7 w-7 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              No providers yet. Add Anthropic, OpenAI, Google Gemini, or a local OpenAI-compatible
              endpoint to make models available to your users.
            </p>
          </CardContent>
        </Card>
      )}

      {providers.map((provider) => (
        <ProviderCard key={provider.id} provider={provider} onChanged={() => router.refresh()} />
      ))}

      <AddProviderDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onCreated={() => router.refresh()}
      />
    </div>
  );
}

/* ── Provider card ────────────────────────────────────────────────────────── */

function ProviderCard({ provider, onChanged }: { provider: ProviderRow; onChanged: () => void }) {
  const [addModelOpen, setAddModelOpen] = useState(false);
  const [keyOpen, setKeyOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  async function run(label: string, fn: () => Promise<unknown>) {
    setBusy(label);
    try {
      await fn();
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Operation failed");
    } finally {
      setBusy(null);
    }
  }

  async function deleteProvider() {
    if (
      !confirm(
        `Delete provider "${provider.name}" and its ${provider.models.length} model(s)? Users will no longer be able to use them.`
      )
    ) {
      return;
    }
    await run("delete", () => api(`/api/admin/providers/${provider.id}`, "DELETE"));
  }

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            {provider.name}
            <Badge variant="secondary">{PROVIDER_LABELS[provider.type] ?? provider.type}</Badge>
          </CardTitle>
          <CardDescription className="mt-1">
            {provider.apiKeyHint ? `API key ••••${provider.apiKeyHint}` : "No API key"}
            {provider.baseUrl && <> · {provider.baseUrl}</>}
          </CardDescription>
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="sm" onClick={() => setKeyOpen(true)}>
            <KeyRound className="h-3.5 w-3.5" />
            Update key
          </Button>
          <Button variant="outline" size="sm" onClick={() => setAddModelOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            Add model
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={deleteProvider}
            disabled={busy === "delete"}
            aria-label="Delete provider"
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {provider.models.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No models yet — add one so users can select it.
          </p>
        ) : (
          <div className="divide-y divide-border rounded-lg border border-border">
            {provider.models.map((model) => (
              <div key={model.id} className="flex items-center gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{model.displayName}</span>
                    {model.kind === "EMBEDDING" ? (
                      <Badge variant="outline">embedding</Badge>
                    ) : model.isDefault ? (
                      <Badge>default</Badge>
                    ) : null}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {model.modelKey}
                    {model.inputPricePerMTok !== null && (
                      <>
                        {" "}
                        · ${model.inputPricePerMTok}/M in
                        {model.outputPricePerMTok !== null && (
                          <> · ${model.outputPricePerMTok}/M out</>
                        )}
                      </>
                    )}
                  </div>
                </div>
                {model.kind === "CHAT" && !model.isDefault && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    title="Make default"
                    aria-label="Make default model"
                    onClick={() =>
                      run(`default-${model.id}`, () =>
                        api(`/api/admin/models/${model.id}`, "PATCH", { isDefault: true })
                      )
                    }
                  >
                    {busy === `default-${model.id}` ? (
                      <Spinner />
                    ) : (
                      <Star className="h-4 w-4 text-muted-foreground" />
                    )}
                  </Button>
                )}
                {model.kind === "CHAT" && (
                  <label
                    className="flex items-center gap-1.5"
                    title="Allow this model to generate Word/PowerPoint/Excel files (requires a model with tool-calling support)"
                  >
                    <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      files
                    </span>
                    <Switch
                      checked={model.toolsEnabled}
                      aria-label="Enable file generation tools"
                      onCheckedChange={(checked) =>
                        run(`tools-${model.id}`, () =>
                          api(`/api/admin/models/${model.id}`, "PATCH", { toolsEnabled: checked })
                        )
                      }
                    />
                  </label>
                )}
                <Switch
                  checked={model.enabled}
                  aria-label="Enable model"
                  onCheckedChange={(checked) =>
                    run(`toggle-${model.id}`, () =>
                      api(`/api/admin/models/${model.id}`, "PATCH", { enabled: checked })
                    )
                  }
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Delete model"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => {
                    if (!confirm(`Remove model "${model.displayName}"?`)) return;
                    void run(`del-${model.id}`, () =>
                      api(`/api/admin/models/${model.id}`, "DELETE")
                    );
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <AddModelDialog
        open={addModelOpen}
        onOpenChange={setAddModelOpen}
        provider={provider}
        onCreated={onChanged}
      />
      <UpdateKeyDialog
        open={keyOpen}
        onOpenChange={setKeyOpen}
        provider={provider}
        onUpdated={onChanged}
      />
    </Card>
  );
}

/* ── Add provider dialog ──────────────────────────────────────────────────── */

const PROVIDER_TYPES = ["ANTHROPIC", "OPENAI", "GOOGLE", "LOCAL"] as const;

function AddProviderDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const [type, setType] = useState<(typeof PROVIDER_TYPES)[number]>("ANTHROPIC");
  const [name, setName] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await api("/api/admin/providers", "POST", {
        name: name || PROVIDER_LABELS[type],
        type,
        apiKey,
        baseUrl,
      });
      toast.success("Provider added — now add the models users may use");
      onOpenChange(false);
      setName("");
      setApiKey("");
      setBaseUrl("");
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add provider");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add LLM provider</DialogTitle>
          <DialogDescription>
            API keys are encrypted at rest (AES-256-GCM) and never exposed to users.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleCreate} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Provider</Label>
            <div className="grid grid-cols-2 gap-2">
              {PROVIDER_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={`rounded-lg border px-3 py-2 text-sm transition-colors cursor-pointer ${
                    type === t
                      ? "border-primary bg-primary/5 font-medium text-primary"
                      : "border-border hover:bg-accent"
                  }`}
                >
                  {PROVIDER_LABELS[t]}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="p-name">Display name</Label>
            <Input
              id="p-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={PROVIDER_LABELS[type]}
            />
          </div>
          {type !== "LOCAL" ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="p-key">API key</Label>
              <Input
                id="p-key"
                type="password"
                required
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={
                  type === "ANTHROPIC" ? "sk-ant-…" : type === "OPENAI" ? "sk-…" : "AIza…"
                }
              />
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="p-url">Base URL (OpenAI-compatible)</Label>
                <Input
                  id="p-url"
                  required
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="http://ollama.internal:11434/v1"
                />
                <p className="text-xs text-muted-foreground">
                  Works with Ollama, vLLM, LM Studio, LiteLLM, and other OpenAI-compatible servers.
                </p>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="p-key-local">API key (optional)</Label>
                <Input
                  id="p-key-local"
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                />
              </div>
            </>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Spinner className="text-primary-foreground" />}
              Add provider
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ── Add model dialog ─────────────────────────────────────────────────────── */

function AddModelDialog({
  open,
  onOpenChange,
  provider,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  provider: ProviderRow;
  onCreated: () => void;
}) {
  const suggestions = (MODEL_CATALOG[provider.type] ?? []).filter(
    (s) => !provider.models.some((m) => m.modelKey === s.modelKey)
  );
  const [modelKey, setModelKey] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [kind, setKind] = useState<"CHAT" | "EMBEDDING">("CHAT");
  const [inputPrice, setInputPrice] = useState("");
  const [outputPrice, setOutputPrice] = useState("");
  const [loading, setLoading] = useState(false);

  function applySuggestion(s: CatalogEntry) {
    setModelKey(s.modelKey);
    setDisplayName(s.displayName);
    setKind(s.kind);
    setInputPrice(s.inputPricePerMTok?.toString() ?? "");
    setOutputPrice(s.outputPricePerMTok?.toString() ?? "");
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await api("/api/admin/models", "POST", {
        providerId: provider.id,
        modelKey,
        displayName,
        kind,
        inputPricePerMTok: inputPrice ? parseFloat(inputPrice) : null,
        outputPricePerMTok: outputPrice ? parseFloat(outputPrice) : null,
      });
      toast.success("Model added");
      onOpenChange(false);
      setModelKey("");
      setDisplayName("");
      setInputPrice("");
      setOutputPrice("");
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add model");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add model to {provider.name}</DialogTitle>
          <DialogDescription>
            Pick a suggested model or enter any model ID the provider supports.
          </DialogDescription>
        </DialogHeader>

        {suggestions.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((s) => (
              <button
                key={s.modelKey}
                type="button"
                onClick={() => applySuggestion(s)}
                className={`rounded-full border px-3 py-1 text-xs transition-colors cursor-pointer ${
                  modelKey === s.modelKey
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-border hover:bg-accent"
                }`}
              >
                {s.displayName}
                {s.kind === "EMBEDDING" && " (embedding)"}
              </button>
            ))}
          </div>
        )}

        <form onSubmit={handleCreate} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="m-key">Model ID</Label>
            <Input
              id="m-key"
              required
              value={modelKey}
              onChange={(e) => setModelKey(e.target.value)}
              placeholder={provider.type === "LOCAL" ? "llama3.1:70b" : "model identifier"}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="m-name">Display name</Label>
            <Input
              id="m-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Shown to users in the model picker"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Purpose</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setKind("CHAT")}
                className={`rounded-lg border px-3 py-2 text-sm cursor-pointer ${
                  kind === "CHAT"
                    ? "border-primary bg-primary/5 font-medium text-primary"
                    : "border-border hover:bg-accent"
                }`}
              >
                Chat
              </button>
              <button
                type="button"
                onClick={() => setKind("EMBEDDING")}
                disabled={provider.type === "ANTHROPIC"}
                className={`rounded-lg border px-3 py-2 text-sm cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 ${
                  kind === "EMBEDDING"
                    ? "border-primary bg-primary/5 font-medium text-primary"
                    : "border-border hover:bg-accent"
                }`}
              >
                Embedding (RAG)
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="m-in">$ / 1M input tokens</Label>
              <Input
                id="m-in"
                type="number"
                min={0}
                step="0.01"
                value={inputPrice}
                onChange={(e) => setInputPrice(e.target.value)}
                placeholder="optional"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="m-out">$ / 1M output tokens</Label>
              <Input
                id="m-out"
                type="number"
                min={0}
                step="0.01"
                value={outputPrice}
                onChange={(e) => setOutputPrice(e.target.value)}
                placeholder="optional"
                disabled={kind === "EMBEDDING"}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !modelKey.trim()}>
              {loading && <Spinner className="text-primary-foreground" />}
              Add model
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ── Update key dialog ────────────────────────────────────────────────────── */

function UpdateKeyDialog({
  open,
  onOpenChange,
  provider,
  onUpdated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  provider: ProviderRow;
  onUpdated: () => void;
}) {
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(provider.baseUrl ?? "");
  const [loading, setLoading] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await api(`/api/admin/providers/${provider.id}`, "PATCH", {
        ...(apiKey ? { apiKey } : {}),
        baseUrl,
      });
      toast.success("Provider updated");
      onOpenChange(false);
      setApiKey("");
      onUpdated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Update {provider.name}</DialogTitle>
          <DialogDescription>
            Leave the key empty to keep the current one
            {provider.apiKeyHint && <> (••••{provider.apiKeyHint})</>}.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSave} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="k-key">New API key</Label>
            <Input
              id="k-key"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Leave empty to keep current"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="k-url">Base URL</Label>
            <Input
              id="k-url"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder={provider.type === "LOCAL" ? "http://host:11434/v1" : "optional"}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Spinner className="text-primary-foreground" />}
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
