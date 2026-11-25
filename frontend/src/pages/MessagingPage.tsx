import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Row from 'react-bootstrap/Row';
import Col from 'react-bootstrap/Col';
import Sidebar from '../components/Messaging/Sidebar';
import MessageArea from '../components/Messaging/MessageArea';
import ConversationDetailsModal from '../components/Messaging/ConversationDetailsModal';
import NewChatModal from '../components/Messaging/NewChatModal';
import type {
  ConversationDetails,
  ConversationFeedItem,
} from '../types/Messaging/Conversation';
import type { IMessage } from '../types/Messaging/Message';
import {
  fetchConversations,
  fetchConversationDetails,
} from '../api/messagingApi';
import { useAuth } from '../hooks/useAuth';

const activity = (c: ConversationFeedItem) =>
  c.lastActivityAt ? Date.parse(c.lastActivityAt) : 0;

// Insert or update a feed row, keeping whichever preview is newer; newer rows move to the top
function upsertConversation(
  list: ConversationFeedItem[],
  incoming: ConversationFeedItem
): ConversationFeedItem[] {
  const existing = list.find((c) => c._id === incoming._id);
  if (existing && activity(existing) > activity(incoming)) {
    return list.map((c) => (c._id === incoming._id ? { ...incoming, ...existing } : c));
  }
  return [{ ...existing, ...incoming }, ...list.filter((c) => c._id !== incoming._id)];
}

export default function MessagingPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [conversations, setConversations] = useState<ConversationFeedItem[]>([]);
  const [isLoadingConversations, setIsLoadingConversations] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [activeDetails, setActiveDetails] = useState<ConversationDetails | null>(null);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [detailsReloadKey, setDetailsReloadKey] = useState(0);
  const [isMobileChatOpen, setIsMobileChatOpen] = useState<boolean>(false);
  const [isModalDisplayed, setIsModalDisplayed] = useState<boolean>(false);
  const [isNewChatModalOpen, setIsNewChatModalOpen] = useState<boolean>(false);

  const handleSelectConversation = (conv: ConversationFeedItem) => {
    if (conv.type === 'CHANNEL') {
      if (conv.clubId) {
        navigate(`/clubs/${conv.clubId}?channel=${encodeURIComponent(conv._id)}`);
      }
      return;
    }
    setDetailsError(null);
    if (conv._id === activeConversationId && activeDetails?._id !== conv._id) {
      setDetailsReloadKey((key) => key + 1);
    }
    setActiveConversationId(conv._id);
    setIsMobileChatOpen(true);
  };

  // Load details and participants for whichever conversation is currently active
  useEffect(() => {
    if (!activeConversationId) {
      return;
    }
    if (activeDetails?._id === activeConversationId) {
      return;
    }

    let ignore = false;
    async function fetchDetails() {
      try {
        const details = await fetchConversationDetails(activeConversationId!);
        if (!ignore) {
          setDetailsError(null);
          setActiveDetails(details);
        }
      } catch (err) {
        if (ignore) return;
        console.error('Failed to load conversation details:', err);
        setDetailsError(
          err instanceof Error && err.message
            ? err.message
            : 'Failed to load conversation details'
        );
      }
    }

    fetchDetails();
    return () => {
      ignore = true;
    };
  }, [activeConversationId, activeDetails?._id, reloadKey, detailsReloadKey]);

  useEffect(() => {
    if (loading || !user) return;
    let ignore = false;

    async function loadConversations() {
      setIsLoadingConversations(true);
      setLoadError(null);
      try {
        const feed = await fetchConversations();
        if (ignore) return;
        // Server metadata always wins; only keep strictly newer local previews or unsent local DMs
        setConversations((local) => {
          const merged = feed.map((item) => {
            const row = local.find((c) => c._id === item._id);
            if (row && activity(row) > activity(item)) {
              return {
                ...item,
                lastActivityAt: row.lastActivityAt,
                lastMessage: row.lastMessage,
              };
            }
            return item;
          });
          const localOnly = local.filter(
            (row) => !row.lastMessage && !feed.some((item) => item._id === row._id)
          );
          return [...localOnly, ...merged.sort((a, b) => activity(b) - activity(a))];
        });
        // Only auto-select when the user hasn't already opened a chat
        if (feed.length > 0) {
          setActiveConversationId((prev) => prev ?? feed[0]._id);
        }
      } catch (err) {
        if (ignore) return;
        console.error('Error loading conversations:', err);
        setLoadError(
          err instanceof Error ? err.message : 'Failed to load conversations'
        );
      } finally {
        if (!ignore) setIsLoadingConversations(false);
      }
    }

    loadConversations();
    return () => {
      ignore = true;
    };
  }, [reloadKey, loading, user]);

  const handleChatCreated = (newConv: ConversationDetails) => {
    setIsNewChatModalOpen(false);
    setDetailsError(null);
    setActiveDetails(newConv);
    setActiveConversationId(newConv._id);
    setIsMobileChatOpen(true);
    setConversations((prev) =>
      upsertConversation(prev, {
        _id: newConv._id,
        type: newConv.type,
        displayName: newConv.displayName,
        lastActivityAt: new Date().toISOString(),
        ...(newConv.clubId ? { clubId: newConv.clubId } : {}),
        ...(newConv.clubName ? { clubName: newConv.clubName } : {}),
      })
    );

    if (newConv.type === 'GROUP') {
      // Pick up the server-generated "created the group" preview
      fetchConversations()
        .then((feed) => {
          const item = feed.find((c) => c._id === newConv._id);
          if (item) setConversations((prev) => upsertConversation(prev, item));
        })
        .catch((err) => console.error('Failed to refresh conversations:', err));
    }
  };

  const handleMessageSent = (conv: ConversationDetails, msg: IMessage) => {
    const senderName = msg.sender
      ? `${msg.sender.firstName} ${msg.sender.lastName}`.trim()
      : '';
    setConversations((prev) => {
      const existing = prev.find((c) => c._id === conv._id);
      return upsertConversation(prev, {
        _id: conv._id,
        type: conv.type,
        displayName: existing?.displayName ?? conv.displayName,
        lastActivityAt: msg.createdAt,
        ...(conv.clubId ? { clubId: conv.clubId } : {}),
        ...(conv.clubName ? { clubName: conv.clubName } : {}),
        lastMessage: {
          text: msg.text,
          senderName: senderName || 'You',
          createdAt: msg.createdAt,
        },
      });
    });
  };

  const handleTitleUpdated = (conversationId: string, newTitle: string) => {
    setActiveDetails((prev) =>
      prev?._id === conversationId
        ? { ...prev, displayName: newTitle, title: newTitle }
        : prev
    );
    setConversations((prev) =>
      prev.map((c) =>
        c._id === conversationId ? { ...c, displayName: newTitle } : c
      )
    );
  };

  useEffect(() => {
    if (!loading && !user) {
      navigate('/login');
    }
  }, [loading, user, navigate]);

  if (loading || !user) {
    return null;
  }

  const displayedDetails =
    activeConversationId && activeDetails?._id === activeConversationId
      ? activeDetails
      : null;

  return (
    <div className="d-flex flex-column h-100 overflow-hidden">
      <Row className="g-0 flex-grow-1 h-100 overflow-hidden">
        <Col
          xs={12}
          md={4}
          lg={3}
          className={`${isMobileChatOpen ? 'd-none d-md-flex' : 'd-flex'} h-100 overflow-hidden`}
        >
          <Sidebar
            conversations={conversations}
            isLoading={isLoadingConversations}
            loadError={loadError}
            onRetry={() => setReloadKey((key) => key + 1)}
            onSelectConversation={handleSelectConversation}
            onOpenNewChat={() => setIsNewChatModalOpen(true)}
            activeConversationId={activeConversationId ?? undefined}
          />
        </Col>
        <Col
          xs={12}
          md={8}
          lg={9}
          className={`${isMobileChatOpen ? 'd-flex' : 'd-none d-md-flex'} h-100 overflow-hidden`}
        >
          <MessageArea
            key={activeConversationId ?? 'empty'}
            conversation={displayedDetails}
            isLoadingDetails={Boolean(
              activeConversationId && !displayedDetails && !detailsError
            )}
            detailsError={detailsError}
            onRetryDetails={() => {
              setDetailsError(null);
              setDetailsReloadKey((key) => key + 1);
            }}
            onBackToList={() => setIsMobileChatOpen(false)}
            onOpenDetails={() => setIsModalDisplayed(true)}
            onMessageSent={handleMessageSent}
          />
        </Col>
      </Row>
      <ConversationDetailsModal
        show={isModalDisplayed}
        onHide={() => setIsModalDisplayed(false)}
        conversation={displayedDetails}
        onTitleUpdated={handleTitleUpdated}
      />
      <NewChatModal
        show={isNewChatModalOpen}
        onHide={() => setIsNewChatModalOpen(false)}
        onChatCreated={handleChatCreated}
      />
    </div>
  );
}
