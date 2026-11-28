import { useState, useEffect, useRef, useCallback } from 'react';
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
import {
  applyConversationRenamedToDetails,
  applyConversationRenamedToFeed,
  applyCreatedMessageToFeed,
  applyDeletedMessageToFeed,
  applyParticipantAddedToDetails,
  applyParticipantRemovedToDetails,
  connectMessagingSocket,
  disconnectMessagingSocket,
  retryConversationRoom,
  subscribeMessagingEvents,
  syncConversationRooms,
  upsertConversationFeed,
} from '../api/messagingSocket';
import { useAuth } from '../hooks/useAuth';

const activity = (c: ConversationFeedItem) =>
  c.lastActivityAt ? Date.parse(c.lastActivityAt) : 0;

function isAccessLostError(err: unknown): boolean {
  const status =
    typeof err === 'object' && err !== null && 'status' in err
      ? (err as { status?: number }).status
      : undefined;
  return status === 403 || status === 404;
}

type FeedUpdater = (list: ConversationFeedItem[]) => ConversationFeedItem[];
type DetailsUpdater = (
  details: ConversationDetails | null
) => ConversationDetails | null;

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
  const activeConversationIdRef = useRef<string | null>(activeConversationId);
  const mutationSeqRef = useRef(0);
  const feedInFlightCountRef = useRef(0);
  const feedEventsDuringFetchRef = useRef<
    Array<{ seq: number; apply: FeedUpdater }>
  >([]);
  const detailsInFlightCountRef = useRef(0);
  const detailsEventsDuringFetchRef = useRef<
    Array<{ seq: number; apply: DetailsUpdater }>
  >([]);
  const userId = user?.id;

  const applyLiveFeedUpdate = useCallback((updater: FeedUpdater) => {
    if (feedInFlightCountRef.current > 0) {
      feedEventsDuringFetchRef.current.push({
        seq: ++mutationSeqRef.current,
        apply: updater,
      });
    }
    setConversations(updater);
  }, []);

  const applyLiveDetailsUpdate = useCallback((updater: DetailsUpdater) => {
    if (detailsInFlightCountRef.current > 0) {
      detailsEventsDuringFetchRef.current.push({
        seq: ++mutationSeqRef.current,
        apply: updater,
      });
    }
    setActiveDetails(updater);
  }, []);

  const clearRemovedConversation = useCallback(
    (conversationId: string) => {
      applyLiveFeedUpdate((prev) =>
        prev.filter((c) => c._id !== conversationId)
      );
      if (activeConversationIdRef.current === conversationId) {
        setActiveConversationId(null);
        setActiveDetails(null);
        setDetailsError(null);
        setIsModalDisplayed(false);
        setIsMobileChatOpen(false);
      }
    },
    [applyLiveFeedUpdate]
  );

  useEffect(() => {
    activeConversationIdRef.current = activeConversationId;
  }, [activeConversationId]);

  useEffect(() => {
    if (loading || !userId) return;

    connectMessagingSocket();
    const unsubscribe = subscribeMessagingEvents({
      onMessageCreated: (msg) =>
        applyLiveFeedUpdate((prev) => applyCreatedMessageToFeed(prev, msg)),
      onMessageDeleted: (msg) =>
        applyLiveFeedUpdate((prev) => applyDeletedMessageToFeed(prev, msg)),
      onConversationRenamed: ({ conversationId, title }) => {
        applyLiveDetailsUpdate((prev) =>
          applyConversationRenamedToDetails(prev, conversationId, title)
        );
        applyLiveFeedUpdate((prev) =>
          applyConversationRenamedToFeed(prev, conversationId, title)
        );
      },
      onParticipantAdded: (payload) =>
        applyLiveDetailsUpdate((prev) =>
          applyParticipantAddedToDetails(prev, payload)
        ),
      onParticipantRemoved: (payload) =>
        applyLiveDetailsUpdate((prev) =>
          applyParticipantRemovedToDetails(prev, payload)
        ),
      onConversationAdded: ({ conversation }) =>
        applyLiveFeedUpdate((prev) =>
          upsertConversationFeed(prev, conversation)
        ),
      onConversationRemoved: ({ conversationId }) => {
        clearRemovedConversation(conversationId);
      },
      onRoomAccessDenied: (conversationId) => {
        clearRemovedConversation(conversationId);
      },
      onReconnect: () => {
        setReloadKey((key) => key + 1);
        const currentActiveId = activeConversationIdRef.current;
        if (currentActiveId) {
          const startSeq = mutationSeqRef.current;
          detailsInFlightCountRef.current += 1;
          fetchConversationDetails(currentActiveId)
            .then((details) => {
              if (activeConversationIdRef.current === currentActiveId) {
                const pending = detailsEventsDuringFetchRef.current.filter(
                  (e) => e.seq > startSeq
                );
                const reconciled = pending.reduce<ConversationDetails | null>(
                  (acc, event) => event.apply(acc),
                  details
                );
                setActiveDetails(reconciled);
                setDetailsError(null);
              }
            })
            .catch((err) => {
              if (isAccessLostError(err)) {
                clearRemovedConversation(currentActiveId);
                return;
              }
              console.error('Failed to resync conversation details:', err);
            })
            .finally(() => {
              detailsInFlightCountRef.current -= 1;
              if (detailsInFlightCountRef.current === 0) {
                detailsEventsDuringFetchRef.current = [];
              }
            });
        }
      },
    });

    return () => {
      unsubscribe();
      disconnectMessagingSocket();
    };
  }, [
    loading,
    userId,
    applyLiveFeedUpdate,
    applyLiveDetailsUpdate,
    clearRemovedConversation,
  ]);

  useEffect(() => {
    if (loading || !userId) return;
    syncConversationRooms(
      conversations.map((c) => c._id),
      activeConversationId
    );
  }, [loading, userId, conversations, activeConversationId]);

  const handleSelectConversation = (conv: ConversationFeedItem) => {
    setDetailsError(null);
    if (conv._id === activeConversationId && activeDetails?._id !== conv._id) {
      setDetailsReloadKey((key) => key + 1);
    }
    retryConversationRoom(conv._id);
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

    const currentId = activeConversationId;
    let ignore = false;
    async function fetchDetails() {
      const startSeq = mutationSeqRef.current;
      detailsInFlightCountRef.current += 1;
      try {
        const details = await fetchConversationDetails(currentId);
        if (!ignore) {
          const pending = detailsEventsDuringFetchRef.current.filter(
            (e) => e.seq > startSeq
          );
          const reconciled = pending.reduce<ConversationDetails | null>(
            (acc, event) => event.apply(acc),
            details
          );
          setDetailsError(null);
          setActiveDetails(reconciled);
        }
      } catch (err) {
        if (ignore) return;
        if (isAccessLostError(err)) {
          clearRemovedConversation(currentId);
          return;
        }
        console.error('Failed to load conversation details:', err);
        setDetailsError(
          err instanceof Error && err.message
            ? err.message
            : 'Failed to load conversation details'
        );
      } finally {
        detailsInFlightCountRef.current -= 1;
        if (detailsInFlightCountRef.current === 0) {
          detailsEventsDuringFetchRef.current = [];
        }
      }
    }

    fetchDetails();
    return () => {
      ignore = true;
    };
  }, [
    activeConversationId,
    activeDetails?._id,
    reloadKey,
    detailsReloadKey,
    clearRemovedConversation,
  ]);

  useEffect(() => {
    if (loading || !user) return;
    let ignore = false;

    async function loadConversations() {
      const startSeq = mutationSeqRef.current;
      feedInFlightCountRef.current += 1;
      setIsLoadingConversations(true);
      setLoadError(null);
      try {
        const feed = await fetchConversations();
        if (ignore) return;
        const pendingEvents = feedEventsDuringFetchRef.current.filter(
          (e) => e.seq > startSeq
        );
        // Server metadata wins for older state; replay any live socket events that arrived in flight
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
          const baseList = [
            ...localOnly,
            ...merged.sort((a, b) => activity(b) - activity(a)),
          ];
          return pendingEvents.reduce(
            (acc, event) => event.apply(acc),
            baseList
          );
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
        feedInFlightCountRef.current -= 1;
        if (feedInFlightCountRef.current === 0) {
          feedEventsDuringFetchRef.current = [];
        }
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
    applyLiveFeedUpdate((prev) =>
      upsertConversationFeed(prev, {
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
          if (item) {
            applyLiveFeedUpdate((prev) => upsertConversationFeed(prev, item));
          }
        })
        .catch((err) => console.error('Failed to refresh conversations:', err));
    }
  };

  const handleMessageSent = (conv: ConversationDetails, msg: IMessage) => {
    const senderName = msg.sender
      ? `${msg.sender.firstName} ${msg.sender.lastName}`.trim()
      : '';
    applyLiveFeedUpdate((prev) => {
      const existing = prev.find((c) => c._id === conv._id);
      return upsertConversationFeed(prev, {
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
          messageId: msg._id,
        },
      });
    });
  };

  const handleTitleUpdated = (conversationId: string, newTitle: string) => {
    applyLiveDetailsUpdate((prev) =>
      applyConversationRenamedToDetails(prev, conversationId, newTitle)
    );
    applyLiveFeedUpdate((prev) =>
      applyConversationRenamedToFeed(prev, conversationId, newTitle)
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
