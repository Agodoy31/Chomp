import Alert from 'react-bootstrap/Alert';
import Button from 'react-bootstrap/Button';
import Spinner from 'react-bootstrap/Spinner';
import type { ConversationFeedItem } from '../../types/Messaging/Conversation';
import SidebarElement from './SidebarElement';

interface SidebarProps {
  conversations: ConversationFeedItem[];
  clubNamesById?: Record<string, string>;
  isLoading: boolean;
  loadError: string | null;
  onRetry: () => void;
  onSelectConversation: (conversation: ConversationFeedItem) => void;
  onOpenNewChat: () => void;
  activeConversationId: string | undefined;
}

export default function Sidebar({
  conversations,
  clubNamesById,
  isLoading,
  loadError,
  onRetry,
  onSelectConversation,
  onOpenNewChat,
  activeConversationId,
}: SidebarProps) {
  return (
    <aside
      aria-label="Conversations"
      className="d-flex flex-column w-100 h-100 p-3 overflow-y-auto"
      style={{ backgroundColor: '#FF6C2F' }}
    >
      <div className="d-flex align-items-center justify-content-between mb-3 px-1">
        <h2
          className="text-white fw-bold mb-0"
          style={{ fontSize: '1.5rem', letterSpacing: '0.01em' }}
        >
          Messages
        </h2>
        <Button
          type="button"
          onClick={onOpenNewChat}
          className="rounded-circle d-flex align-items-center justify-content-center p-0 border-0"
          style={{
            width: '32px',
            height: '32px',
            backgroundColor: 'rgba(255, 255, 255, 0.25)',
            transition: 'background-color 0.15s ease',
          }}
          aria-label="New chat"
          title="New chat"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 18 18"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
            focusable="false"
          >
            <path
              d="M9 3.75V14.25M3.75 9H14.25"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </Button>
      </div>

      <div className="d-flex flex-column gap-3">
        {isLoading ? (
          <div
            role="status"
            aria-live="polite"
            className="d-flex align-items-center justify-content-center gap-2 text-white py-3"
          >
            <Spinner
              animation="border"
              size="sm"
              variant="light"
              aria-hidden="true"
            />
            <span>Loading...</span>
          </div>
        ) : loadError ? (
          <Alert variant="danger" className="text-center mb-0">
            <div>{loadError}</div>
            <Button
              type="button"
              variant="light"
              size="sm"
              className="mt-2"
              onClick={onRetry}
            >
              Retry
            </Button>
          </Alert>
        ) : conversations.length === 0 ? (
          <div role="status" className="text-white text-center py-3">
            No conversations yet
          </div>
        ) : (
          conversations.map((conv) => (
            <SidebarElement
              key={conv._id}
              conversation={conv}
              clubName={conv.clubId ? clubNamesById?.[conv.clubId] : undefined}
              isActive={conv._id === activeConversationId}
              onSelect={onSelectConversation}
            />
          ))
        )}
      </div>
    </aside>
  );
}
