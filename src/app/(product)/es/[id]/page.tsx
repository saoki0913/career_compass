import type { Metadata } from "next";
import { Suspense } from "react";
import type { RequestIdentity } from "@/bff/identity/request-identity";
import { getCurrentRequestIdentity } from "@/lib/server/request-identity-cache";
import { getDocumentDetailPageData } from "@/lib/server/app-loaders";
import { AnimatedSuspenseContent } from "@/components/ui/AnimatedSuspenseContent";
import ESEditorPageClient from "@/components/es/ESEditorPageClient";
import { ESEditorSkeleton } from "@/components/skeletons/ESEditorSkeleton";

type ESEditorPageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata(): Promise<Metadata> {
  return { title: "ES" };
}

export default async function ESEditorPage({ params }: ESEditorPageProps) {
  const { id } = await params;
  const identity = await getCurrentRequestIdentity();

  return (
    <Suspense fallback={<ESEditorSkeleton />}>
      <AnimatedSuspenseContent>
        <ESEditorContent identity={identity} documentId={id} />
      </AnimatedSuspenseContent>
    </Suspense>
  );
}

async function ESEditorContent({
  identity,
  documentId,
}: {
  identity: RequestIdentity | null;
  documentId: string;
}) {
  const initialData = identity ? await getDocumentDetailPageData(identity, documentId) : undefined;

  return (
    <ESEditorPageClient
      documentId={documentId}
      initialDocument={initialData?.document ?? undefined}
    />
  );
}
