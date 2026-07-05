export interface GuideQuestion {
  number: number;
  question: string;
  whyItMatters: string;
  listenFor: string;
}

export const NANNY_SELECTION_GUIDE = {
  tag: 'Curated Advice',
  title: 'The Nanny Selection Guide: 5 Questions to Ask',
  readTime: '4 min read',
  intro:
    'A great nanny is more than a résumé. These five questions help you uncover how someone thinks under pressure, communicates with parents, and keeps children safe — before you ever book a trial shift.',
  questions: [
    {
      number: 1,
      question: 'How would you handle a child who refuses to nap or follow a routine?',
      whyItMatters:
        'Routines reduce stress for children and parents. You want someone who stays calm, adapts without giving up, and partners with you instead of forcing a one-size-fits-all approach.',
      listenFor:
        'Specific strategies (quiet time, reading, adjusting the environment), patience, and willingness to log what worked so you can stay aligned.',
    },
    {
      number: 2,
      question: 'What is your process when a child has a minor injury or feels unwell?',
      whyItMatters:
        'Accidents happen. The right caregiver notices early, acts proportionately, and communicates clearly — without panic or minimising your concerns.',
      listenFor:
        'First-aid awareness, when they would call you immediately vs. monitor and update, and comfort measures they use while waiting for a parent.',
    },
    {
      number: 3,
      question: 'How do you manage screen time, snacks, and boundaries we set at home?',
      whyItMatters:
        'Consistency builds trust. A nanny who respects your house rules — even when the kids push back — protects your values and prevents “but the nanny let me” moments.',
      listenFor:
        'Examples of enforcing limits kindly, asking about allergies or preferences upfront, and checking in when something is unclear.',
    },
    {
      number: 4,
      question: 'Can you walk me through a typical day with a child this age?',
      whyItMatters:
        'This reveals planning skills, age-appropriate activities, and whether they think ahead about meals, outdoor time, and transitions — not just “we’ll play and see.”',
      listenFor:
        'Balance of structure and flexibility, developmental activities (crafts, movement, language), and how they build in safety checks and handover notes.',
    },
    {
      number: 5,
      question: 'How do you prefer to communicate with parents during and after a shift?',
      whyItMatters:
        'You should never wonder what happened while you were away. Clear updates — especially on the first few bookings — set the tone for a long-term fit.',
      listenFor:
        'Comfort with photos or brief logs, response time expectations, honesty about challenges, and respect for your preferred channel (in-app chat, call, etc.).',
    },
  ] satisfies GuideQuestion[],
  tipTitle: 'Before you decide',
  tipBody:
    'Schedule a short meet-and-greet or trial block when possible. Trust your instincts, but pair them with references, verified certifications on NannyNow, and a conversation that covers these five areas.',
} as const;
