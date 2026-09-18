import { SupportFaqSchema, type SupportFaqItem } from '@nanny-app/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';

import {
  Button,
  Card,
  ErrorState,
  Feedback,
  Field,
  ICON_SIZE,
  Plus,
  Skeleton,
  Trash2,
  useToast,
} from '@admin/components/ui';
import { fetchSupportFaq, updateSupportFaq } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';

/**
 * The questions the app's Help & Support screen answers, edited as one list.
 *
 * Sits under the support-contact card on Settings and follows its shape: the
 * server copy is the query, the draft is local state seeded from it once, and
 * Save replaces the whole list — there is no per-row endpoint, so what the
 * operator sees is exactly what gets written.
 */
const QUERY_KEY = ['support-faq'];

const EMPTY_ITEM: SupportFaqItem = { question: '', answer: '' };

export function SupportFaqCard({ canManage }: { canManage: boolean }) {
  const queryClient = useQueryClient();
  const toast = useToast();

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchSupportFaq,
  });

  const [items, setItems] = useState<SupportFaqItem[] | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (data && items === null) setItems(data.items);
  }, [data, items]);

  const save = useMutation({
    mutationFn: updateSupportFaq,
    onSuccess: (updated) => {
      queryClient.setQueryData(QUERY_KEY, updated);
      setItems(updated.items);
      setFormError(null);
      toast.success('FAQ saved', 'Parents see the new answers the next time they open help.');
    },
    onError: (err) => toast.error('Couldn’t save the FAQ', apiErrorMessage(err)),
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!items) return;
    const parsed = SupportFaqSchema.safeParse({ items });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const index = typeof issue?.path[1] === 'number' ? issue.path[1] + 1 : null;
      setFormError(index ? `Entry ${index}: ${issue?.message}` : (issue?.message ?? 'Invalid input'));
      return;
    }
    setFormError(null);
    save.mutate(parsed.data);
  }

  function patch(index: number, change: Partial<SupportFaqItem>) {
    setItems((current) =>
      current ? current.map((item, i) => (i === index ? { ...item, ...change } : item)) : current,
    );
  }

  if (error != null) {
    return (
      <ErrorState message={apiErrorMessage(error)} onRetry={() => void refetch()} retrying={isFetching} />
    );
  }

  if (isLoading || !items) {
    return (
      <Card>
        <div className="card-header">
          <h3>FAQ</h3>
        </div>
        <div className="faq-editor">
          <Skeleton height={88} />
          <Skeleton height={88} />
        </div>
      </Card>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <div className="card-header">
          <h3>FAQ</h3>
          {canManage && (
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? 'Saving…' : 'Save FAQ'}
            </Button>
          )}
        </div>
        <p className="panel-lead">
          The questions answered on the app’s help screen, in this order. Keep answers short —
          each one opens under its question.
        </p>

        {items.length === 0 && (
          <p className="faq-empty">No questions yet. Parents will see an empty FAQ until one is added.</p>
        )}

        <ol className="faq-editor">
          {items.map((item, index) => (
            <li key={index} className="faq-entry">
              <div className="faq-entry-fields">
                <Field label={`Question ${index + 1}`}>
                  <input
                    type="text"
                    value={item.question}
                    placeholder="How are nannies vetted?"
                    disabled={!canManage}
                    onChange={(e) => patch(index, { question: e.target.value })}
                  />
                </Field>
                <Field label="Answer">
                  <textarea
                    className="input"
                    rows={3}
                    value={item.answer}
                    placeholder="Every nanny completes an identity check, reference checks and CPR certification."
                    disabled={!canManage}
                    onChange={(e) => patch(index, { answer: e.target.value })}
                  />
                </Field>
              </div>
              {canManage && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Remove question ${index + 1}`}
                  onClick={() => setItems(items.filter((_, i) => i !== index))}
                >
                  <Trash2 size={ICON_SIZE.inline} aria-hidden />
                </Button>
              )}
            </li>
          ))}
        </ol>

        {canManage && (
          <div className="faq-editor-actions">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setItems([...items, { ...EMPTY_ITEM }])}
            >
              <Plus size={ICON_SIZE.inline} aria-hidden /> Add question
            </Button>
          </div>
        )}

        {formError && <Feedback tone="error">{formError}</Feedback>}
      </Card>
    </form>
  );
}
