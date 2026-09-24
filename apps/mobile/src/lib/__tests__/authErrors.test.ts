import { mapFirebaseAuthError } from '@mobile/lib/authErrors';

describe('mapFirebaseAuthError', () => {
  it('never shows a non-Firebase error message to the user', () => {
    expect(mapFirebaseAuthError(new Error('TypeError: undefined is not a function'))).toEqual({
      field: 'form',
      message: 'Something went wrong. Please try again.',
    });
  });

  it('maps a known Firebase code to its field', () => {
    expect(mapFirebaseAuthError({ code: 'auth/invalid-email', message: 'x' })).toMatchObject({ field: 'email' });
  });
});
