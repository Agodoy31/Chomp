import Modal from 'react-bootstrap/Modal';
import type { Conversation } from '../../types/Messaging/Conversation';
import { CURRENT_USER_ID } from '../../testData/mockConversations';

interface ConversationDetailsModalProps {
  show: boolean;
  onHide: () => void;
  conversation?: Conversation | null;
}

export default function ConversationDetailsModal({
  show,
  onHide,
  conversation,
}: ConversationDetailsModalProps) {
  if (!conversation) return null;

  const participants = conversation.participants || [];

  const getSubtitle = () => {
    if (conversation.type === 'CHANNEL') {
      const channelTag = conversation.title ? `#${conversation.title}` : '';
      return channelTag ? `${channelTag} • Club channel` : 'Club channel';
    }
    if (conversation.type === 'GROUP') {
      return 'Group message';
    }
    return 'Direct message';
  };

  return (
    <Modal
      show={show}
      onHide={onHide}
      centered
      contentClassName="border-0 rounded-4 shadow p-3"
    >
      <Modal.Body className="p-2">
        {/* Header row with title and close button */}
        <div className="d-flex align-items-center justify-content-between mb-4">
          <h2 className="h5 fw-bold mb-0 text-dark">Conversation details</h2>
          <button
            type="button"
            onClick={onHide}
            className="btn rounded-circle d-flex align-items-center justify-content-center border-0 p-0"
            style={{
              width: '32px',
              height: '32px',
              backgroundColor: '#EDF0F5',
              cursor: 'pointer',
            }}
            aria-label="Close"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M1 1L11 11M1 11L11 1"
                stroke="#3046C3"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        {/* Conversation name and type */}
        <div className="mb-4">
          <h3 className="h5 fw-bold mb-1 text-dark">
            {conversation.displayName}
          </h3>
          <p className="text-secondary small mb-0">{getSubtitle()}</p>
        </div>

        {/* Participants count heading */}
        <div className="mb-3">
          <h4 className="fw-bold mb-0 text-dark" style={{ fontSize: '15px' }}>
            Participants ({participants.length})
          </h4>
        </div>

        {/* Participants roster */}
        <div className="d-flex flex-column gap-3">
          {participants.length === 0 ? (
            <div className="text-secondary small">No participants</div>
          ) : (
            participants.map((participant) => {
              const isCurrent =
                participant._id === CURRENT_USER_ID ||
                participant.firstName.toLowerCase() === 'you';
              const displayName = isCurrent ? 'You' : participant.firstName;
              const initial = (displayName.charAt(0) || 'U').toUpperCase();

              return (
                <div
                  key={participant._id}
                  className="d-flex align-items-center gap-3"
                >
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
                  <span
                    className="text-dark fw-medium"
                    style={{ fontSize: '15px' }}
                  >
                    {displayName}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </Modal.Body>
    </Modal>
  );
}
