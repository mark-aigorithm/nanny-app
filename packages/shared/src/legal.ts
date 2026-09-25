import { z } from 'zod';

// ── Legal documents ───────────────────────────────────────────────────────────
//
// The Terms of Service and Privacy Policy the registration wizard links to.
// Operators write them in the console (Settings → Legal documents); the app
// reads them signed out, since a new user opens them before she has an
// account. Stored as one JSON app_settings row, like the support FAQ.

export const LegalDocumentKeySchema = z.enum(['terms', 'privacy']);
export type LegalDocumentKey = z.infer<typeof LegalDocumentKeySchema>;

/** What an operator saves for one document. */
export const UpdateLegalDocumentSchema = z.object({
  title: z.string().trim().min(1, 'The document needs a title.').max(120),
  body: z.string().trim().min(1, 'The document needs some text.').max(50_000),
});
export type UpdateLegalDocumentInput = z.infer<typeof UpdateLegalDocumentSchema>;

/**
 * One document as the app and the console read it. `updatedAt` is null until
 * an operator has saved it — the placeholder text is showing.
 */
export const LegalDocumentSchema = UpdateLegalDocumentSchema.extend({
  key: LegalDocumentKeySchema,
  updatedAt: z.string().datetime().nullable(),
});
export type LegalDocument = z.infer<typeof LegalDocumentSchema>;

/** Both documents, for the console's editor. */
export const LegalDocumentsSchema = z.object({
  terms: LegalDocumentSchema,
  privacy: LegalDocumentSchema,
});
export type LegalDocuments = z.infer<typeof LegalDocumentsSchema>;
