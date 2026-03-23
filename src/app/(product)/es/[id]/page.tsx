import type { Metadata } from "next";
import { headers } from "next/headers";
import { getHeadersIdentity } from "@/app/api/_shared/request-identity";
import { getDocumentDetailPageData } from "@/lib/server/app-loaders";
import ESEditorPageClient from "@/components/es/ESEditorPageClient";

type ESEditorPageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: ESEditorPageProps): Promise<Metadata> {
  const { id } = await params;
  const identity = await getHeadersIdentity(await headers());
  if (!identity) {
    return { title: "ES" };
  }
  const data = await getDocumentDetailPageData(identity, id);
  const raw = data?.document?.title?.trim();
  const title = raw && raw.length > 0 ? raw : "ES";
  return { title };
}

export default async function ESEditorPage({ params }: ESEditorPageProps) {
  const { id } = await params;
  const identity = await getHeadersIdentity(await headers());
  const initialData = identity ? await getDocumentDetailPageData(identity, id) : undefined;

  return (
    <ESEditorPageClient
      documentId={id}
      initialDocument={initialData?.document ?? undefined}
    />
  );
}
