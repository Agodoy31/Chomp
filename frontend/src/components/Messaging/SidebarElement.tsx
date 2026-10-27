import type { Conversation } from '../../types/Messaging/Converstation';

interface SidebarElementProps {
  conversation: Conversation;
  isActive?: boolean;
  onSelect?: (conversation: Conversation) => void;
}

export default function SidebarElement({
  conversation,
  isActive = false,
  onSelect,
}: SidebarElementProps) {
  const initial = conversation.displayName.charAt(0).toUpperCase();

  const previewText = conversation.lastMessage
    ? `${conversation.lastMessage.senderName}: ${conversation.lastMessage.text}`
    : '';

  return (
    <button
      type="button"
      onClick={() => onSelect?.(conversation)}
      className="btn text-start p-3 w-100 border-0"
      style={{
        backgroundColor: isActive ? '#A7CDDF' : '#EDF0F5',
        borderRadius: '16px',
        transition: 'background-color 0.15s ease-in-out',
        cursor: 'pointer',
      }}
    >
      <div className="d-flex align-items-center gap-3">
        {/* Avatar circle */}
        <div
          className="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0 fw-bold"
          style={{
            width: '44px',
            height: '44px',
            backgroundColor: isActive ? '#3046C3' : '#D9D9D9',
            color: isActive ? '#FFFFFF' : '#3046C3',
            fontSize: '18px',
          }}
        >
          {initial}
        </div>

        {/* Text information */}
        <div className="d-flex flex-column justify-content-center overflow-hidden flex-grow-1">
          <div
            className="fw-bold text-dark text-truncate"
            style={{ fontSize: '15px', lineHeight: '1.2' }}
          >
            {conversation.displayName}
          </div>

          {conversation.type === 'CHANNEL' && conversation.title && (
            <div
              className="fw-bold text-truncate mt-1"
              style={{ color: '#3046C3', fontSize: '13px', lineHeight: '1.2' }}
            >
              # {conversation.title}
            </div>
          )}

          {previewText && (
            <div
              className="text-truncate mt-1"
              style={{
                color: isActive ? '#374151' : '#6B7280',
                fontSize: '13px',
                lineHeight: '1.2',
              }}
            >
              {previewText}
            </div>
          )}
        </div>
      </div>
    </button>
  );
}
