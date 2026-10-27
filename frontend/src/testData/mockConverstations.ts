// The below is just to be imported temporarily with test data
import { Conversation } from '../types/Messaging/Converstation';
import { Message } from '../types/Messaging/Message';

// User IDs for the mock session
export const CURRENT_USER_ID = 'user-you-123';
export const ALBERTA_USER_ID = 'user-alberta-456';
export const ALBERT_USER_ID = 'user-albert-789';
export const JOHN_USER_ID = 'user-john-101';


export const MOCK_ALBERTA_MESSAGES: Message[] = [
  {
    _id: 'msg-1',
    conversationId: 'conv-1',
    senderId: ALBERTA_USER_ID,
    text: "Rarr I'm a gator",
    isAnnouncement: false,
    isSystem: false,
    createdAt: '2026-10-18T10:02:00.000Z',
  },
  {
    _id: 'msg-2',
    conversationId: 'conv-1',
    senderId: CURRENT_USER_ID,
    text: 'Wow you are so scary!',
    isAnnouncement: false,
    isSystem: false,
    createdAt: '2026-10-18T10:05:00.000Z',
  },
  {
    _id: 'msg-3',
    conversationId: 'conv-1',
    senderId: ALBERTA_USER_ID,
    text: 'Ima eat you over here',
    isAnnouncement: false,
    isSystem: false,
    createdAt: '2026-10-18T10:07:00.000Z',
  },
  {
    _id: 'msg-4',
    conversationId: 'conv-1',
    senderId: CURRENT_USER_ID,
    text: 'No thank you, I rather not.',
    isAnnouncement: false,
    isSystem: false,
    createdAt: '2026-10-18T10:08:00.000Z',
  },
  {
    _id: 'msg-5',
    conversationId: 'conv-1',
    senderId: ALBERTA_USER_ID,
    text: 'Perfect, sounds good!',
    isAnnouncement: false,
    isSystem: false,
    createdAt: '2026-10-18T10:11:00.000Z',
  },
  {
    _id: 'msg-6',
    conversationId: 'conv-1',
    senderId: CURRENT_USER_ID,
    text: 'Awesome!',
    isAnnouncement: false,
    isSystem: false,
    createdAt: '2026-10-18T10:12:00.000Z',
  },
];

// side bar of converstations
export const MOCK_CONVERSATIONS: Conversation[] = [
  {
    _id: 'conv-1',
    type: 'DIRECT',
    displayName: 'Alberta',
    lastActivityAt: '2026-10-18T10:12:00.000Z',
    lastMessage: {
      senderName: 'You',
      text: 'Awesome!',
      createdAt: '2026-10-18T10:12:00.000Z',
    },
    participants: [
      {
        _id: ALBERTA_USER_ID,
        firstName: 'Alberta',
        lastName: 'Gator',
        permission: 'WRITE',
      },
      {
        _id: CURRENT_USER_ID,
        firstName: 'You',
        lastName: '',
        permission: 'WRITE',
      },
    ],
    messages: MOCK_ALBERTA_MESSAGES,
  },
  {
    _id: 'conv-2',
    type: 'CHANNEL',
    displayName: 'UF Open Source Club',
    title: 'general',
    clubId: 'club-ufosc',
    lastActivityAt: '2026-10-18T09:45:00.000Z',
    lastMessage: {
      senderName: 'Albert',
      text: 'Next meeting is...',
      createdAt: '2026-10-18T09:45:00.000Z',
    },
  },
  {
    _id: 'conv-3',
    type: 'DIRECT',
    displayName: 'Albert',
    lastActivityAt: '2026-10-18T09:30:00.000Z',
    lastMessage: {
      senderName: 'Albert',
      text: 'See you at the library!',
      createdAt: '2026-10-18T09:30:00.000Z',
    },
  },
  {
    _id: 'conv-4',
    type: 'CHANNEL',
    displayName: 'Swamphacks',
    title: 'project-ideas',
    clubId: 'club-swamphacks',
    lastActivityAt: '2026-10-18T09:00:00.000Z',
    lastMessage: {
      senderName: 'John',
      text: 'What should we build?',
      createdAt: '2026-10-18T09:00:00.000Z',
    },
  },
  {
    _id: 'conv-5',
    type: 'DIRECT',
    displayName: 'John',
    lastActivityAt: '2026-10-18T08:15:00.000Z',
    lastMessage: {
      senderName: 'John',
      text: 'Are you free later today?',
      createdAt: '2026-10-18T08:15:00.000Z',
    },
  },
];
