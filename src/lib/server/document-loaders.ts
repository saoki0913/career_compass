import { cache } from "react";
import { and, desc, eq, ne } from "drizzle-orm";

import type { RequestIdentity } from "@/app/api/_shared/request-identity";
import { isOwnedByIdentity } from "@/app/api/_shared/owner-access";
import { db } from "@/lib/db";
import {
  applications,
  companies,
  documents,
} from "@/lib/db/schema";
import { normalizeEsDocumentCategory } from "@/lib/es-document-category";
import {
  buildDocumentWhere,
  getEsStats,
  parseDocumentContent,
  serializeDate,
} from "./loader-helpers";

export { getEsStats };

export type DocumentsOptions = {
  type?: "es" | "tips" | "company_analysis";
  companyId?: string | null;
  applicationId?: string | null;
  includeDeleted?: boolean;
  includeContent?: boolean;
};

const documentListJoin = {
  company: {
    id: companies.id,
    name: companies.name,
    infoFetchedAt: companies.infoFetchedAt,
    corporateInfoFetchedAt: companies.corporateInfoFetchedAt,
    userId: companies.userId,
    guestId: companies.guestId,
  },
  application: {
    id: applications.id,
    name: applications.name,
    userId: applications.userId,
    guestId: applications.guestId,
  },
} as const;

const documentRowWithoutContent = {
  id: documents.id,
  userId: documents.userId,
  guestId: documents.guestId,
  companyId: documents.companyId,
  applicationId: documents.applicationId,
  jobTypeId: documents.jobTypeId,
  type: documents.type,
  esCategory: documents.esCategory,
  title: documents.title,
  status: documents.status,
  deletedAt: documents.deletedAt,
  createdAt: documents.createdAt,
  updatedAt: documents.updatedAt,
} as const;

export async function getDocumentsPageData(identity: RequestIdentity, options: DocumentsOptions = {}) {
  const includeContent = options.includeContent ?? true;
  const conditions = [buildDocumentWhere(identity)];

  if (options.type) conditions.push(eq(documents.type, options.type));
  if (options.companyId) conditions.push(eq(documents.companyId, options.companyId));
  if (options.applicationId) conditions.push(eq(documents.applicationId, options.applicationId));
  if (!options.includeDeleted) conditions.push(ne(documents.status, "deleted"));

  const whereClause = and(...conditions);

  if (includeContent) {
    const rows = await db
      .select({
        document: documents,
        ...documentListJoin,
      })
      .from(documents)
      .leftJoin(companies, eq(documents.companyId, companies.id))
      .leftJoin(applications, eq(documents.applicationId, applications.id))
      .where(whereClause)
      .orderBy(desc(documents.updatedAt));

    return {
      documents: rows.map((item) => ({
        ...item.document,
        status: item.document.status ?? "draft",
        esCategory: normalizeEsDocumentCategory(item.document.esCategory),
        content: parseDocumentContent(item.document.content),
        deletedAt: item.document.deletedAt ? item.document.deletedAt.toISOString() : null,
        createdAt: item.document.createdAt.toISOString(),
        updatedAt: item.document.updatedAt.toISOString(),
        company:
          item.company?.id && isOwnedByIdentity(item.company, identity)
            ? {
                id: item.company.id,
                name: item.company.name,
                infoFetchedAt: serializeDate(item.company.infoFetchedAt),
                corporateInfoFetchedAt: serializeDate(item.company.corporateInfoFetchedAt),
              }
            : null,
        application:
          item.application?.id && isOwnedByIdentity(item.application, identity)
            ? { id: item.application.id, name: item.application.name }
            : null,
      })),
    };
  }

  const rows = await db
    .select({
      document: documentRowWithoutContent,
      ...documentListJoin,
    })
    .from(documents)
    .leftJoin(companies, eq(documents.companyId, companies.id))
    .leftJoin(applications, eq(documents.applicationId, applications.id))
    .where(whereClause)
    .orderBy(desc(documents.updatedAt));

  return {
    documents: rows.map((item) => ({
      ...item.document,
      status: item.document.status ?? "draft",
      esCategory: normalizeEsDocumentCategory(item.document.esCategory),
      content: null,
      deletedAt: item.document.deletedAt ? item.document.deletedAt.toISOString() : null,
      createdAt: item.document.createdAt.toISOString(),
      updatedAt: item.document.updatedAt.toISOString(),
      company:
        item.company?.id && isOwnedByIdentity(item.company, identity)
          ? {
              id: item.company.id,
              name: item.company.name,
              infoFetchedAt: serializeDate(item.company.infoFetchedAt),
              corporateInfoFetchedAt: serializeDate(item.company.corporateInfoFetchedAt),
            }
          : null,
      application:
        item.application?.id && isOwnedByIdentity(item.application, identity)
          ? { id: item.application.id, name: item.application.name }
          : null,
    })),
  };
}

async function loadDocumentDetailPageData(documentId: string, userId: string | null, guestId: string | null) {
  const identity: RequestIdentity = userId
    ? { userId, guestId: null }
    : { userId: null, guestId: guestId! };

  const [item] = await db
    .select({
      document: documents,
      company: {
        id: companies.id,
        name: companies.name,
        infoFetchedAt: companies.infoFetchedAt,
        corporateInfoFetchedAt: companies.corporateInfoFetchedAt,
        userId: companies.userId,
        guestId: companies.guestId,
      },
      application: {
        id: applications.id,
        name: applications.name,
        userId: applications.userId,
        guestId: applications.guestId,
      },
    })
    .from(documents)
    .leftJoin(companies, eq(documents.companyId, companies.id))
    .leftJoin(applications, eq(documents.applicationId, applications.id))
    .where(and(eq(documents.id, documentId), buildDocumentWhere(identity)))
    .limit(1);

  if (!item) return null;

  return {
    document: {
      ...item.document,
      status: item.document.status ?? "draft",
      esCategory: normalizeEsDocumentCategory(item.document.esCategory),
      content: parseDocumentContent(item.document.content),
      deletedAt: serializeDate(item.document.deletedAt),
      createdAt: serializeDate(item.document.createdAt) ?? new Date().toISOString(),
      updatedAt: serializeDate(item.document.updatedAt) ?? new Date().toISOString(),
      company:
        item.company?.id && isOwnedByIdentity(item.company, identity)
          ? {
              id: item.company.id,
              name: item.company.name,
              infoFetchedAt: serializeDate(item.company.infoFetchedAt),
              corporateInfoFetchedAt: serializeDate(item.company.corporateInfoFetchedAt),
            }
          : null,
      application:
        item.application?.id && isOwnedByIdentity(item.application, identity)
          ? { id: item.application.id, name: item.application.name }
          : null,
    },
  };
}

const loadDocumentDetailPageDataCached = cache(loadDocumentDetailPageData);

export async function getDocumentDetailPageData(identity: RequestIdentity, documentId: string) {
  const { userId, guestId } = identity;
  if (!userId && !guestId) return null;
  return loadDocumentDetailPageDataCached(documentId, userId, guestId);
}
