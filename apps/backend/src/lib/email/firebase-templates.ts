import { renderFirebaseTemplate } from '@backend/lib/email/render';

/**
 * Reads and writes the password-reset email template on the Firebase project
 * through the Identity Toolkit admin API — the same setting the console's
 * Authentication → Templates page edits. Firebase takes no template per
 * request, so this is how the in-repo template would reach its mailer.
 *
 * Only the sender name is written (RESET_FIELDS). The live project refuses any
 * change to a template's subject or body with EMAIL_TEMPLATE_UPDATE_NOT_ALLOWED
 * — Google's anti-spam lock, which the console enforces too — so the branded
 * subject and body are rendered for a preview only, to paste into the console
 * once the lock is lifted. The sender address and reply-to stay as they are.
 */

export interface FirebaseEmailTemplateConfig {
  senderLocalPart?: string;
  senderDisplayName?: string;
  subject?: string;
  body?: string;
  bodyFormat?: 'BODY_FORMAT_UNSPECIFIED' | 'PLAIN_TEXT' | 'HTML';
  replyTo?: string;
  customized?: boolean;
}

/** The slice of `fetch` this module uses, so tests can stub it. */
export type FetchLike = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export interface ConfigClientOptions {
  projectId: string;
  accessToken: string;
  fetch?: FetchLike;
}

interface ProjectConfig {
  notification?: { sendEmail?: { resetPasswordTemplate?: FirebaseEmailTemplateConfig } };
}

const RESET_FIELDS = ['senderDisplayName'] as const;
const RESET_PATH = 'notification.sendEmail.resetPasswordTemplate';

export function buildResetPasswordTemplate(): Required<
  Pick<FirebaseEmailTemplateConfig, 'senderDisplayName' | 'subject' | 'body' | 'bodyFormat'>
> {
  const { subject, html } = renderFirebaseTemplate('PASSWORD_RESET');
  return { senderDisplayName: 'Nanny Now', subject, body: html, bodyFormat: 'HTML' };
}

function configUrl(projectId: string): string {
  return `https://identitytoolkit.googleapis.com/admin/v2/projects/${encodeURIComponent(projectId)}/config`;
}

async function readConfig(
  res: Awaited<ReturnType<FetchLike>>,
): Promise<FirebaseEmailTemplateConfig | undefined> {
  const payload = (await res.json()) as ProjectConfig & { error?: { message?: string } };
  if (!res.ok) {
    throw new Error(`Identity Toolkit ${res.status}: ${payload.error?.message ?? 'no message'}`);
  }
  return payload.notification?.sendEmail?.resetPasswordTemplate;
}

export async function getResetPasswordTemplate({
  projectId,
  accessToken,
  fetch: doFetch = fetch,
}: ConfigClientOptions): Promise<FirebaseEmailTemplateConfig | undefined> {
  const res = await doFetch(configUrl(projectId), {
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return readConfig(res);
}

export async function pushResetPasswordSender({
  projectId,
  accessToken,
  fetch: doFetch = fetch,
}: ConfigClientOptions): Promise<FirebaseEmailTemplateConfig | undefined> {
  const updateMask = RESET_FIELDS.map((f) => `${RESET_PATH}.${f}`).join(',');
  const res = await doFetch(`${configUrl(projectId)}?${new URLSearchParams({ updateMask })}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      notification: {
        sendEmail: {
          resetPasswordTemplate: { senderDisplayName: buildResetPasswordTemplate().senderDisplayName },
        },
      },
    }),
  });
  return readConfig(res);
}
