import { Spinner } from './spinner';

type LoadingStateProps = {
  label?: string;
};

/** Centered spinner + label for whole-section loading (forms, config). */
export function LoadingState({ label = 'Loading…' }: LoadingStateProps) {
  return (
    <div className="loading-state">
      <Spinner size={26} />
      <span>{label}</span>
    </div>
  );
}
