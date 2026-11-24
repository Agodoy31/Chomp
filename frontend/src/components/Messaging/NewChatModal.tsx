import { useState, useEffect } from 'react';
import Modal from 'react-bootstrap/Modal';
import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';
import InputGroup from 'react-bootstrap/InputGroup';
import ListGroup from 'react-bootstrap/ListGroup';
import Alert from 'react-bootstrap/Alert';
import Spinner from 'react-bootstrap/Spinner';
import type {
  ConversationDetails,
  UserSummary,
} from '../../types/Messaging/Conversation';
import { useAuth } from '../../hooks/useAuth';
import { createConversation, searchUsers } from '../../api/messagingApi';
import SelectedUserTag from './SelectedUserTag';
import PersonListItem from './PersonListItem';

interface NewChatModalProps {
  show: boolean;
  onHide: () => void;
  onChatCreated: (conversation: ConversationDetails) => void;
}

const SEARCH_ERROR_MESSAGES: Record<string, string> = {
  ERR_SEARCH_REQUIRED: 'Enter a name or email to search.',
  ERR_SEARCH_TOO_LONG: 'Search query must be 100 characters or fewer.',
  ERR_SEARCH_INVALID_CHARACTERS:
    "Search can only include letters, numbers, spaces, and . _ - @ '",
  ERR_SERVER_ERROR: 'Server error while searching users. Please try again.',
};

function formatSearchError(err: unknown): string {
  if (err instanceof Error && err.message) {
    return SEARCH_ERROR_MESSAGES[err.message] ?? err.message;
  }
  return 'Failed to search users. Please try again.';
}

function buildSafeGroupTitle(users: UserSummary[]): string {
  const sanitized = users
    .map((u) => u.firstName.replace(/[^a-zA-Z0-9 ._\-+&/'!?:,#]/g, '').trim())
    .filter(Boolean)
    .join(', ');

  if (!sanitized) return 'Group Chat';
  return sanitized.length > 100 ? `${sanitized.slice(0, 97)}...` : sanitized;
}

export default function NewChatModal({
  show,
  onHide,
  onChatCreated,
}: NewChatModalProps) {
  const { user } = useAuth();
  const currentUserId = user?.id || '';

  const [users, setUsers] = useState<UserSummary[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<UserSummary[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Debounced people search; the input handler resets results, loading, and error state
  useEffect(() => {
    const query = searchQuery.trim();
    if (!show || !query) return;

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const data = await searchUsers(query, controller.signal);
        if (!controller.signal.aborted) setUsers(data);
      } catch (err) {
        if (controller.signal.aborted) return;
        console.error('Failed to search users:', err);
        setSearchError(formatSearchError(err));
      } finally {
        if (!controller.signal.aborted) setIsLoadingUsers(false);
      }
    }, 250);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [searchQuery, show]);

  // Exclude current logged-in user from selection list
  const availableUsers = users.filter((u) => u._id !== currentUserId);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextQuery = e.target.value;
    setSearchQuery(nextQuery);
    setUsers([]);
    setSearchError(null);
    setIsLoadingUsers(Boolean(nextQuery.trim()));
  };

  const handleToggleUser = (targetUser: UserSummary) => {
    setSelectedUsers((prev) => {
      const exists = prev.some((u) => u._id === targetUser._id);
      if (exists) {
        return prev.filter((u) => u._id !== targetUser._id);
      }
      return [...prev, targetUser];
    });
  };

  const handleClose = () => {
    if (isCreating) return;
    setSearchQuery('');
    setUsers([]);
    setSelectedUsers([]);
    setIsLoadingUsers(false);
    setSearchError(null);
    setCreateError(null);
    onHide();
  };

  const handleCreateChat = async () => {
    if (selectedUsers.length === 0 || isCreating) return;

    setIsCreating(true);
    setCreateError(null);

    try {
      const isDirect = selectedUsers.length === 1;
      const newConversation = await createConversation(
        isDirect
          ? {
              type: 'DIRECT',
              recipientId: selectedUsers[0]._id,
            }
          : {
              type: 'GROUP',
              title: buildSafeGroupTitle(selectedUsers),
              participantIds: selectedUsers.map((u) => u._id),
            }
      );

      onChatCreated(newConversation);
      setSearchQuery('');
      setUsers([]);
      setSelectedUsers([]);
      setIsLoadingUsers(false);
      setSearchError(null);
      setCreateError(null);
      onHide();
    } catch (err) {
      console.error('Error creating chat:', err);
      setCreateError(
        err instanceof Error && err.message
          ? err.message
          : 'Failed to create chat. Please try again.'
      );
    } finally {
      setIsCreating(false);
    }
  };

  const selectedCountText = `${selectedUsers.length} ${
    selectedUsers.length === 1 ? 'person' : 'people'
  } selected`;

  return (
    <Modal
      show={show}
      onHide={handleClose}
      backdrop="static"
      keyboard={!isCreating}
      centered
      aria-labelledby="new-chat-modal-title"
      contentClassName="border-0 rounded-4 shadow"
    >
      <Modal.Header
        closeButton={!isCreating}
        className="border-0 pb-1 pt-4 px-4"
        closeLabel="Close new chat modal"
      >
        <Modal.Title id="new-chat-modal-title" className="h5 fw-bold text-dark">
          New chat
        </Modal.Title>
      </Modal.Header>

      <Modal.Body className="px-4 pt-2 pb-3">
        {/* Search Input */}
        <InputGroup
          className="rounded-3 mb-3 overflow-hidden"
          style={{ backgroundColor: '#EDF0F5' }}
        >
          <InputGroup.Text className="bg-transparent border-0 pe-1">
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
              focusable="false"
            >
              <path
                d="M7.33333 12.6667C10.2789 12.6667 12.6667 10.2789 12.6667 7.33333C12.6667 4.38781 10.2789 2 7.33333 2C4.38781 2 2 4.38781 2 7.33333C2 10.2789 4.38781 12.6667 7.33333 12.6667Z"
                stroke="#6B7280"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M14 14L11.1 11.1"
                stroke="#6B7280"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </InputGroup.Text>
          <Form.Control
            type="text"
            className="border-0 bg-transparent shadow-none"
            placeholder="Search by name/email"
            aria-label="Search by name or email"
            value={searchQuery}
            onChange={handleSearchChange}
            disabled={isCreating}
            style={{ fontSize: '14px', color: '#1F2937' }}
          />
        </InputGroup>

        {/* Selected User Tags */}
        {selectedUsers.length > 0 && (
          <div className="d-flex flex-wrap gap-2 mb-3">
            {selectedUsers.map((selected) => (
              <SelectedUserTag
                key={selected._id}
                user={selected}
                disabled={isCreating}
                onRemove={() => handleToggleUser(selected)}
              />
            ))}
          </div>
        )}

        {/* People List */}
        <div>
          <h3 className="fw-bold mb-2 text-dark" style={{ fontSize: '15px' }}>
            People
          </h3>

          <div
            className="overflow-y-auto"
            style={{ maxHeight: '240px' }}
          >
            {isLoadingUsers ? (
              <div
                role="status"
                aria-live="polite"
                className="d-flex align-items-center gap-2 text-secondary small py-2"
              >
                <Spinner animation="border" size="sm" aria-hidden="true" />
                <span>Searching people...</span>
              </div>
            ) : searchError ? (
              <Alert variant="danger" className="py-2 px-3 small mb-0">
                {searchError}
              </Alert>
            ) : !searchQuery.trim() ? (
              <div role="status" className="text-secondary small py-2">
                Type a name or email to search for people.
              </div>
            ) : availableUsers.length === 0 ? (
              <div role="status" className="text-secondary small py-2">
                No people found
              </div>
            ) : (
              <ListGroup variant="flush" className="gap-1">
                {availableUsers.map((u) => {
                  const isSelected = selectedUsers.some(
                    (sel) => sel._id === u._id
                  );
                  return (
                    <PersonListItem
                      key={u._id}
                      user={u}
                      isSelected={isSelected}
                      disabled={isCreating}
                      onToggle={() => handleToggleUser(u)}
                    />
                  );
                })}
              </ListGroup>
            )}
          </div>
        </div>

        {createError && (
          <Alert variant="danger" className="py-2 px-3 small mt-3 mb-0">
            {createError}
          </Alert>
        )}
      </Modal.Body>

      <Modal.Footer className="d-flex align-items-center justify-content-between border-top px-4 py-3">
        <span className="text-secondary small">{selectedCountText}</span>
        <div className="d-flex align-items-center gap-2">
          <Button
            type="button"
            variant="light"
            onClick={handleClose}
            disabled={isCreating}
            className="border-0 fw-medium px-3 py-2 rounded-3"
            style={{
              backgroundColor: '#F1F3F5',
              color: '#374151',
              fontSize: '14px',
            }}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleCreateChat}
            disabled={selectedUsers.length === 0 || isCreating}
            className="border-0 fw-semibold px-3 py-2 rounded-3 text-white d-inline-flex align-items-center gap-2"
            style={{
              backgroundColor:
                selectedUsers.length === 0 || isCreating ? '#FDA481' : '#FF6C2F',
              fontSize: '14px',
            }}
          >
            {isCreating && (
              <Spinner animation="border" size="sm" aria-hidden="true" />
            )}
            <span>{isCreating ? 'Creating...' : 'Create chat'}</span>
          </Button>
        </div>
      </Modal.Footer>
    </Modal>
  );
}
