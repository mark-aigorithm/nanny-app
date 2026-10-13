import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import type { Child } from '@nanny-app/shared';

import ChildForm from '@mobile/components/ChildForm';

/**
 * The child form: name and birth month are required, every chip list takes a
 * preset or the mother's own words, and what it submits is a valid ChildInput.
 */
const NOW = new Date('2026-07-20T10:00:00Z');

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
});
afterEach(() => {
  jest.useRealTimers();
});

describe('ChildForm', () => {
  it('will not save a child without a name', () => {
    const onSubmit = jest.fn();
    const { getByText } = render(<ChildForm onSubmit={onSubmit} />);

    fireEvent.press(getByText('Save child'));

    expect(onSubmit).not.toHaveBeenCalled();
    getByText('Add the child’s name.');
  });

  it('saves the name, birth month, presets and a typed "Other"', () => {
    const onSubmit = jest.fn();
    const { getByText, getByTestId, getAllByText } = render(<ChildForm onSubmit={onSubmit} />);

    fireEvent.changeText(getByTestId('childForm.name'), 'Lina');
    // Starts three years back (July 2023); one year older is July 2022.
    fireEvent.press(getByTestId('childForm.year.decrement'));
    getByText('Lina is 4 yrs');

    fireEvent.press(getByText('Peanuts'));
    fireEvent.press(getByText('Asthma'));
    fireEvent.press(getByText('Lego'));
    // "+ Other" on the allergies list, then a free-text allergy.
    fireEvent.press(getAllByText('+ Other')[0]!);
    fireEvent.changeText(getByTestId('childForm.allergies.other'), 'Strawberries');
    fireEvent.press(getByText('Add'));
    getByText('Strawberries');

    fireEvent.press(getByText('Save child'));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Lina',
        birthMonth: '2022-07',
        allergies: ['Peanuts', 'Strawberries'],
        conditions: ['Asthma'],
        interests: ['Lego'],
        diet: [],
        healthNotes: null,
        notes: null,
      }),
    );
  });

  it('shows a baby’s age in months', () => {
    const { getByTestId, getByText } = render(<ChildForm onSubmit={jest.fn()} />);
    fireEvent.changeText(getByTestId('childForm.name'), 'Omar');
    // July 2023 → July 2026 is 3 yrs; three years later is the current year.
    fireEvent.press(getByTestId('childForm.year.increment'));
    fireEvent.press(getByTestId('childForm.year.increment'));
    fireEvent.press(getByTestId('childForm.year.increment'));
    fireEvent.press(getByTestId('childForm.month.decrement'));
    getByText('Omar is 1 mo');
  });

  it('prefills an existing child and asks a name-less one for a name', () => {
    const legacy: Child = {
      id: 3,
      name: null,
      birthMonth: null,
      ageYears: 5,
      ageMonths: null,
      allergies: ['peanuts, and cats make her wheeze'],
      conditions: [],
      healthNotes: null,
      diet: [],
      interests: [],
      languages: [],
      notes: null,
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    const onSubmit = jest.fn();
    const { getByText } = render(<ChildForm initial={legacy} onSubmit={onSubmit} />);

    // The old free-text allergy is kept as a chip of its own.
    getByText('peanuts, and cats make her wheeze');
    fireEvent.press(getByText('Save changes'));
    expect(onSubmit).not.toHaveBeenCalled();
    getByText('Add the child’s name.');
  });
});
