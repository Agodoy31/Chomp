import { useState, useEffect } from 'react';
import Modal from 'react-bootstrap/Modal';
import type {
  Conversation,
  ChatUser,
} from '../../types/Messaging/Conversation';
import { useAuth } from '../../hooks/useAuth';
import { createConversation, searchUsers } from '../../api/messagingApi';
import SelectedUserTag from './SelectedUserTag';
import PersonListItem from './PersonListItem';

interface NewChatModalProps {
  show: boolean;
  onHide: () => void;
  onChatCreated: (conversation: Conversation) => void;
}

export default function NewChatModal({
  show,
  onHide,
  onChatCreated,
}: NewChatModalProps) {
  const { user } = useAuth();
  const currentUserId = user?.id || '';

  const [users, setUsers] = useState<ChatUser[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<ChatUser[]>([]);
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
        setSearchError('Failed to search users. Please try again.');
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
    setIsLoadingUsers(nextQuery.trim().length > 0);
  };

  const handleToggleUser = (targetUser: ChatUser) => {
    setCreateError(null);
    setSelectedUsers((prev) => {
      const exists = prev.some((u) => u._id === targetUser._id);
      if (exists) {
        return prev.filter((u) => u._id !== targetUser._id);
      }
      return [...prev, targetUser];
    });
  };

  const handleClose = () => {
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
              title: selectedUsers.map((u) => u.firstName).join(', '),
              participantIds: selectedUsers.map((u) => u._id),
            }
      );

      onChatCreated(newConversation);
      handleClose();
    } catch (err) {
      console.error('Error creating chat:', err);
      setCreateError('Failed to create chat. Please try again.');
    } finally {
      setIsCreating(false);
    }
  };

  const selectedCountText = `${selectedUsers.length} people selected`;

  return (
    <Modal
      show={show}
      onHide={handleClose}
      centered
      contentClassName="border-0 rounded-4 shadow p-3"
    >
      <Modal.Body className="p-2">
        {/* Header row */}
        <div className="d-flex align-items-center justify-content-between mb-3">
          <h2 className="h5 fw-bold mb-0 text-dark">New chat</h2>
          <button
            type="button"
            onClick={handleClose}
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

        {/* Question Subheading */}
        <div className="mb-3">
          <span className="fw-semibold text-dark" style={{ fontSize: '15px' }}>
            Who do you want to make a chat with?
          </span>
        </div>

        {/* Search input with magnifying glass */}
        <div
          className="d-flex align-items-center px-3 py-2 rounded-3 mb-3"
          style={{
            border: '1px solid #E2E8F0',
            backgroundColor: '#FFFFFF',
          }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#94A3B8"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="me-2 flex-shrink-0"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            className="form-control border-0 p-0 shadow-none bg-transparent"
            placeholder="Search by name/email"
            value={searchQuery}
            onChange={handleSearchChange}
            style={{ fontSize: '14px', color: '#1E293B' }}
          />
        </div>

        {/* Selected User Pills */}
        {selectedUsers.length > 0 && (
          <div className="d-flex flex-wrap gap-2 mb-3">
            {selectedUsers.map((u) => (
              <SelectedUserTag
                key={u._id}
                user={u}
                onRemove={() => handleToggleUser(u)}
              />
            ))}
          </div>
        )}

        {/* People Section */}
        <div className="mb-2">
          <span
            className="fw-bold text-dark d-block mb-2"
            style={{ fontSize: '14px' }}
          >
            People
          </span>

          <div
            className="d-flex flex-column gap-1 overflow-y-auto"
            style={{ maxHeight: '240px' }}
          >
            {isLoadingUsers ? (
              <div className="text-secondary small py-2">Searching users...</div>
            ) : searchQuery.trim() === '' ? (
              <div className="text-secondary small py-2">
                Type a name or email to search for people.
              </div>
            ) : searchError ? (
              <div className="text-danger small py-2" role="alert">
                {searchError}
              </div>
            ) : availableUsers.length === 0 ? (
              <div className="text-secondary small py-2">No people found</div>
            ) : (
              availableUsers.map((u) => {
                const isSelected = selectedUsers.some(
                  (sel) => sel._id === u._id
                );
                return (
                  <PersonListItem
                    key={u._id}
                    user={u}
                    isSelected={isSelected}
                    onToggle={() => handleToggleUser(u)}
                  />
                );
              })
            )}
          </div>
        </div>

        {createError && (
          <div className="text-danger small mt-2" role="alert">
            {createError}
          </div>
        )}

        {/* Footer */}
        <div className="d-flex align-items-center justify-content-between pt-3 mt-4 border-top">
          <span className="text-secondary small">{selectedCountText}</span>
          <div className="d-flex align-items-center gap-2">
            <button
              type="button"
              onClick={handleClose}
              className="btn border-0 fw-medium px-3 py-2 rounded-3"
              style={{
                backgroundColor: '#F1F3F5',
                color: '#374151',
                fontSize: '14px',
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCreateChat}
              disabled={selectedUsers.length === 0 || isCreating}
              className="btn border-0 fw-semibold px-3 py-2 rounded-3 text-white"
              style={{
                backgroundColor:
                  selectedUsers.length === 0 ? '#FDA481' : '#FF6C2F',
                fontSize: '14px',
                cursor:
                  selectedUsers.length === 0 || isCreating
                    ? 'not-allowed'
                    : 'pointer',
                transition: 'background-color 0.15s ease',
              }}
            >
              {isCreating ? 'Creating...' : 'Create chat'}
            </button>
          </div>
        </div>
      </Modal.Body>
    </Modal>
  );
}
