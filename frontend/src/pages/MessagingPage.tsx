import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Sidebar from '../components/Messaging/Sidebar';

export default function MessagingPage() {
  const [searchParams] = useSearchParams();
  // Club info opens a channel at /messaging?conversation=<channel id>.
  const requestedConversationId = searchParams.get('conversation') ?? undefined;
  const [selectedId, setSelectedId] = useState<string | undefined>(requestedConversationId);
  const [appliedRequest, setAppliedRequest] = useState(requestedConversationId);

  if (requestedConversationId !== appliedRequest) {
    setAppliedRequest(requestedConversationId);
    if (requestedConversationId) {
      setSelectedId(requestedConversationId);
    }
  }

  return (
    <div className="d-flex flex-column vh-100 overflow-hidden">
      <div className="d-flex flex-grow-1 overflow-hidden">
        <Sidebar
          activeConversationId={selectedId}
          onSelectConversation={(conv) => setSelectedId(conv._id)}
        />
        <div className="flex-grow-1" />
      </div>
    </div>
  );
}
