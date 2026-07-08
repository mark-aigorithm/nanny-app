type FeedbackProps = {
  tone: 'error' | 'success';
  children: string;
};

export function Feedback({ tone, children }: FeedbackProps) {
  return <p className={`feedback feedback--${tone}`}>{children}</p>;
}
