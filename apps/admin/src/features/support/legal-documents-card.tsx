import {
  UpdateLegalDocumentSchema,
  type LegalDocument,
  type LegalDocumentKey,
  type LegalDocuments,
} from '@nanny-app/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';

import { Button, Card, ErrorState, Feedback, Field, Skeleton, useToast } from '@admin/components/ui';
import { fetchLegalDocuments, updateLegalDocument } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';
import { formatDateTime } from '@admin/lib/format';

/**
 * The Terms of Service and Privacy Policy the app's registration wizard links
 * to. Each document saves on its own, so fixing a typo in one can't clobber
 * an unsaved edit in the other. Sits under the FAQ card on Settings and
 * follows its shape: the server copy is the query, and each form's draft is
 * local state seeded from it once (the form mounts only after the query
 * resolves) and replaced by what the server saved.
 */
const QUERY_KEY = ['legal-documents'];

const KEYS: LegalDocumentKey[] = ['terms', 'privacy'];

export function LegalDocumentsCard({ canManage }: { canManage: boolean }) {
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchLegalDocuments,
  });

  if (error != null) {
    return (
      <ErrorState message={apiErrorMessage(error)} onRetry={() => void refetch()} retrying={isFetching} />
    );
  }

  return (
    <Card>
      <div className="card-header">
        <h3>Legal documents</h3>
      </div>
      <p className="panel-lead">
        What the app opens from “Terms of Service” and “Privacy Policy” when someone signs up. Anyone
        can read these, signed in or not.
      </p>
      {isLoading || !data ? (
        <div className="faq-editor">
          <Skeleton height={160} />
          <Skeleton height={160} />
        </div>
      ) : (
        <div className="faq-editor">
          {KEYS.map((key) => (
            <LegalDocumentForm key={key} document={data[key]} canManage={canManage} />
          ))}
        </div>
      )}
    </Card>
  );
}

function LegalDocumentForm({ document, canManage }: { document: LegalDocument; canManage: boolean }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [title, setTitle] = useState(document.title);
  const [body, setBody] = useState(document.body);
  const [formError, setFormError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (input: { title: string; body: string }) => updateLegalDocument(document.key, input),
    onSuccess: (updated) => {
      queryClient.setQueryData<LegalDocuments>(QUERY_KEY, (current) =>
        current ? { ...current, [updated.key]: updated } : current,
      );
      setTitle(updated.title);
      setBody(updated.body);
      setFormError(null);
      toast.success(`${updated.title} saved`, 'The app shows the new text the next time it’s opened.');
    },
    onError: (err) => toast.error(`Couldn’t save the ${document.title}`, apiErrorMessage(err)),
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = UpdateLegalDocumentSchema.safeParse({ title, body });
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? 'Invalid input');
      return;
    }
    setFormError(null);
    save.mutate(parsed.data);
  }

  const label = document.key === 'terms' ? 'Terms of Service' : 'Privacy Policy';

  return (
    <form className="faq-entry legal-entry" onSubmit={handleSubmit} aria-label={label}>
      <div className="faq-entry-fields">
        <Field label={`${label} — title`}>
          <input
            type="text"
            value={title}
            disabled={!canManage}
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>
        <Field label={`${label} — text`}>
          <textarea
            className="input legal-body"
            rows={10}
            value={body}
            disabled={!canManage}
            onChange={(e) => setBody(e.target.value)}
          />
        </Field>
        <p className="faq-empty">
          {document.updatedAt
            ? `Last saved ${formatDateTime(document.updatedAt)}`
            : 'Not written yet — the app shows a “will be published soon” placeholder.'}
        </p>
        {formError && <Feedback tone="error">{formError}</Feedback>}
      </div>
      {canManage && (
        <Button type="submit" size="sm" disabled={save.isPending}>
          {save.isPending ? 'Saving…' : `Save ${label}`}
        </Button>
      )}
    </form>
  );
}
