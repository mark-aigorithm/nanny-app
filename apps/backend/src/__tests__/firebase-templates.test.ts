import {
  buildResetPasswordTemplate,
  getResetPasswordTemplate,
  pushResetPasswordTemplate,
  type FetchLike,
} from '@backend/lib/email/firebase-templates';

const PROJECT = 'nanny-now-d8518';
const CONFIG_URL = `https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT}/config`;

function respond(status: number, payload: unknown): ReturnType<FetchLike> {
  return Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => payload });
}

describe('buildResetPasswordTemplate', () => {
  it('is the branded HTML template, sent as Nanny Now', () => {
    const t = buildResetPasswordTemplate();

    expect(t.senderDisplayName).toBe('Nanny Now');
    expect(t.subject).toBe('Reset your Nanny Now password');
    expect(t.bodyFormat).toBe('HTML');
    expect(t.body).toContain('href="%LINK%"');
  });
});

describe('getResetPasswordTemplate', () => {
  it('reads the project config with the bearer token', async () => {
    const fetch = jest.fn<ReturnType<FetchLike>, Parameters<FetchLike>>(() =>
      respond(200, { notification: { sendEmail: { resetPasswordTemplate: { subject: 'Old' } } } }),
    );

    const current = await getResetPasswordTemplate({ projectId: PROJECT, accessToken: 'tok', fetch });

    expect(current).toEqual({ subject: 'Old' });
    expect(fetch).toHaveBeenCalledWith(CONFIG_URL, {
      method: 'GET',
      headers: { Authorization: 'Bearer tok' },
    });
  });
});

describe('pushResetPasswordTemplate', () => {
  it('patches only the four fields it owns', async () => {
    const fetch = jest.fn<ReturnType<FetchLike>, Parameters<FetchLike>>(() =>
      respond(200, {
        notification: { sendEmail: { resetPasswordTemplate: { subject: 'Reset your Nanny Now password' } } },
      }),
    );

    await pushResetPasswordTemplate({ projectId: PROJECT, accessToken: 'tok', fetch });

    const [url, init] = fetch.mock.calls[0]!;
    const mask = new URL(url).searchParams.get('updateMask');
    expect(url.startsWith(`${CONFIG_URL}?`)).toBe(true);
    expect(mask?.split(',')).toEqual([
      'notification.sendEmail.resetPasswordTemplate.senderDisplayName',
      'notification.sendEmail.resetPasswordTemplate.subject',
      'notification.sendEmail.resetPasswordTemplate.body',
      'notification.sendEmail.resetPasswordTemplate.bodyFormat',
    ]);
    expect(init?.method).toBe('PATCH');
    expect(init?.headers).toEqual({ Authorization: 'Bearer tok', 'Content-Type': 'application/json' });

    const sent = JSON.parse(init?.body ?? '{}') as {
      notification: { sendEmail: { resetPasswordTemplate: Record<string, unknown> } };
    };
    expect(sent.notification.sendEmail.resetPasswordTemplate).toEqual(buildResetPasswordTemplate());
  });

  it("throws with the API's message on a non-2xx", async () => {
    const fetch = jest.fn<ReturnType<FetchLike>, Parameters<FetchLike>>(() =>
      respond(403, { error: { message: 'The caller does not have permission' } }),
    );

    await expect(
      pushResetPasswordTemplate({ projectId: PROJECT, accessToken: 'tok', fetch }),
    ).rejects.toThrow('403: The caller does not have permission');
  });
});
