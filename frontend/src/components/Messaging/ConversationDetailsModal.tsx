import { useState } from 'react';
import Modal from 'react-bootstrap/Modal';
import type { ConversationDetails } from '../../types/Messaging/Conversation';
import { useAuth } from '../../hooks/useAuth';
import { updateConversationTitle } from '../../api/messagingApi';

interface ConversationDetailsModalProps {
  show: boolean;
  onHide: () => void;
  conversation: ConversationDetails | null;
  onTitleUpdated?: (conversationId: string, newTitle: string) => void;
}

export default function ConversationDetailsModal({
  show,
  onHide,
  conversation,
  onTitleUpdated,
}: ConversationDetailsModalProps) {
  const { user } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [titleInput, setTitleInput] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!conversation) return null;

  const participants = conversation.participants || [];
  const permission = participants.find((p) => p.userId._id === user?.id)?.permission;
  const canEditTitle =
    conversation.type !== 'DIRECT' &&
    (Boolean(user?.isAdmin) ||
      (conversation.type === 'GROUP' && permission !== undefined && permission !== 'READ') ||
      (conversation.type === 'CHANNEL' && permission === 'MODERATE'));

  const closeModal = () => {
    setIsEditing(false);
    setError(null);
    onHide();
  };

  const handleSaveTitle = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = titleInput.trim();
    if (!trimmed) {
      setError('Title cannot be empty.');
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      await updateConversationTitle(conversation._id, trimmed);
      onTitleUpdated?.(conversation._id, trimmed);
      setIsEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update title.');
    } finally {
      setIsSaving(false);
    }
  };

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
      onHide={closeModal}
      centered
      contentClassName="border-0 rounded-4 shadow p-3"
    >
      <Modal.Body className="p-2">
        {/* Header row with title and close button */}
        <div className="d-flex align-items-center justify-content-between mb-4">
          <h2 className="h5 fw-bold mb-0 text-dark">Conversation details</h2>
          <button
            type="button"
            onClick={closeModal}
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
          {isEditing ? (
            <form onSubmit={handleSaveTitle} className="mb-1">
              <div className="d-flex align-items-center gap-2">
                <input
                  type="text"
                  className="form-control form-control-sm border-0 shadow-none rounded-3 px-3"
                  style={{ backgroundColor: '#EDF0F5', color: '#1F2937' }}
                  value={titleInput}
                  onChange={(e) => setTitleInput(e.target.value)}
                  maxLength={100}
                  aria-label="Conversation title"
                  disabled={isSaving}
                  autoFocus
                />
                <button
                  type="submit"
                  className="btn btn-sm border-0 fw-semibold text-white rounded-3 px-3"
                  style={{ backgroundColor: '#FF6C2F' }}
                  disabled={isSaving}
                >
                  {isSaving ? 'Saving...' : 'Save'}
                </button>
                <button
                  type="button"
                  className="btn btn-sm border-0 rounded-3"
                  style={{ backgroundColor: '#EDF0F5', color: '#374151' }}
                  onClick={() => {
                    setIsEditing(false);
                    setError(null);
                  }}
                  disabled={isSaving}
                >
                  Cancel
                </button>
              </div>
              {error && (
                <div className="text-danger small mt-1" role="alert">
                  {error}
                </div>
              )}
            </form>
          ) : (
            <div className="d-flex align-items-center gap-2 mb-1">
              <h3 className="h5 fw-bold mb-0 text-dark">
                {conversation.displayName}
              </h3>
              {canEditTitle && (
                <button
                  type="button"
                  onClick={() => {
                    setTitleInput(conversation.title ?? conversation.displayName);
                    setError(null);
                    setIsEditing(true);
                  }}
                  className="btn btn-sm border-0 py-0 px-2 rounded-3"
                  style={{ backgroundColor: '#EDF0F5', color: '#3046C3' }}
                  aria-label="Edit conversation title"
                >
                  Edit
                </button>
              )}
            </div>
          )}
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
              const isCurrent = Boolean(
                user?.id && participant.userId._id === user.id
              );
              const displayName = isCurrent
                ? 'You'
                : participant.userId.firstName;
              const initial = displayName.charAt(0).toUpperCase();

              return (
                <div
                  key={participant.userId._id}
                  className="d-flex align-items-center gap-3"
                >
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
