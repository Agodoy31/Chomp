import type { IMessage } from '../../types/Messaging/Message';

interface MessageProps {
  message: IMessage;
  senderName?: string;
  isCurrentUser?: boolean;
}

export default function Message({
  message,
  senderName = '',
  isCurrentUser = false,
}: MessageProps) {
  if (message.isSystem) {
    return (
      <div
        className="text-center text-muted small my-2 py-1"
        role="status"
        style={{ fontSize: '13px' }}
      >
        {message.text}
      </div>
    );
  }

  const displayName = isCurrentUser ? 'You' : senderName || 'User';
  const initial = (displayName.charAt(0) || 'U').toUpperCase();

  const createdDate = new Date(message.createdAt);
  const now = new Date();
  const isToday =
    createdDate.getFullYear() === now.getFullYear() &&
    createdDate.getMonth() === now.getMonth() &&
    createdDate.getDate() === now.getDate();
  const isSameYear = createdDate.getFullYear() === now.getFullYear();

  const timeString = isToday
    ? createdDate.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
      })
    : createdDate.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        ...(isSameYear ? {} : { year: 'numeric' }),
        hour: 'numeric',
        minute: '2-digit',
      });

  return (
    <div className="d-flex align-items-start gap-3 mb-3">
      {/* Sender Avatar */}
      <div
        className="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0 fw-bold shadow-sm"
        style={{
          width: '40px',
          height: '40px',
          backgroundColor: isCurrentUser ? '#FF6C2F' : '#A7CDDF',
          color: isCurrentUser ? '#FFFFFF' : '#3046C3',
          fontSize: '16px',
        }}
      >
        {initial}
      </div>

      {/* Message Body */}
      <div className="d-flex flex-column">
        <div className="d-flex align-items-baseline gap-2">
          <span className="fw-bold text-dark" style={{ fontSize: '15px' }}>
            {displayName}
          </span>
          <span className="text-muted" style={{ fontSize: '12px' }}>
            {timeString}
          </span>
        </div>
        <div
          className="mt-1"
          style={{
            color: '#1F2937',
            fontSize: '14px',
            lineHeight: '1.45',
            wordBreak: 'break-word',
          }}
        >
          {message.text}
        </div>
      </div>
    </div>
  );
}
