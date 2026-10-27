import type { IMessage } from '../../types/Messaging/Message';

interface MessageProps {
  message?: IMessage;
  senderName?: string;
  isCurrentUser?: boolean;
}

export default function Message({
  message,
  senderName = 'Alberta',
  isCurrentUser = false,
}: MessageProps) {
  if (!message) {
    return <div className="text-muted p-2">Message</div>;
  }

  const displayName = isCurrentUser ? 'You' : senderName;
  const initial = isCurrentUser ? 'Y' : displayName.charAt(0).toUpperCase();

  const timeString = new Date(message.createdAt).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
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
