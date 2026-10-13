import React from 'react';
import { render } from '@testing-library/react-native';
import { BookingChildSchema } from '@nanny-app/shared';

import { CareNotesCard } from '@mobile/components/booking/CareNotesCard';
import { ChildProfilesCard } from '@mobile/components/booking/ChildProfilesCard';

/**
 * What a nanny reads about the children on a booking: the health warning
 * (allergies, conditions, medicines) and, separately, diet, languages,
 * interests and the mother's note on each child.
 */
const lina = BookingChildSchema.parse({
  name: 'Lina',
  ageYears: 1,
  ageMonths: 20,
  allergies: 'Peanuts',
  conditions: ['Asthma'],
  healthNotes: 'Inhaler in the blue bag',
  diet: ['No sugar'],
  interests: ['Lego'],
  languages: ['Arabic'],
  notes: 'Naps at 2',
});
const omar = BookingChildSchema.parse({ name: 'Omar', ageYears: 5 });

describe('CareNotesCard', () => {
  it('warns the nanny about allergies, conditions and medicines', () => {
    const { getByText, queryByText } = render(
      <CareNotesCard
        bookingChildren={[lina, omar]}
        specialInstructions={null}
        emphasis="warning"
      />,
    );
    getByText('HEALTH WARNING');
    getByText('Peanuts · Asthma');
    getByText('Inhaler in the blue bag');
    // Omar has nothing to warn about, so he isn't listed.
    expect(queryByText('Omar')).toBeNull();
  });

  it('renders nothing when there is nothing to warn about or note', () => {
    const { toJSON } = render(
      <CareNotesCard bookingChildren={[omar]} specialInstructions={null} emphasis="warning" />,
    );
    expect(toJSON()).toBeNull();
  });
});

describe('ChildProfilesCard', () => {
  it('lists diet, languages, interests and notes per child, ages in months for babies', () => {
    const { getByText, queryByText } = render(<ChildProfilesCard bookingChildren={[lina, omar]} />);
    getByText('About the children');
    getByText('Lina · 20 mos');
    getByText(/No sugar/);
    getByText(/Arabic/);
    getByText(/Lego/);
    getByText(/Naps at 2/);
    expect(queryByText(/Omar/)).toBeNull();
  });

  it('falls back to the age when the name is withheld', () => {
    const { getByText } = render(
      <ChildProfilesCard bookingChildren={[{ ...lina, name: null, notes: null }]} />,
    );
    getByText('20 mos');
  });
});
