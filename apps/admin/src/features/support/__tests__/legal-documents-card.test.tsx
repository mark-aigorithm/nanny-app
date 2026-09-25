/**
 * The legal documents card saves each document on its own. What's worth
 * pinning: the saved text and the placeholder state read back, a save sends
 * only that document, an empty body is refused before any request, and a
 * VIEW-only operator can read but not edit.
 */
import type { LegalDocument, LegalDocuments } from '@nanny-app/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { ToastProvider } from '@admin/components/ui';
import { LegalDocumentsCard } from '@admin/features/support/legal-documents-card';
import { renderWithProviders } from '@admin/test/render';
import { server } from '@admin/test/server';

function ok<T>(data: T) {
  return HttpResponse.json({ data, error: null });
}

const DOCS: LegalDocuments = {
  terms: {
    key: 'terms',
    title: 'Terms of Service',
    body: 'Book and pay through the app.',
    updatedAt: '2026-09-01T10:00:00.000Z',
  },
  privacy: {
    key: 'privacy',
    title: 'Privacy Policy',
    body: 'Our Privacy Policy will be published here soon.',
    updatedAt: null,
  },
};

function backend(onSave: (key: string, body: unknown) => void = () => {}) {
  server.use(
    http.get('/api/admin/legal-documents', () => ok(DOCS)),
    http.put('/api/admin/legal-documents/:key', async ({ params, request }) => {
      const body = (await request.json()) as { title: string; body: string };
      onSave(String(params.key), body);
      const saved: LegalDocument = {
        key: params.key as LegalDocument['key'],
        ...body,
        updatedAt: '2026-09-25T12:00:00.000Z',
      };
      return ok(saved);
    }),
  );
}

function renderCard(canManage = true) {
  return renderWithProviders(
    <ToastProvider>
      <LegalDocumentsCard canManage={canManage} />
    </ToastProvider>,
  );
}

const form = (name: string) => screen.findByRole('form', { name });

describe('LegalDocumentsCard', () => {
  it('reads both documents back, and says which one is still the placeholder', async () => {
    backend();
    renderCard();

    const terms = await form('Terms of Service');
    expect(within(terms).getByLabelText(/terms of service — text/i)).toHaveValue(DOCS.terms.body);
    expect(within(terms).getByText(/last saved/i)).toBeInTheDocument();

    const privacy = await form('Privacy Policy');
    expect(within(privacy).getByText(/not written yet/i)).toBeInTheDocument();
  });

  it('saves one document on its own', async () => {
    const saves: Array<[string, unknown]> = [];
    backend((key, body) => saves.push([key, body]));
    renderCard();

    const privacy = await form('Privacy Policy');
    const text = within(privacy).getByLabelText(/privacy policy — text/i);
    await userEvent.clear(text);
    await userEvent.type(text, 'We keep only what a booking needs.');
    await userEvent.click(within(privacy).getByRole('button', { name: /save privacy policy/i }));

    expect(await screen.findByText(/privacy policy saved/i)).toBeInTheDocument();
    expect(saves).toEqual([
      ['privacy', { title: 'Privacy Policy', body: 'We keep only what a booking needs.' }],
    ]);
    expect(within(privacy).getByText(/last saved/i)).toBeInTheDocument();
  });

  it('refuses an empty text, and sends nothing', async () => {
    const saves: unknown[] = [];
    backend((key) => saves.push(key));
    renderCard();

    const terms = await form('Terms of Service');
    await userEvent.clear(within(terms).getByLabelText(/terms of service — text/i));
    await userEvent.click(within(terms).getByRole('button', { name: /save terms of service/i }));

    expect(await within(terms).findByText(/needs some text/i)).toBeInTheDocument();
    expect(saves).toEqual([]);
  });

  it('shows a save failure as a toast', async () => {
    backend();
    server.use(
      http.put('/api/admin/legal-documents/:key', () =>
        HttpResponse.json({ data: null, error: 'Database is down' }, { status: 500 }),
      ),
    );
    renderCard();

    const terms = await form('Terms of Service');
    await userEvent.click(within(terms).getByRole('button', { name: /save terms of service/i }));
    expect(await screen.findByText(/couldn’t save the terms of service/i)).toBeInTheDocument();
    expect(screen.getByText('Database is down')).toBeInTheDocument();
  });

  it('is read-only for an operator who can only view Settings', async () => {
    backend();
    renderCard(false);

    const terms = await form('Terms of Service');
    expect(within(terms).getByLabelText(/terms of service — text/i)).toBeDisabled();
    expect(within(terms).queryByRole('button', { name: /save/i })).toBeNull();
  });
});
