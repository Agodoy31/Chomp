import ListGroup from 'react-bootstrap/ListGroup';
import Form from 'react-bootstrap/Form';
import type { UserSummary } from '../../types/Messaging/Conversation';

interface PersonListItemProps {
  user: UserSummary;
  isSelected: boolean;
  onToggle: () => void;
  disabled?: boolean;
}

export default function PersonListItem({
  user,
  isSelected,
  onToggle,
  disabled = false,
}: PersonListItemProps) {
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ');
  const initial = fullName.charAt(0).toUpperCase();

  return (
    <ListGroup.Item
      action
      type="button"
      active={isSelected}
      disabled={disabled}
      onClick={onToggle}
      aria-pressed={isSelected}
      className="d-flex align-items-center justify-content-between border-0 rounded-2 px-2 py-2"
      style={{
        backgroundColor: isSelected ? '#EFF5FF' : 'transparent',
        color: '#1F2937',
      }}
    >
      <div className="d-flex align-items-center gap-3 overflow-hidden">
        <div
          aria-hidden="true"
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
        <div className="d-flex flex-column text-truncate">
          <span className="text-dark fw-medium text-truncate" style={{ fontSize: '15px' }}>
            {fullName}
          </span>
          {user.email && (
            <span className="text-muted text-truncate" style={{ fontSize: '12px' }}>
              {user.email}
            </span>
          )}
        </div>
      </div>

      <Form.Check
        type="checkbox"
        checked={isSelected}
        readOnly
        tabIndex={-1}
        aria-hidden="true"
        className="mb-0 pe-1"
        style={{ pointerEvents: 'none' }}
      />
    </ListGroup.Item>
  );
}
