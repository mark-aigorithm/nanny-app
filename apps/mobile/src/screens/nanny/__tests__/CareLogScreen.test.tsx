import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { BookingChildSchema, type BookingResponse } from '@nanny-app/shared';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));
jest.mock('expo-image-picker', () => ({}));
jest.mock('@mobile/lib/storage', () => ({ uploadImageToFirebase: jest.fn() }));

let mockBooking: Partial<BookingResponse>;
jest.mock('@mobile/hooks/useBookings', () => ({
  useBookingList: () => ({ data: [mockBooking] }),
  useCheckOut: () => ({ mutate: jest.fn(), isPending: false }),
}));

const mockCreate = jest.fn();
jest.mock('@mobile/hooks/useCareLogs', () => ({
  useCareLogs: () => ({ data: [], isLoading: false }),
  useCreateCareLog: () => ({ mutateAsync: mockCreate }),
}));

import CareLogScreen from '@mobile/screens/nanny/CareLogScreen';
import { useConfirmDialogStore } from '@mobile/store/confirmDialogStore';

function child(name: string, ageYears: number) {
  return BookingChildSchema.parse({ name, ageYears });
}

function bookingWith(children: ReturnType<typeof child>[]): Partial<BookingResponse> {
  return { id: 7, motherFirstName: 'Sara', motherLastName: 'Adel', children };
}

async function openMeal() {
  const screen = render(<CareLogScreen />);
  fireEvent.press(screen.getByText('Meal'));
  await act(async () => {});
  return screen;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCreate.mockResolvedValue({});
  useConfirmDialogStore.setState({ dialog: null });
});

describe('CareLogScreen — which child', () => {
  it('asks which child before saving when the booking has several', async () => {
    mockBooking = bookingWith([child('Lina', 3), child('Omar', 5)]);
    const screen = await openMeal();

    expect(screen.getByText('WHICH CHILD?')).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByText('Save entry')));
    expect(useConfirmDialogStore.getState().dialog).toMatchObject({ title: 'Which child?' });
    expect(mockCreate).not.toHaveBeenCalled();

    fireEvent.press(screen.getByText('Omar'));
    await act(async () => fireEvent.press(screen.getByText('Save entry')));
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'MEAL', childNames: ['Omar'] }),
    );
  });

  it('logs for every child with "All", in booking order', async () => {
    mockBooking = bookingWith([child('Lina', 3), child('Omar', 5)]);
    const screen = await openMeal();

    fireEvent.press(screen.getByText('All'));
    await act(async () => fireEvent.press(screen.getByText('Save entry')));
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ childNames: ['Lina', 'Omar'] }),
    );
  });

  it('picks an only child for her', async () => {
    mockBooking = bookingWith([child('Lina', 3)]);
    const screen = await openMeal();

    expect(screen.getByText('CHILD')).toBeTruthy();
    expect(screen.queryByText('All')).toBeNull();
    await act(async () => fireEvent.press(screen.getByText('Save entry')));
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ childNames: ['Lina'] }));
  });

  it('asks nothing on a booking with no children listed', async () => {
    mockBooking = bookingWith([]);
    const screen = await openMeal();

    expect(screen.queryByText('WHICH CHILD?')).toBeNull();
    await act(async () => fireEvent.press(screen.getByText('Save entry')));
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ childNames: [] }));
  });
});
