import { randomStartPin } from '@backend/lib/pin';

describe('pin util', () => {
  it('randomStartPin always returns 4 digits, including leading zeros', () => {
    for (let i = 0; i < 200; i++) {
      expect(randomStartPin()).toMatch(/^\d{4}$/);
    }
  });
});
