import { useState, useRef } from 'react';
import Modal from 'react-bootstrap/Modal';
import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';
import Alert from 'react-bootstrap/Alert';
import Spinner from 'react-bootstrap/Spinner';
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
  const editButtonRef = useRef<HTMLButtonElement>(null);

  if (!conversation) return null;

  const participants = conversation.participants || [];
  const permission = participants.find(
    (p) => p.userId._id === user?.id
  )?.permission;
  const canEditTitle =
    conversation.type === 'GROUP' &&
    permission !== undefined &&
    permission !== 'READ';

  const closeModal = () => {
    if (isSaving) return;
    setIsEditing(false);
    setError(null);
    onHide();
  };

  const exitEditMode = () => {
    setIsEditing(false);
    setError(null);
    requestAnimationFrame(() => editButtonRef.current?.focus());
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
      exitEditMode();
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
      backdrop="static"
      keyboard={!isSaving}
      centered
      aria-labelledby="conversation-details-modal-title"
      contentClassName="border-0 rounded-4 shadow"
    >
      <Modal.Header
        closeButton={!isSaving}
        className="border-0 pb-1 pt-4 px-4"
        closeLabel="Close conversation details modal"
      >
        <Modal.Title
          id="conversation-details-modal-title"
          className="h5 fw-bold text-dark"
        >
          Conversation details
        </Modal.Title>
      </Modal.Header>

      <Modal.Body className="px-4 pt-2 pb-4">
        {/* Conversation name and type */}
        <div className="mb-4">
          {isEditing ? (
            <Form onSubmit={handleSaveTitle} className="mb-1">
              <div className="d-flex align-items-center gap-2">
                <Form.Control
                  type="text"
                  size="sm"
                  className="border-0 shadow-none rounded-3 px-3"
                  style={{ backgroundColor: '#EDF0F5', color: '#1F2937' }}
                  value={titleInput}
                  onChange={(e) => setTitleInput(e.target.value)}
                  maxLength={100}
                  aria-label="Conversation title"
                  disabled={isSaving}
                  autoFocus
                />
                <Button
                  type="submit"
                  size="sm"
                  className="border-0 fw-semibold text-white rounded-3 px-3 d-inline-flex align-items-center gap-1"
                  style={{ backgroundColor: '#FF6C2F' }}
                  disabled={isSaving}
                >
                  {isSaving && (
                    <Spinner animation="border" size="sm" aria-hidden="true" />
                  )}
                  <span>{isSaving ? 'Saving...' : 'Save'}</span>
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="light"
                  className="border-0 rounded-3"
                  style={{ backgroundColor: '#EDF0F5', color: '#374151' }}
                  onClick={exitEditMode}
                  disabled={isSaving}
                >
                  Cancel
                </Button>
              </div>
              {error && (
                <Alert variant="danger" className="py-1 px-2 small mt-2 mb-0">
                  {error}
                </Alert>
              )}
            </Form>
          ) : (
            <div className="d-flex align-items-center gap-2 mb-1">
              <h3 className="h5 fw-bold mb-0 text-dark">
                {conversation.displayName}
              </h3>
              {canEditTitle && (
                <Button
                  ref={editButtonRef}
                  type="button"
                  size="sm"
                  variant="light"
                  onClick={() => {
                    setTitleInput(conversation.title ?? conversation.displayName);
                    setError(null);
                    setIsEditing(true);
                  }}
                  className="border-0 py-0 px-2 rounded-3"
                  style={{ backgroundColor: '#EDF0F5', color: '#3046C3' }}
                  aria-label="Edit conversation title"
                >
                  Edit
                </Button>
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
            <div role="status" className="text-secondary small">
              No participants
            </div>
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
