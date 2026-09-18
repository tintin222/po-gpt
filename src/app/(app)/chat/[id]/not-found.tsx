import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function ChatNotFound() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4">
      <h1 className="font-display text-2xl font-medium">Chat not found</h1>
      <p className="text-sm text-muted-foreground">
        This chat doesn&apos;t exist or belongs to another user.
      </p>
      <Link href="/chat" className={buttonVariants({ variant: "outline" })}>
        Start a new chat
      </Link>
    </div>
  );
}
