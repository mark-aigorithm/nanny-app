import { hashPin, randomStartPin } from '@backend/lib/pin';

describe('pin util', () => {
  it('randomStartPin always returns 4 digits, including leading zeros', () => {
    for (let i = 0; i < 500; i += 1) {
      expect(randomStartPin()).toMatch(/^\d{4}$/);
    }
  });

  it('hashPin is deterministic and does not return the plaintext', () => {
    expect(hashPin('0042')).toBe(hashPin('0042'));
    expect(hashPin('0042')).not.toBe('0042');
    expect(hashPin('0042')).not.toBe(hashPin('0043'));
  });
});
