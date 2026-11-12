import { useState } from 'react';
import Sidebar from '../components/Messaging/Sidebar';

export default function MessagingPage() {
  const [activeConversationId, setActiveConversationId] = useState<
    string | undefined
  >(); // null if user has no converstations

  return (
    <div className="d-flex flex-column vh-100 overflow-hidden">
      <div className="d-flex flex-grow-1 overflow-hidden">
        <Sidebar
          activeConversationId={activeConversationId}
          onSelectConversation={(conv) => setActiveConversationId(conv._id)}
        />
        <div className="flex-grow-1" />
      </div>
    </div>
  );
}
