import { useState, useCallback, useEffect } from 'react';
import Header from '../components/Header';
import Sidebar from '../components/Messaging/Sidebar';
import MessageArea from '../components/Messaging/MessageArea';
import ConversationDetailsModal from '../components/Messaging/ConversationDetailsModal';
import NewChatModal from '../components/Messaging/NewChatModal';
import type { Conversation } from '../types/Messaging/Conversation';
import type { IMessage } from '../types/Messaging/Message';
import {
  fetchConversations,
  fetchConversationDetails,
} from '../api/messagingApi';

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
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoadingConversations, setIsLoadingConversations] = useState<boolean>(true);
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [isModalDisplayed, setIsModalDisplayed] = useState<boolean>(false);
  const [isNewChatModalOpen, setIsNewChatModalOpen] = useState<boolean>(false);

  // Fill in participants for a chat, only if it is still the active one
  const loadDetails = useCallback(async (id: string) => {
    try {
      const details = await fetchConversationDetails(id);
      setActiveConversation((prev) => (prev?._id === id ? { ...prev, ...details } : prev));
    } catch (err) {
      console.error('Failed to load conversation details:', err);
    }
  }, []);

  const handleSelectConversation = (conv: Conversation) => {
    setActiveConversation(conv);
    loadDetails(conv._id);
  };

  useEffect(() => {
    let ignore = false;

    async function loadConversations() {
      try {
        const feed = await fetchConversations();
        if (ignore) return;
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
          loadDetails(feed[0]._id);
        }
      } catch (err) {
        console.error('Error loading conversations:', err);
      } finally {
        if (!ignore) setIsLoadingConversations(false);
      }
    }

    loadConversations();
    return () => {
      ignore = true;
    };
  }, [loadDetails]);

  const handleChatCreated = (newConv: Conversation) => {
    setIsNewChatModalOpen(false);
    setActiveConversation(newConv);

    // Existing DMs are selected by ID; brand-new DMs join the inbox on their first message
    if (newConv.type !== 'GROUP') return;

    setConversations((prev) => upsertConversation(prev, newConv));
    // Pick up the server-generated "created the group" preview
    fetchConversations()
      .then((feed) => {
        const item = feed.find((c) => c._id === newConv._id);
        if (item) setConversations((prev) => upsertConversation(prev, item));
      })
      .catch((err) => console.error('Failed to refresh conversations:', err));
  };

  const handleMessageSent = (conv: Conversation, msg: IMessage) => {
    const sender = conv.participants?.find((p) => p._id === msg.senderId);
    setConversations((prev) =>
      upsertConversation(prev, {
        ...conv,
        lastActivityAt: msg.createdAt,
        lastMessage: {
          text: msg.text,
          senderName: sender ? `${sender.firstName} ${sender.lastName}`.trim() : 'You',
          createdAt: msg.createdAt,
        },
      })
    );
  };

  return (
    <div className="d-flex flex-column" style={{ minHeight: '100vh', height: '100vh', overflow: 'hidden' }}>
      <Header />
      <div className="d-flex flex-grow-1 overflow-hidden">
        <Sidebar
          conversations={conversations}
          isLoading={isLoadingConversations}
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
