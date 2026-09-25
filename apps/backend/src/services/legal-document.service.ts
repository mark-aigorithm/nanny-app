import {
  LegalDocumentKeySchema,
  UpdateLegalDocumentSchema,
  type LegalDocument,
  type LegalDocumentKey,
  type LegalDocuments,
  type UpdateLegalDocumentInput,
} from '@nanny-app/shared';
import { z } from 'zod';

import { prisma } from '@backend/db/prisma';

/**
 * The Terms of Service and Privacy Policy the registration wizard links to.
 *
 * One JSON `app_settings` row holding both documents, like the support FAQ:
 * `{ terms: { title, body, updatedAt }, privacy: { … } }`. A document an
 * operator hasn't written yet reads as a short placeholder with a null
 * `updatedAt`, so the link in the app never opens a blank page.
 */
const KEY = 'legal_documents';

const DEFAULT_TITLES: Record<LegalDocumentKey, string> = {
  terms: 'Terms of Service',
  privacy: 'Privacy Policy',
};

function placeholder(key: LegalDocumentKey): LegalDocument {
  const title = DEFAULT_TITLES[key];
  return {
    key,
    title,
    body: `Our ${title} will be published here soon. If you have a question in the meantime, contact our support team.`,
    updatedAt: null,
  };
}

const StoredDocumentSchema = UpdateLegalDocumentSchema.extend({ updatedAt: z.string().datetime() });
type StoredDocument = z.infer<typeof StoredDocumentSchema>;
type Stored = Partial<Record<LegalDocumentKey, StoredDocument>>;

/**
 * The saved documents, one key at a time: a key that is missing or won't
 * parse is left out (and reads as its placeholder), without losing the other.
 */
async function readStored(): Promise<Stored> {
  const row = await prisma.appSettings.findFirst({ where: { key: KEY, deletedAt: null } });
  if (!row) return {};
  let raw: unknown;
  try {
    raw = JSON.parse(row.value);
  } catch {
    // A hand-edited row that isn't JSON must not take the screen down.
    return {};
  }
  if (typeof raw !== 'object' || raw === null) return {};
  const stored: Stored = {};
  for (const key of LegalDocumentKeySchema.options) {
    const parsed = StoredDocumentSchema.safeParse((raw as Record<string, unknown>)[key]);
    if (parsed.success) stored[key] = parsed.data;
  }
  return stored;
}

function toDocument(key: LegalDocumentKey, stored: Stored): LegalDocument {
  const doc = stored[key];
  return doc ? { key, ...doc } : placeholder(key);
}

/** One document, for the app's legal screen. */
export async function getLegalDocument(key: LegalDocumentKey): Promise<LegalDocument> {
  return toDocument(key, await readStored());
}

/** Both documents, for the console's editor. */
export async function getLegalDocuments(): Promise<LegalDocuments> {
  const stored = await readStored();
  return { terms: toDocument('terms', stored), privacy: toDocument('privacy', stored) };
}

/** Saves one document and stamps it; the other is kept as it was. */
export async function updateLegalDocument(
  key: LegalDocumentKey,
  input: UpdateLegalDocumentInput,
): Promise<LegalDocument> {
  const stored = await readStored();
  stored[key] = {
    title: input.title.trim(),
    body: input.body.trim(),
    updatedAt: new Date().toISOString(),
  };
  const value = JSON.stringify(stored);

  await prisma.appSettings.upsert({
    where: { key: KEY },
    create: { key: KEY, value },
    update: { value, deletedAt: null },
  });

  return toDocument(key, stored);
}
