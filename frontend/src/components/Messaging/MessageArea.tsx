import { useState, useEffect, useRef } from 'react';
import { v7 as uuidv7 } from 'uuid';
import Alert from 'react-bootstrap/Alert';
import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';
import InputGroup from 'react-bootstrap/InputGroup';
import Spinner from 'react-bootstrap/Spinner';
import type { ConversationDetails } from '../../types/Messaging/Conversation';
import type { IMessage } from '../../types/Messaging/Message';
import { useAuth } from '../../hooks/useAuth';
import { fetchMessages, postMessage } from '../../api/messagingApi';
import Message from './Message';
import PostAnnouncementModal from '../modals/AnnouncementModal';

// Combine message lists by ID so incoming server messages overwrite older local copies
function mergeMessages(current: IMessage[], incoming: IMessage[]): IMessage[] {
  const byId = new Map([...current, ...incoming].map((m) => [m._id, m]));
  return [...byId.values()].sort(
    (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)
  );
}

interface MessageAreaProps {
  conversation: ConversationDetails | null;
  isLoadingDetails?: boolean;
  detailsError?: string | null;
  onRetryDetails?: () => void;
  onBackToList?: () => void;
  onOpenDetails: () => void;
  onMessageSent: (conversation: ConversationDetails, message: IMessage) => void;
  isOfficer?: (userId: string) => boolean;
}

export default function MessageArea({
  conversation,
  isLoadingDetails = false,
  detailsError = null,
  onRetryDetails,
  onBackToList,
  onOpenDetails,
  onMessageSent,
  isOfficer,
}: MessageAreaProps) {
  const { user } = useAuth();
  const currentUserId = user?.id || '';

  const [messages, setMessages] = useState<IMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState<boolean>(false);
  const [isAnnouncementModalOpen, setIsAnnouncementModalOpen] =
    useState<boolean>(false);
  const [reloadKey, setReloadKey] = useState<number>(0);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const pendingClientIdRef = useRef<string | null>(null);

  const conversationId = conversation?._id;

  // Load messages for the selected conversation, ignoring responses after unmount/switch
  useEffect(() => {
    if (!conversationId) return;
    const currentId = conversationId;
    let ignore = false;

    async function loadMessages() {
      setIsLoading(true);
      setLoadError(null);
      try {
        const data = await fetchMessages(currentId);
        if (!ignore) setMessages((prev) => mergeMessages(prev, data));
      } catch (err) {
        if (ignore) return;
        console.error('Error loading messages:', err);
        setLoadError(
          err instanceof Error && err.message
            ? err.message
            : 'The server did not respond.'
        );
      } finally {
        if (!ignore) setIsLoading(false);
      }
    }

    loadMessages();
    return () => {
      ignore = true;
    };
  }, [conversationId, reloadKey]);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (container && !isLoading && !loadError) {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages.length, isLoading, loadError]);

  if (!conversation) {
    return (
      <section
        aria-label="Message thread"
        className="d-flex flex-column flex-grow-1 h-100 text-muted"
        style={{ backgroundColor: '#F5F6FA', minWidth: 0 }}
      >
        {onBackToList && (isLoadingDetails || detailsError) && (
          <div className="d-md-none d-flex align-items-center px-3 py-2 bg-white border-bottom">
            <Button
              type="button"
              variant="light"
              onClick={onBackToList}
              className="border-0 d-inline-flex align-items-center gap-2 rounded-pill px-3"
              style={{ backgroundColor: '#EDF0F5', color: '#3046C3' }}
              aria-label="Back to conversations"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 20 20"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
                focusable="false"
              >
                <path
                  d="M16 10H4M10 4L4 10L10 16"
                  stroke="#3046C3"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span>Back</span>
            </Button>
          </div>
        )}
        <div className="d-flex flex-grow-1 align-items-center justify-content-center">
          {isLoadingDetails ? (
            <div
              role="status"
              aria-live="polite"
              className="d-flex align-items-center gap-2 px-4"
            >
              <Spinner animation="border" size="sm" aria-hidden="true" />
              <span>Loading conversation...</span>
            </div>
          ) : detailsError ? (
            <Alert variant="danger" className="text-center mx-4 mb-0">
              <div>{detailsError}</div>
              {onRetryDetails && (
                <Button
                  type="button"
                  variant="outline-danger"
                  size="sm"
                  className="mt-2 rounded-pill px-3"
                  onClick={onRetryDetails}
                >
                  Retry
                </Button>
              )}
            </Alert>
          ) : (
            <p role="status" className="mb-0 fs-5">
              Pick a conversation to start chatting
            </p>
          )}
        </div>
      </section>
    );
  }

  const participants = conversation.participants || [];

  // Check client-side permissions strictly from participant membership
  const currentUserParticipant = currentUserId
    ? participants.find((p) => p.userId._id === currentUserId)
    : undefined;

  const areDetailsLoaded = participants.length > 0;
  const canSend =
    areDetailsLoaded &&
    currentUserParticipant !== undefined &&
    currentUserParticipant.permission !== 'READ';
  const hasNoSendPermission = areDetailsLoaded && !canSend;
  const canPostAnnouncement =
    conversation.type === 'CHANNEL' &&
    currentUserParticipant?.permission === 'MODERATE';

  const headerInitial = conversation.displayName.charAt(0).toUpperCase();

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSend || isSending) return;
    if (!inputText.trim()) return;

    const textToSend = inputText.trim();
    const announcementMatch = canPostAnnouncement
      ? textToSend.match(/^@announcements(?:\s+([\s\S]*))?$/i)
      : null;
    if (announcementMatch) {
      // TODO: pass announcementMatch[1]?.trim() ?? '' to PostAnnouncementModal once it accepts initialText
      setInputText('');
      setIsAnnouncementModalOpen(true);
      return;
    }

    pendingClientIdRef.current ??= uuidv7();
    setIsSending(true);
    setSendError(null);

    try {
      const newMsg = await postMessage(
        conversation._id,
        textToSend,
        false,
        pendingClientIdRef.current
      );
      pendingClientIdRef.current = null;
      setMessages((prev) => mergeMessages(prev, [newMsg]));
      setInputText('');
      onMessageSent(conversation, newMsg);
    } catch (err) {
      console.error('Error sending message:', err);
      setSendError(
        err instanceof Error && err.message
          ? err.message
          : 'Failed to send message. Please try again.'
      );
    } finally {
      setIsSending(false);
    }
  };

  const getSenderName = (msg: IMessage): string => {
    return `${msg.sender.firstName} ${msg.sender.lastName}`.trim();
  };

  const isInputDisabled = !canSend || isSending;

  return (
    <section
      aria-label={conversation.displayName}
      className="d-flex flex-column flex-grow-1 h-100"
      style={{ backgroundColor: '#F5F6FA', minWidth: 0 }}
    >
      {/* Chat Header */}
      <header
        className="d-flex align-items-center justify-content-between px-4 py-3 bg-white border-bottom flex-shrink-0"
        style={{ minHeight: '68px' }}
      >
        <div className="d-flex align-items-center gap-3 overflow-hidden">
          {onBackToList && (
            <Button
              type="button"
              variant="light"
              onClick={onBackToList}
              className="d-md-none rounded-circle d-flex align-items-center justify-content-center border-0 p-0 flex-shrink-0"
              style={{
                width: '36px',
                height: '36px',
                backgroundColor: '#EDF0F5',
              }}
              aria-label="Back to conversations"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 20 20"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
                focusable="false"
              >
                <path
                  d="M16 10H4M10 4L4 10L10 16"
                  stroke="#3046C3"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </Button>
          )}
          <div
            aria-hidden="true"
            className="rounded-circle d-flex align-items-center justify-content-center fw-bold flex-shrink-0"
            style={{
              width: '42px',
              height: '42px',
              backgroundColor: '#A7CDDF',
              color: '#3046C3',
              fontSize: '18px',
            }}
          >
            {headerInitial}
          </div>
          <div className="overflow-hidden">
            <h1 className="h5 fw-bold mb-0 text-dark text-truncate">
              {conversation.displayName}
            </h1>
          </div>
        </div>

        {/* Three dots vector icon */}
        <Button
          type="button"
          variant="light"
          onClick={onOpenDetails}
          className="rounded-circle d-flex align-items-center justify-content-center border-0 p-0 flex-shrink-0"
          style={{
            width: '36px',
            height: '36px',
            backgroundColor: '#EDF0F5',
          }}
          aria-label="Conversation details"
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
            focusable="false"
          >
            <path
              d="M12 7C13.1046 7 14 6.10457 14 5C14 3.89543 13.1046 3 12 3C10.8954 3 10 3.89543 10 5C10 6.10457 10.8954 7 12 7Z"
              fill="#3046C3"
            />
            <path
              d="M12 14C13.1046 14 14 13.1046 14 12C14 10.8954 13.1046 10 12 10C10.8954 10 10 10.8954 10 12C10 13.1046 10.8954 14 12 14Z"
              fill="#3046C3"
            />
            <path
              d="M12 21C13.1046 21 14 20.1046 14 19C14 17.8954 13.1046 17 12 17C10.8954 17 10 17.8954 10 19C10 20.1046 10.8954 21 12 21Z"
              fill="#3046C3"
            />
          </svg>
        </Button>
      </header>

      {/* Message History Feed */}
      <div
        ref={messagesContainerRef}
        className="flex-grow-1 overflow-y-auto px-4 py-3"
        style={{ overflowX: 'hidden' }}
        role="log"
        aria-label="Message history"
      >
        {isLoading ? (
          <div
            role="status"
            aria-live="polite"
            className="d-flex align-items-center justify-content-center gap-2 text-muted py-4"
          >
            <Spinner animation="border" size="sm" aria-hidden="true" />
            <span>Loading messages...</span>
          </div>
        ) : loadError ? (
          <Alert variant="danger" className="text-center my-3">
            <div>{loadError}</div>
            <Button
              type="button"
              variant="outline-danger"
              size="sm"
              className="mt-2 rounded-pill px-3"
              onClick={() => setReloadKey((k) => k + 1)}
            >
              Retry
            </Button>
          </Alert>
        ) : messages.length === 0 ? (
          <div role="status" className="text-muted text-center py-4">
            No messages yet
          </div>
        ) : (
          <div className="d-flex flex-column">
            {messages.map((msg) => (
              <Message
                key={msg._id}
                message={msg}
                senderName={getSenderName(msg)}
                isCurrentUser={Boolean(
                  currentUserId && msg.sender?._id === currentUserId
                )}
                officer={Boolean(msg.sender?._id && isOfficer?.(msg.sender._id))}
              />
            ))}
          </div>
        )}
      </div>

      {/* Message Input Bar */}
      <footer
        className="p-3 px-4 flex-shrink-0"
        style={{ backgroundColor: '#F5F6FA' }}
      >
        {sendError && (
          <Alert variant="danger" className="py-2 px-3 small mb-2 text-center">
            {sendError}
          </Alert>
        )}
        {hasNoSendPermission && (
          <div role="status" className="text-muted small text-center mb-2">
            You do not have permission to send messages in this conversation.
          </div>
        )}
        <Form onSubmit={handleSend}>
          <InputGroup
            className="align-items-center rounded-pill px-3 py-1 shadow-sm"
            style={{
              backgroundColor: '#EDF0F5',
              border: '1px solid #E2E8F0',
            }}
          >
            <Form.Control
              type="text"
              className="border-0 bg-transparent shadow-none"
              placeholder={`Message ${conversation.displayName}...`}
              aria-label={`Message ${conversation.displayName}`}
              maxLength={2000}
              value={inputText}
              onChange={(e) => {
                if (isInputDisabled) return;
                pendingClientIdRef.current = null;
                setInputText(e.target.value);
              }}
              disabled={isInputDisabled}
              style={{
                fontSize: '14px',
                color: isInputDisabled ? '#6B7280' : '#1F2937',
                cursor: isInputDisabled ? 'not-allowed' : 'text',
              }}
            />

            {/* Send Arrow Vector Button */}
            <Button
              type="submit"
              disabled={isInputDisabled}
              className="rounded-circle d-flex align-items-center justify-content-center p-0 flex-shrink-0 border-0"
              style={{
                width: '36px',
                height: '36px',
                backgroundColor: !isInputDisabled ? '#3046C3' : '#9CA3AF',
                cursor: !isInputDisabled ? 'pointer' : 'not-allowed',
              }}
              aria-label="Send message"
            >
              {isSending ? (
                <Spinner
                  animation="border"
                  size="sm"
                  variant="light"
                  aria-hidden="true"
                />
              ) : (
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 20 20"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path
                    d="M4 10H16M10 16L16 10L10 4"
                    stroke="white"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </Button>
          </InputGroup>
        </Form>
      </footer>

      {canPostAnnouncement && (
        <PostAnnouncementModal
          show={isAnnouncementModalOpen}
          onHide={() => setIsAnnouncementModalOpen(false)}
          conversationId={conversation._id}
          clubName={conversation.clubName || conversation.displayName}
          onSuccess={(newMsg) => {
            setMessages((prev) => mergeMessages(prev, [newMsg]));
            onMessageSent(conversation, newMsg);
          }}
        />
      )}
    </section>
  );
}
