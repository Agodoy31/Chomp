import type { Conversation } from '../../types/Messaging/Conversation';
import SidebarElement from './SidebarElement';

interface SidebarProps {
  conversations: Conversation[];
  isLoading: boolean;
  loadError: string | null;
  onRetry: () => void;
  onSelectConversation: (conversation: Conversation) => void;
  onOpenNewChat: () => void;
  activeConversationId: string | undefined;
}

export default function Sidebar({
  conversations,
  isLoading,
  loadError,
  onRetry,
  onSelectConversation,
  onOpenNewChat,
  activeConversationId,
}: SidebarProps) {
  return (
    <aside
      className="d-flex flex-column flex-shrink-0 p-3"
      style={{
        backgroundColor: '#FF6C2F',
        width: '320px',
        minWidth: '280px',
        maxWidth: '360px',
        height: '100%',
        overflowY: 'auto',
      }}
    >
      <div className="d-flex align-items-center justify-content-between mb-3 px-1">
        <h2
          className="text-white fw-bold mb-0"
          style={{ fontSize: '1.5rem', letterSpacing: '0.01em' }}
        >
          Messages
        </h2>
        <button
          type="button"
          onClick={onOpenNewChat}
          className="btn rounded-circle d-flex align-items-center justify-content-center p-0"
          style={{
            width: '32px',
            height: '32px',
            backgroundColor: 'rgba(255, 255, 255, 0.25)',
            border: 'none',
            cursor: 'pointer',
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
          >
            <path
              d="M9 3.75V14.25M3.75 9H14.25"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      <div className="d-flex flex-column gap-3">
        {isLoading ? (
          <div
            role="status"
            aria-live="polite"
            className="text-white text-center py-3"
          >
            Loading...
          </div>
        ) : loadError ? (
          <div role="alert" className="text-white text-center py-3">
            <div>{loadError}</div>
            <button
              type="button"
              className="btn btn-light btn-sm mt-2"
              onClick={onRetry}
            >
              Retry
            </button>
          </div>
        ) : conversations.length === 0 ? (
          <div role="status" className="text-white text-center py-3">
            No conversations yet
          </div>
        ) : (
          conversations.map((conv) => (
            <SidebarElement
              key={conv._id}
              conversation={conv}
              isActive={conv._id === activeConversationId}
              onSelect={onSelectConversation}
            />
          ))
        )}
      </div>
    </aside>
  );
}
