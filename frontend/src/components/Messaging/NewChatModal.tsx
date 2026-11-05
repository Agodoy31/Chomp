import { useState, useMemo, useEffect } from 'react';
import Modal from 'react-bootstrap/Modal';
import type {
  Conversation,
  ChatUser,
} from '../../types/Messaging/Conversation';
import { useAuth } from '../../hooks/useAuth';
import { createConversation, fetchUsers } from '../../api/messagingApi';
import SelectedUserTag from './SelectedUserTag';
import PersonListItem from './PersonListItem';

interface NewChatModalProps {
  show: boolean;
  onHide: () => void;
  onChatCreated?: (conversation: Conversation) => void;
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

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<ChatUser[]>([]);
  const [isCreating, setIsCreating] = useState(false);

  // Load users from the server when modal opens
  useEffect(() => {
    if (!show) return;

    async function loadUsers() {
      setIsLoadingUsers(true);
      try {
        const data = await fetchUsers();
        setUsers(data);
      } catch (err) {
        console.error('Failed to load users:', err);
      } finally {
        setIsLoadingUsers(false);
      }
    }

    loadUsers();
  }, [show]);

  // Exclude current logged-in user from selection list
  const availableUsers = useMemo(() => {
    return users.filter((u) => u._id !== currentUserId);
  }, [users, currentUserId]);

  // Filter users by search query
  const filteredUsers = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return availableUsers;
    return availableUsers.filter((u) => {
      const fullName = `${u.firstName} ${u.lastName || ''}`.toLowerCase();
      const email = (u.email || '').toLowerCase();
      return fullName.includes(query) || email.includes(query);
    });
  }, [availableUsers, searchQuery]);

  const handleToggleUser = (targetUser: ChatUser) => {
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
    setSelectedUsers([]);
    onHide();
  };

  const handleCreateChat = async () => {
    if (selectedUsers.length === 0 || isCreating) return;

    setIsCreating(true);

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

      onChatCreated?.(newConversation);
      handleClose();
    } catch (err) {
      console.error('Error creating chat:', err);
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
            onChange={(e) => setSearchQuery(e.target.value)}
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
              <div className="text-secondary small py-2">Loading users...</div>
            ) : filteredUsers.length === 0 ? (
              <div className="text-secondary small py-2">
                {users.length === 0
                  ? 'The server did not respond with users.'
                  : 'No people found'}
              </div>
            ) : (
              filteredUsers.map((u) => {
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
