import type { ChatUser } from '../../types/Messaging/Conversation';

interface SelectedUserTagProps {
  user: ChatUser;
  onRemove: () => void;
}

export default function SelectedUserTag({
  user,
  onRemove,
}: SelectedUserTagProps) {
  return (
    <div
      className="d-inline-flex align-items-center gap-1 rounded-pill px-3 py-1"
      style={{
        backgroundColor: '#EBF2FF',
        color: '#3046C3',
        fontSize: '14px',
        fontWeight: 500,
      }}
    >
      <span>{user.firstName}</span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="btn p-0 border-0 d-flex align-items-center justify-content-center ms-1"
        style={{
          color: '#3046C3',
          background: 'none',
          lineHeight: 1,
          cursor: 'pointer',
        }}
        aria-label={`Remove ${user.firstName}`}
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M2 2L10 10M2 10L10 2"
            stroke="#3046C3"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  );
}
