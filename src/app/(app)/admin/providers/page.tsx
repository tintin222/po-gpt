import { prisma } from "@/lib/prisma";
import { ProvidersManager } from "@/components/admin/providers-manager";

export const dynamic = "force-dynamic";

export default async function AdminProvidersPage() {
  const providers = await prisma.provider.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      type: true,
      apiKeyHint: true,
      baseUrl: true,
      models: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          modelKey: true,
          displayName: true,
          kind: true,
          enabled: true,
          isDefault: true,
          inputPricePerMTok: true,
          outputPricePerMTok: true,
        },
      },
    },
  });

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl px-6 py-10">
        <h1 className="font-serif text-3xl font-medium tracking-tight">Models &amp; providers</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect LLM providers with your API keys and choose which models users can select. Add an
          embedding model to enable semantic search over project knowledge.
        </p>
        <div className="mt-6">
          <ProvidersManager providers={providers} />
        </div>
      </div>
    </div>
  );
}
