"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Plus, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatCost, formatTokens } from "@/lib/utils";

interface UserRow {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "USER";
  active: boolean;
  monthlyTokenLimit: number | null;
  createdAt: string;
  monthTokens: number;
  monthCostUsd: number;
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

export function UsersManager({
  users,
  defaultLimit,
}: {
  users: UserRow[];
  defaultLimit: number;
}) {
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus />
          Add user
        </Button>
      </div>

      <div className="rounded-xl border border-border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="min-w-[180px]">Usage this month</TableHead>
              <TableHead className="text-right">Est. cost</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => {
              const limit = user.monthlyTokenLimit ?? defaultLimit;
              const pct = limit > 0 ? (user.monthTokens / limit) * 100 : 0;
              return (
                <TableRow key={user.id}>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold uppercase">
                        {user.name.slice(0, 1) || <UserRound className="h-3.5 w-3.5" />}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{user.name}</div>
                        <div className="truncate text-xs text-muted-foreground">{user.email}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={user.role === "ADMIN" ? "default" : "secondary"}>
                      {user.role === "ADMIN" ? "Admin" : "Member"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {user.active ? (
                      <Badge variant="success">Active</Badge>
                    ) : (
                      <Badge variant="destructive">Deactivated</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="text-xs text-muted-foreground">
                      {formatTokens(user.monthTokens)}
                      {limit > 0 ? ` / ${formatTokens(limit)}` : " · unlimited"}
                      {user.monthlyTokenLimit === null && limit > 0 && " (default)"}
                    </div>
                    {limit > 0 && <Progress value={pct} className="mt-1" />}
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    {formatCost(user.monthCostUsd)}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setEditing(user)}
                      aria-label={`Edit ${user.name}`}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <AddUserDialog open={addOpen} onOpenChange={setAddOpen} onDone={() => router.refresh()} />
      {editing && (
        <EditUserDialog
          user={editing}
          onOpenChange={(open) => !open && setEditing(null)}
          onDone={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

/* ── Add user ─────────────────────────────────────────────────────────────── */

function AddUserDialog({
  open,
  onOpenChange,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"USER" | "ADMIN">("USER");
  const [limit, setLimit] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await api("/api/admin/users", "POST", {
        name,
        email,
        password,
        role,
        monthlyTokenLimit: limit === "" ? null : parseInt(limit, 10),
      });
      toast.success(`User ${email} created`);
      onOpenChange(false);
      setName("");
      setEmail("");
      setPassword("");
      setLimit("");
      setRole("USER");
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create user");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add user</DialogTitle>
          <DialogDescription>
            Share the credentials with the user privately. They can be changed later.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleCreate} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="u-name">Full name</Label>
              <Input id="u-name" required value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="u-email">Email</Label>
              <Input
                id="u-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="u-pass">Password</Label>
            <Input
              id="u-pass"
              type="text"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Role</Label>
              <div className="grid grid-cols-2 gap-2">
                {(["USER", "ADMIN"] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRole(r)}
                    className={`rounded-lg border px-2 py-2 text-sm cursor-pointer ${
                      role === r
                        ? "border-primary bg-primary/5 font-medium text-primary"
                        : "border-border hover:bg-accent"
                    }`}
                  >
                    {r === "USER" ? "Member" : "Admin"}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="u-limit">Monthly token limit</Label>
              <Input
                id="u-limit"
                type="number"
                min={0}
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
                placeholder="Default"
              />
              <p className="text-[11px] text-muted-foreground">Empty = global default, 0 = unlimited</p>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Spinner className="text-primary-foreground" />}
              Create user
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ── Edit user ────────────────────────────────────────────────────────────── */

function EditUserDialog({
  user,
  onOpenChange,
  onDone,
}: {
  user: UserRow;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const [name, setName] = useState(user.name);
  const [role, setRole] = useState<"USER" | "ADMIN">(user.role);
  const [active, setActive] = useState(user.active);
  const [limit, setLimit] = useState(user.monthlyTokenLimit?.toString() ?? "");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await api(`/api/admin/users/${user.id}`, "PATCH", {
        name,
        role,
        active,
        monthlyTokenLimit: limit === "" ? null : parseInt(limit, 10),
        ...(password ? { password } : {}),
      });
      toast.success("User updated");
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (
      !confirm(
        `Permanently delete ${user.email}? Their chats, projects, and usage history are removed. Consider deactivating instead.`
      )
    ) {
      return;
    }
    setLoading(true);
    try {
      await api(`/api/admin/users/${user.id}`, "DELETE");
      toast.success("User deleted");
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
      setLoading(false);
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit {user.email}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSave} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="e-name">Full name</Label>
            <Input id="e-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Role</Label>
              <div className="grid grid-cols-2 gap-2">
                {(["USER", "ADMIN"] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRole(r)}
                    className={`rounded-lg border px-2 py-2 text-sm cursor-pointer ${
                      role === r
                        ? "border-primary bg-primary/5 font-medium text-primary"
                        : "border-border hover:bg-accent"
                    }`}
                  >
                    {r === "USER" ? "Member" : "Admin"}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Status</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setActive(true)}
                  className={`rounded-lg border px-2 py-2 text-sm cursor-pointer ${
                    active
                      ? "border-primary bg-primary/5 font-medium text-primary"
                      : "border-border hover:bg-accent"
                  }`}
                >
                  Active
                </button>
                <button
                  type="button"
                  onClick={() => setActive(false)}
                  className={`rounded-lg border px-2 py-2 text-sm cursor-pointer ${
                    !active
                      ? "border-destructive bg-destructive/5 font-medium text-destructive"
                      : "border-border hover:bg-accent"
                  }`}
                >
                  Deactivated
                </button>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="e-limit">Monthly token limit</Label>
              <Input
                id="e-limit"
                type="number"
                min={0}
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
                placeholder="Default"
              />
              <p className="text-[11px] text-muted-foreground">Empty = global default, 0 = unlimited</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="e-pass">Reset password</Label>
              <Input
                id="e-pass"
                type="text"
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Leave empty to keep"
              />
            </div>
          </div>
          <DialogFooter className="justify-between sm:justify-between">
            <Button type="button" variant="destructive" onClick={handleDelete} disabled={loading}>
              Delete user
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading && <Spinner className="text-primary-foreground" />}
                Save
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
