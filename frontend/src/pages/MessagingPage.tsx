import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../components/Messaging/Sidebar';
import MessageArea from '../components/Messaging/MessageArea';
import ConversationDetailsModal from '../components/Messaging/ConversationDetailsModal';
import NewChatModal from '../components/Messaging/NewChatModal';
import type { Conversation } from '../types/Messaging/Conversation';
import type { IMessage } from '../types/Messaging/Message';
import {
  fetchConversations,
  fetchConversationDetails,
  fetchMyClubNames,
  isUnauthorizedError,
} from '../api/messagingApi';
import { useAuth } from '../hooks/useAuth';

const activity = (c: Conversation) =>
  c.lastActivityAt ? Date.parse(c.lastActivityAt) : 0;

// Insert or update a row, keeping whichever preview is newer; newer rows move to the top
function upsertConversation(list: Conversation[], incoming: Conversation): Conversation[] {
  const existing = list.find((c) => c._id === incoming._id);
  if (existing && activity(existing) > activity(incoming)) {
    return list.map((c) => (c._id === incoming._id ? { ...incoming, ...existing } : c));
  }
  return [{ ...existing, ...incoming }, ...list.filter((c) => c._id !== incoming._id)];
}

export default function MessagingPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [clubNamesById, setClubNamesById] = useState<Record<string, string>>({});
  const [isLoadingConversations, setIsLoadingConversations] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [isModalDisplayed, setIsModalDisplayed] = useState<boolean>(false);
  const [isNewChatModalOpen, setIsNewChatModalOpen] = useState<boolean>(false);

  const handleSelectConversation = (conv: Conversation) => {
    setActiveConversation(conv);
  };

  // Fill in participants for whichever conversation is currently active
  useEffect(() => {
    const activeId = activeConversation?._id;
    if (!activeId) return;
    if (activeConversation.participants && activeConversation.participants.length > 0) {
      return;
    }

    let ignore = false;
    async function fetchDetails() {
      try {
        const details = await fetchConversationDetails(activeId!);
        if (!ignore) {
          setActiveConversation((prev) =>
            prev?._id === activeId ? { ...prev, ...details } : prev
          );
        }
      } catch (err) {
        if (ignore) return;
        if (isUnauthorizedError(err)) {
          navigate('/login');
          return;
        }
        console.error('Failed to load conversation details:', err);
      }
    }

    fetchDetails();
    return () => {
      ignore = true;
    };
  }, [activeConversation?._id, activeConversation?.participants, reloadKey, navigate]);

  useEffect(() => {
    if (loading || !user) return;
    let ignore = false;

    async function loadConversations() {
      setIsLoadingConversations(true);
      setLoadError(null);
      try {
        const [feed, clubNames] = await Promise.all([
          fetchConversations(),
          fetchMyClubNames().catch(() => ({})),
        ]);
        if (ignore) return;
        setClubNamesById(clubNames);
        // Rows created or updated locally while loading keep their newer previews
        setConversations((local) => {
          const merged = feed.map((item) => {
            const row = local.find((c) => c._id === item._id);
            return row && activity(row) >= activity(item) ? { ...item, ...row } : { ...row, ...item };
          });
          const localOnly = local.filter((row) => !feed.some((item) => item._id === row._id));
          return [...localOnly, ...merged.sort((a, b) => activity(b) - activity(a))];
        });
        // Only auto-select when the user hasn't already opened a chat
        if (feed.length > 0) {
          setActiveConversation((prev) => prev ?? feed[0]);
        }
      } catch (err) {
        if (ignore) return;
        if (isUnauthorizedError(err)) {
          navigate('/login');
          return;
        }
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
  }, [reloadKey, loading, user, navigate]);

  const handleChatCreated = (newConv: Conversation) => {
    setIsNewChatModalOpen(false);
    setActiveConversation(newConv);
    setConversations((prev) => upsertConversation(prev, newConv));

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

  const handleMessageSent = (conv: Conversation, msg: IMessage) => {
    const senderName = msg.sender
      ? `${msg.sender.firstName} ${msg.sender.lastName}`.trim()
      : '';
    setConversations((prev) =>
      upsertConversation(prev, {
        ...conv,
        lastActivityAt: msg.createdAt,
        lastMessage: {
          text: msg.text,
          senderName: senderName || 'You',
          createdAt: msg.createdAt,
        },
      })
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

  return (
    <div className="d-flex flex-column vh-100 overflow-hidden">
      <div className="d-flex flex-grow-1 overflow-hidden">
        <Sidebar
          conversations={conversations}
          clubNamesById={clubNamesById}
          isLoading={isLoadingConversations}
          loadError={loadError}
          onRetry={() => setReloadKey((key) => key + 1)}
          onSelectConversation={handleSelectConversation}
          onOpenNewChat={() => setIsNewChatModalOpen(true)}
          activeConversationId={activeConversation?._id}
        />
        <MessageArea
          key={activeConversation?._id}
          conversation={activeConversation}
          onOpenDetails={() => setIsModalDisplayed(true)}
          onMessageSent={handleMessageSent}
        />
      </div>
      <ConversationDetailsModal
        show={isModalDisplayed}
        onHide={() => setIsModalDisplayed(false)}
        conversation={activeConversation}
      />
      <NewChatModal
        show={isNewChatModalOpen}
        onHide={() => setIsNewChatModalOpen(false)}
        onChatCreated={handleChatCreated}
      />
    </div>
  );
}
