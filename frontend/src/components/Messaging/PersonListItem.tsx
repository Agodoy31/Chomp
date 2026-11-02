import type { ChatUser } from '../../types/Messaging/Conversation';

interface PersonListItemProps {
  user: ChatUser;
  isSelected: boolean;
  onToggle: () => void;
}

export default function PersonListItem({
  user,
  isSelected,
  onToggle,
}: PersonListItemProps) {
  const initial = user.firstName.charAt(0).toUpperCase();

  return (
    <div
      onClick={onToggle}
      className="d-flex align-items-center justify-content-between p-2"
      style={{
        backgroundColor: isSelected ? '#EFF5FF' : 'transparent',
        cursor: 'pointer',
        transition: 'background-color 0.15s ease',
        borderRadius: '0px',
      }}
    >
      <div className="d-flex align-items-center gap-3">
        <div
          className="rounded-circle d-flex align-items-center justify-content-center fw-bold flex-shrink-0"
          style={{
            width: '36px',
            height: '36px',
            backgroundColor: '#D4E4FC',
            color: '#3046C3',
            fontSize: '15px',
          }}
        >
          {initial}
        </div>
        <span className="text-dark fw-medium" style={{ fontSize: '15px' }}>
          {user.firstName}
        </span>
      </div>

      {/* Checkbox with square corners */}
      <div
        className="d-flex align-items-center justify-content-center"
        style={{
          width: '20px',
          height: '20px',
          borderRadius: '0px',
          backgroundColor: isSelected ? '#3046C3' : '#FFFFFF',
          border: isSelected ? '1px solid #3046C3' : '1.5px solid #CBD5E1',
          transition: 'all 0.15s ease',
        }}
      >
        {isSelected && (
          <svg
            width="12"
            height="10"
            viewBox="0 0 12 10"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M1.5 5L4.5 8L10.5 2"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </div>
    </div>
  );
}