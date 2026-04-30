interface SubmissionsBadgeProps {
  count: number;
  onClick: () => void;
}

export function SubmissionsBadge({ count, onClick }: SubmissionsBadgeProps) {
  return (
    <button
      className="submissions-badge-btn"
      onClick={onClick}
      type="button"
      aria-label={`Orders: ${count} pending`}
    >
      Orders
      {count > 0 && (
        <span className="submissions-badge-count">{count}</span>
      )}
    </button>
  );
}
