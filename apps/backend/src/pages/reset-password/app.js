/*
 * Finishes a password reset from the link in the reset email. The page talks
 * to Firebase directly — Identity Toolkit's accounts:resetPassword, with the
 * `apiKey` the link itself carries, exactly as Firebase's own hosted handler
 * does — so the new password never passes through our backend.
 *
 * The password rules mirror the app's (RegistrationAccountScreen,
 * ForgotPasswordScreen) and the project's password policy
 * (apps/backend/src/lib/password-policy.ts). Change all three together.
 */
(function () {
  'use strict';

  const body = document.body;
  const toolkitBase = body.dataset.identityToolkit;
  const fallbackHandler = body.dataset.fallbackHandler;

  const params = new URLSearchParams(window.location.search);
  const mode = params.get('mode');
  const oobCode = params.get('oobCode');
  const apiKey = params.get('apiKey');

  // The action URL is project-wide: any other action (email verification,
  // email change) belongs to Firebase's own handler, which keeps working.
  if (mode && mode !== 'resetPassword') {
    window.location.replace(fallbackHandler + window.location.search);
    return;
  }

  // Keep the one-time code out of the address bar, history and screenshots.
  window.history.replaceState(null, '', window.location.pathname);

  const views = ['loading', 'form', 'done', 'invalid', 'offline'];
  function show(name) {
    views.forEach(function (v) {
      document.getElementById('view-' + v).hidden = v !== name;
    });
  }

  /** Identity Toolkit's error message is its code, sometimes with " : detail". */
  function errorCode(message) {
    return String(message || 'UNKNOWN').split(':')[0].trim();
  }

  async function resetPassword(payload) {
    let res;
    try {
      res = await fetch(
        toolkitBase + '/v1/accounts:resetPassword?key=' + encodeURIComponent(apiKey),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
    } catch (_err) {
      throw Object.assign(new Error('offline'), { code: 'NETWORK' });
    }
    const data = await res.json().catch(function () {
      return {};
    });
    if (!res.ok) {
      const message = data && data.error && data.error.message;
      throw Object.assign(new Error(message), { code: errorCode(message) });
    }
    return data;
  }

  const LINK_DEAD = ['INVALID_OOB_CODE', 'EXPIRED_OOB_CODE', 'MISSING_OOB_CODE', 'USER_NOT_FOUND'];

  function messageFor(code) {
    switch (code) {
      case 'PASSWORD_DOES_NOT_MEET_REQUIREMENTS':
      case 'WEAK_PASSWORD':
        return "That password doesn't meet the requirements above.";
      case 'USER_DISABLED':
        return 'This account has been disabled. Please contact Nanny Now support.';
      case 'TOO_MANY_ATTEMPTS_TRY_LATER':
        return 'Too many attempts. Wait a few minutes and try again.';
      case 'NETWORK':
        return "We couldn't reach the server. Check your connection and try again.";
      default:
        return 'Something went wrong. Please try again.';
    }
  }

  // ── Verify the link ───────────────────────────────────────────────────────

  async function verify() {
    show('loading');
    try {
      const data = await resetPassword({ oobCode: oobCode });
      document.getElementById('account-email').textContent = data.email || 'your account';
      show('form');
      document.getElementById('password').focus();
    } catch (err) {
      show(err.code === 'NETWORK' ? 'offline' : 'invalid');
    }
  }

  document.getElementById('retry').addEventListener('click', verify);

  // ── The form ──────────────────────────────────────────────────────────────

  const password = document.getElementById('password');
  const confirm = document.getElementById('confirm');
  const submit = document.getElementById('submit');
  const formError = document.getElementById('form-error');

  const rules = {
    length: function (p) {
      return p.length >= 8;
    },
    uppercase: function (p) {
      return /[A-Z]/.test(p);
    },
    number: function (p) {
      return /\d/.test(p);
    },
    match: function (p, c) {
      return p.length > 0 && p === c;
    },
  };

  function refresh() {
    let allMet = true;
    document.querySelectorAll('[data-rule]').forEach(function (li) {
      const met = rules[li.dataset.rule](password.value, confirm.value);
      li.classList.toggle('met', met);
      allMet = allMet && met;
    });
    submit.disabled = !allMet;
    return allMet;
  }

  password.addEventListener('input', refresh);
  confirm.addEventListener('input', refresh);

  document.querySelectorAll('[data-toggle]').forEach(function (button) {
    button.addEventListener('click', function () {
      const input = document.getElementById(button.dataset.toggle);
      const reveal = input.type === 'password';
      input.type = reveal ? 'text' : 'password';
      button.textContent = reveal ? 'Hide' : 'Show';
    });
  });

  document.getElementById('reset-form').addEventListener('submit', async function (event) {
    event.preventDefault();
    if (!refresh()) return;

    formError.hidden = true;
    submit.disabled = true;
    submit.textContent = 'Saving…';
    try {
      await resetPassword({ oobCode: oobCode, newPassword: password.value });
      show('done');
    } catch (err) {
      if (LINK_DEAD.indexOf(err.code) !== -1) {
        show('invalid');
        return;
      }
      formError.textContent = messageFor(err.code);
      formError.hidden = false;
      submit.textContent = 'Save password';
      refresh();
    }
  });

  if (!oobCode || !apiKey) {
    show('invalid');
  } else {
    verify();
  }
})();
