import type { UserResponse } from '@nanny-app/shared';
import { renderHook, act } from '@testing-library/react-native';

import { useEmailGate } from '@mobile/hooks/useEmailGate';
import { useEmailGateStore } from '@mobile/store/emailGateStore';
import { useUserProfileStore } from '@mobile/store/userProfileStore';

function profile(isEmailVerified: boolean): UserResponse {
  return {
    id: 1,
    firebaseUid: 'fb-1',
    email: isEmailVerified ? 'sarah@example.com' : '201000000000@phone.nannyapp.local',
    phone: '+201000000000',
    firstName: 'Sarah',
    lastName: 'Hassan',
    dateOfBirth: '1990-01-01',
    avatarUrl: null,
    role: 'MOTHER',
    isEmailVerified,
    isPhoneVerified: false,
    idVerificationStatus: 'APPROVED',
    idDocumentType: null,
    idRejectionReason: null,
    address: null,
    latitude: null,
    longitude: null,
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

beforeEach(() => {
  useUserProfileStore.setState({ profile: null });
  useEmailGateStore.setState({ visible: false });
});

describe('useEmailGate', () => {
  it('runs the action when the address is already proven', () => {
    useUserProfileStore.setState({ profile: profile(true) });
    const action = jest.fn();

    const { result } = renderHook(() => useEmailGate());
    expect(result.current.needsEmail).toBe(false);
    act(() => result.current.gate(action)());

    expect(action).toHaveBeenCalled();
    expect(useEmailGateStore.getState().visible).toBe(false);
  });

  it('opens the modal instead of the action when it is not', () => {
    useUserProfileStore.setState({ profile: profile(false) });
    const action = jest.fn();

    const { result } = renderHook(() => useEmailGate());
    expect(result.current.needsEmail).toBe(true);
    act(() => result.current.gate(action)());

    expect(action).not.toHaveBeenCalled();
    expect(useEmailGateStore.getState().visible).toBe(true);
  });

  it('lets the tap through while the profile is still loading', () => {
    // A cold launch renders before /auth/me resolves; blocking then would show
    // the modal to someone who has already verified.
    useUserProfileStore.setState({ profile: null });
    const action = jest.fn();

    const { result } = renderHook(() => useEmailGate());
    expect(result.current.needsEmail).toBe(false);
    act(() => result.current.gate(action)());

    expect(action).toHaveBeenCalled();
  });

  it('forwards the action arguments', () => {
    useUserProfileStore.setState({ profile: profile(true) });
    const action = jest.fn();

    const { result } = renderHook(() => useEmailGate());
    act(() => result.current.gate(action)('nanny-7', 3));

    expect(action).toHaveBeenCalledWith('nanny-7', 3);
  });

  it('composes with another gate, running the outer one first', () => {
    useUserProfileStore.setState({ profile: profile(false) });
    const action = jest.fn();
    const innerGate = jest.fn((fn: () => void) => fn);

    const { result } = renderHook(() => useEmailGate());
    act(() => result.current.gate(innerGate(action))());

    // The inner gate is built eagerly, but the action behind it never runs.
    expect(action).not.toHaveBeenCalled();
    expect(useEmailGateStore.getState().visible).toBe(true);
  });
});
