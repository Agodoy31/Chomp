import Header from '../components/Header';
import Sidebar from '../components/Messaging/Sidebar';

export default function MessagingPage() {
  return (
    <div className="d-flex flex-column vh-100 overflow-hidden"><Header /><div className="d-flex flex-grow-1 overflow-hidden"><Sidebar /><div className="flex-grow-1" /></div></div>
  );
}
