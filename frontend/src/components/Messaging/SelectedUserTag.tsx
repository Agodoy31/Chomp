import Badge from 'react-bootstrap/Badge';
import CloseButton from 'react-bootstrap/CloseButton';
import type { UserSummary } from '../../types/Messaging/Conversation';

interface SelectedUserTagProps {
  user: UserSummary;
  onRemove: () => void;
  disabled?: boolean;
}

export default function SelectedUserTag({
  user,
  onRemove,
  disabled = false,
}: SelectedUserTagProps) {
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ');

  return (
    <Badge
      pill
      bg=""
      className="d-inline-flex align-items-center gap-2 px-3 py-2 fw-medium"
      style={{
        backgroundColor: '#EBF2FF',
        color: '#3046C3',
        fontSize: '14px',
      }}
    >
      <span>{fullName}</span>
      <CloseButton
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        disabled={disabled}
        aria-label={`Remove ${fullName}`}
        style={{ width: '0.6em', height: '0.6em' }}
      />
    </Badge>
  );
}
