/**
 * The cancellation-policy questions the business has to answer, each with the
 * options on the table and what every option means for the mother, the nanny
 * and the platform.
 *
 * `status` marks where an option stands: what the code does today, what has
 * been proposed so far, or neither. Examples use EXAMPLE_BOOKING so every
 * number on the page can be checked against the same booking.
 */

export const EXAMPLE_BOOKING = {
  summary: 'A 4-hour booking for EGP 480: 2 package hours (worth EGP 240) plus EGP 240 paid by card.',
  note: 'Illustrative only — the real hourly rate and splits are set in the console.',
} as const;

export type OptionStatus = 'today' | 'proposed';

export type DecisionOption = {
  label: string;
  description: string;
  /** What the mother experiences. */
  mother: string;
  /** Cost, risk or effort for the platform (and the nanny, where it matters). */
  business: string;
  /** The option applied to EXAMPLE_BOOKING, where numbers help. */
  example?: string;
  status?: OptionStatus;
};

export type Decision = {
  id: string;
  title: string;
  question: string;
  /** Why the answer matters, in one or two sentences. */
  context: string;
  options: readonly DecisionOption[];
};

export const DECISIONS: readonly Decision[] = [
  {
    id: 'refund-trigger',
    title: 'Who triggers a cash refund',
    question: 'When a paid booking is cancelled, how does card money get back to the mother?',
    context:
      'Today no refund happens at all, and the console cannot issue one for a cancelled booking — only the Paymob dashboard can.',
    options: [
      {
        label: 'Nothing',
        description: 'No refund is issued; an admin can only act in the Paymob dashboard.',
        mother: 'Waits, or chases support, with no idea what she is owed.',
        business: 'Manual work outside the console, no record on the booking, high risk of complaints and chargebacks.',
        status: 'today',
      },
      {
        label: 'Admin approves every refund',
        description:
          'The console shows a suggested amount on the cancelled booking; an admin confirms, adjusts or declines it.',
        mother: 'A refund arrives once reviewed; she is not promised an amount up front.',
        business: 'Full control and an audit trail; needs someone watching a "refunds to review" queue.',
        status: 'proposed',
      },
      {
        label: 'Automatic outside the window, admin inside',
        description: 'Free cancellations refund instantly; anything with a fee waits for an admin.',
        mother: 'Instant money back in the common case.',
        business: 'Less admin work; automatic refunds can be abused only within the policy you set.',
      },
      {
        label: 'Always automatic',
        description: 'The refund follows the policy the moment the booking is cancelled.',
        mother: 'Fastest and most predictable.',
        business: 'No review step — any policy mistake costs money immediately.',
      },
    ],
  },
  {
    id: 'late-fee',
    title: 'Late-cancellation fee',
    question: 'How much does the mother lose for cancelling inside the cancellation window?',
    context: 'Today it is 50%, fixed in both the server and the app. The window length is already a setting.',
    options: [
      {
        label: 'Fixed 50%',
        description: 'Half the card amount is kept.',
        mother: 'Simple to understand.',
        business: 'Changing it needs a new app build.',
        example: 'Card part EGP 240 → EGP 120 refunded.',
        status: 'today',
      },
      {
        label: 'A percentage set in the console',
        description: 'Same rule, but the % lives next to the window under Booking options.',
        mother: 'The app always shows the current %.',
        business: 'Tune it without a release.',
        example: 'At 30%: EGP 240 → EGP 168 refunded.',
        status: 'proposed',
      },
      {
        label: 'Tiered by notice',
        description: 'e.g. more than 24 h free, 2–24 h 50%, under 2 h 100%.',
        mother: 'Fairer: a last-minute cancel costs more than a next-day one.',
        business: 'Protects the nanny’s day best; more settings and copy to maintain.',
        example: 'Cancel 5 h ahead → EGP 120 refunded; 1 h ahead → nothing.',
      },
      {
        label: 'Flat amount',
        description: 'A fixed EGP fee, whatever the booking’s size.',
        mother: 'Predictable.',
        business: 'Too small to matter on long bookings, too harsh on short ones.',
        example: 'EGP 100 fee → EGP 140 refunded.',
      },
      {
        label: 'No fee',
        description: 'Cancelling is always free.',
        mother: 'Best for her.',
        business: 'Nannies lose blocked time with no compensation.',
      },
    ],
  },
  {
    id: 'credits',
    title: 'Package hours and Care Points on a paid booking',
    question: 'When the mother or an admin cancels a booking she paid for with hours or points, does she get them back?',
    context:
      'Today they come back only before payment. A booking paid entirely with them counts as paid the moment a nanny accepts, so she loses all of it however early she cancels.',
    options: [
      {
        label: 'Forfeit',
        description: 'Hours and points stay spent once the booking is paid.',
        mother: 'Loses prepaid value even on a free cancellation.',
        business: 'Keeps the value; likely support complaints.',
        example: 'She loses the 2 hours (EGP 240) even cancelling a week ahead.',
        status: 'today',
      },
      {
        label: 'Always return in full',
        description: 'Hours go back to their package and points to her wallet on any mother or admin cancellation.',
        mother: 'Never loses prepaid value.',
        business: 'A late cancel carries no penalty on the credit part — the fee only touches card money.',
        example: '2 hours back, whenever she cancels.',
        status: 'proposed',
      },
      {
        label: 'Return minus the fee inside the window',
        description: 'Outside the window, all back; inside, the fee % is kept from the credits too.',
        mother: 'Same rule whether she paid by card or credits.',
        business: 'Consistent policy; fractional hours to handle.',
        example: 'At 50% inside the window: 1 hour back.',
      },
      {
        label: 'Return outside the window only',
        description: 'All back outside the window, none inside.',
        mother: 'Clear, but harsh for a credits-paid late cancel.',
        business: 'Simple to explain and build.',
        example: 'Inside the window: nothing back.',
      },
    ],
  },
  {
    id: 'promo',
    title: 'Promo code',
    question: 'When a paid booking is cancelled, can the mother use the code again?',
    context: 'Today a code is spent the moment the booking is paid, and never given back.',
    options: [
      {
        label: 'Stays used',
        description: 'Once paid, the code is gone.',
        mother: 'Loses a one-time code on any cancellation.',
        business: 'Protects campaign budgets.',
        status: 'today',
      },
      {
        label: 'Restore when she cancels outside the window',
        description: 'A free cancellation gives the code back; a late one keeps it spent.',
        mother: 'Fair for an early change of plans.',
        business: 'Small, predictable cost.',
        status: 'proposed',
      },
      {
        label: 'Also restore when it isn’t her doing',
        description: 'Restore on a nanny or admin cancellation as well.',
        mother: 'Never penalised for someone else’s cancellation.',
        business: 'Slightly more restored codes.',
      },
      {
        label: 'Always restore',
        description: 'Every cancellation returns the code.',
        mother: 'Best for her.',
        business: 'Codes can be held and re-used through late cancellations.',
      },
    ],
  },
  {
    id: 'nanny-cancels',
    title: 'When the nanny cancels a paid booking',
    question: 'What does the mother get back, and how fast?',
    context:
      'Today she is told “You will be refunded in full”, but nothing is refunded, and any hours, points and promo code are lost.',
    options: [
      {
        label: 'Promise only',
        description: 'A full-refund message with no refund behind it.',
        mother: 'Misled; has to chase support.',
        business: 'Trust and chargeback risk.',
        status: 'today',
      },
      {
        label: 'Everything back, admin approves the cash',
        description: 'Hours, points and promo restored at once; the card refund follows the admin review.',
        mother: 'Credits back instantly; money after review.',
        business: 'Same review flow as every other refund.',
        example: '2 hours back now; EGP 240 after approval.',
      },
      {
        label: 'Everything back automatically',
        description: 'Full card refund plus credits and code, immediately.',
        mother: 'Best — it was not her fault.',
        business: 'No review, but the platform carries the whole cost of the nanny’s cancellation.',
      },
      {
        label: 'Find a replacement nanny first',
        description: 'The request goes back to the pool; refund only if no one accepts in time.',
        mother: 'Keeps her childcare, which is usually what she wants.',
        business: 'Saves the booking; needs a deadline rule and a re-broadcast.',
      },
      {
        label: 'Full refund plus goodwill points',
        description: 'Everything back, with bonus Care Points for the trouble.',
        mother: 'Feels looked after.',
        business: 'Costs a little; good retention.',
      },
    ],
  },
  {
    id: 'nanny-consequences',
    title: 'Consequences for a nanny who cancels',
    question: 'Should cancelling a confirmed booking cost the nanny anything?',
    context: 'Today there is no consequence and nothing records how often a nanny cancels.',
    options: [
      {
        label: 'None',
        description: 'No record, no penalty.',
        mother: 'No protection from unreliable nannies.',
        business: 'No signal to act on.',
        status: 'today',
      },
      {
        label: 'Track and show it',
        description: 'Count cancellations on the nanny’s profile in the console.',
        mother: 'Indirect benefit.',
        business: 'Cheap; lets ops spot patterns.',
      },
      {
        label: 'Strikes',
        description: 'Late cancellations add strikes; enough strikes suspend her.',
        mother: 'More reliable nannies.',
        business: 'Needs clear rules and an appeal path.',
      },
      {
        label: 'Lower in the pool',
        description: 'Frequent cancellers see new requests later or less often.',
        mother: 'Reliable nannies reach her first.',
        business: 'Quiet, automatic; harder to explain to nannies.',
      },
      {
        label: 'Fee from future earnings',
        description: 'A late cancellation deducts from her next payout.',
        mother: 'Strongest deterrent.',
        business: 'Contentious; needs a payout ledger that does not exist yet.',
      },
    ],
  },
  {
    id: 'nanny-share',
    title: 'The nanny’s share of a late-cancellation fee',
    question: 'When the mother pays a fee, does any of it go to the nanny who kept the slot free?',
    context: 'Today a nanny earns nothing from a cancelled booking — her earnings count only completed ones.',
    options: [
      {
        label: 'Nothing',
        description: 'The platform keeps any fee.',
        mother: 'No difference.',
        business: 'Nannies bear the cost of late cancellations.',
        status: 'today',
      },
      {
        label: 'Her usual split of the fee',
        description: 'The fee is shared like a normal booking (e.g. 80/20).',
        mother: 'No difference.',
        business: 'Fair to nannies; the fee becomes earnings to report.',
        example: 'EGP 120 fee → EGP 96 to the nanny at 80%.',
      },
      {
        label: 'A fixed short-notice payment',
        description: 'A set amount for any cancellation within a few hours of the start.',
        mother: 'No difference.',
        business: 'Simple; the platform may pay out more than it kept.',
      },
    ],
  },
  {
    id: 'refund-method',
    title: 'How the refund is paid',
    question: 'Does refunded money go back to the card or into Care Points?',
    context: 'The console can already pay an overpayment either way; neither is available for a cancelled booking.',
    options: [
      {
        label: 'Back to the card',
        description: 'A Paymob refund on the original payment.',
        mother: 'Her money back, in a few business days.',
        business: 'Money leaves the platform.',
      },
      {
        label: 'Care Points',
        description: 'The refund is credited as points.',
        mother: 'Instant, but only spendable on bookings.',
        business: 'Money stays on the platform; may feel like a forced store credit.',
      },
      {
        label: 'Care Points with a bonus',
        description: 'e.g. 110% of the refund as points, or the exact amount to the card.',
        mother: 'Her choice, with a reason to stay.',
        business: 'Good retention; costs the bonus.',
      },
      {
        label: 'The admin chooses each time',
        description: 'Decided per refund in the review.',
        mother: 'Depends on the case.',
        business: 'Flexible; inconsistent if there is no guideline.',
      },
    ],
  },
  {
    id: 'admin-cancels',
    title: 'When an admin cancels a paid booking',
    question: 'What does the mother get back?',
    context: 'Admins cancel for very different reasons — a no-show nanny, a safety concern, a mother’s request — and today she gets nothing back.',
    options: [
      {
        label: 'Nothing',
        description: 'Credits and promo stay spent; no refund possible in the console.',
        mother: 'Loses everything.',
        business: 'Manual Paymob work for every case.',
        status: 'today',
      },
      {
        label: 'Credits back, cash reviewed',
        description: 'Hours and points return automatically; the card refund goes through admin review.',
        mother: 'Prepaid value safe; money after review.',
        business: 'Matches the mother-cancel policy.',
        status: 'proposed',
      },
      {
        label: 'Admin picks who is at fault',
        description: 'Cancelling asks “mother’s request / nanny / platform” and applies that party’s policy.',
        mother: 'Treated like the real situation.',
        business: 'One extra choice per cancellation; best records.',
      },
    ],
  },
  {
    id: 'paid-after-cancel',
    title: 'A payment that arrives after the booking was cancelled',
    question: 'What happens when a card payment goes through for a booking that is already cancelled?',
    context: 'Today the money is kept, the booking stays cancelled, and only a server log notices.',
    options: [
      {
        label: 'Kept silently',
        description: 'Money held with no alert.',
        mother: 'Charged for nothing.',
        business: 'Chargeback risk; no one knows to act.',
        status: 'today',
      },
      {
        label: 'Refund automatically',
        description: 'Return the full payment as soon as it lands.',
        mother: 'Money back without asking.',
        business: 'Safe — she never had a booking to pay for.',
      },
      {
        label: 'Flag it for an admin',
        description: 'Show it in the refund review queue.',
        mother: 'Refunded after review.',
        business: 'Consistent with admin-approved refunds.',
      },
      {
        label: 'Restore the booking',
        description: 'If the nanny is still free, confirm it again.',
        mother: 'Gets the care she paid for.',
        business: 'Only works if both still want it; needs both to agree.',
      },
    ],
  },
  {
    id: 'messaging',
    title: 'What the mother is told',
    question: 'What does the cancellation notification say about money and credits?',
    context:
      'Today a mother who cancels hears nothing; a nanny cancellation promises a full refund that never comes.',
    options: [
      {
        label: 'Today',
        description: 'Silence when she cancels; “refunded in full” when the nanny does.',
        mother: 'Confused or misled.',
        business: 'Support load and trust risk.',
        status: 'today',
      },
      {
        label: 'State what came back, promise no money',
        description:
          'e.g. “Your 2 package hours were returned and your promo code can be used again. Our team will review your payment.”',
        mother: 'Knows exactly where her credits are; no false expectations.',
        business: 'Safe wording while refunds are reviewed.',
        status: 'proposed',
      },
      {
        label: 'Also show the expected refund',
        description: 'Add the amount the policy suggests, marked as pending review.',
        mother: 'Knows what to expect.',
        business: 'Creates an expectation an admin may then have to break.',
      },
    ],
  },
];
