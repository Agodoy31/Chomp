import { useState } from 'react';
import Header from '../components/Header';
import Sidebar from '../components/Messaging/Sidebar';
import MessageArea from '../components/Messaging/MessageArea';
import ConverstationDetailsModel from '../components/Messaging/ConverstationDetailsModel';

export default function MessagingPage() {
  const [isModalDisplayed] = useState<boolean>(false);

  return (
    <div className="d-flex flex-column" style={{ minHeight: '100vh', height: '100vh', overflow: 'hidden' }}>
      <Header />
      <div className="d-flex flex-grow-1 overflow-hidden">
        <Sidebar />
        <MessageArea />
      </div>
      {isModalDisplayed && <ConverstationDetailsModel />}
    </div>
  );
}
