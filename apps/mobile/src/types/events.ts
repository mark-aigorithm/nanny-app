export interface Attendee {
  id: string;
  image: string;
}

export interface EventData {
  id: string;
  title: string;
  month: string;
  day: string;
  image: string;
  ageRange: string;
  location: string;
  attendees: Attendee[];
  goingCount: string;
  spotsLeft?: string;
  showJoinButton?: boolean;
}
