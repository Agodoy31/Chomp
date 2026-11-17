import mongoose, { type ClientSession, type Types } from 'mongoose';
import { ConversationType, type IConversation } from '../../messaging/interfaces/conversation.interfaces';
import { MessagingError, MessagingErrorCode } from '../../messaging/errors/messagingError';
import { Conversation } from '../../messaging/models/Conversation';
import { ConversationParticipant, ParticipantPermission } from '../../messaging/models/ConversationParticipant';
import { Message } from '../../messaging/models/Message';
import {
  addParticipantsToConversation,
  createChannel,
  getClubChannels,
  updateConversationTitle,
  updateParticipantPermissions,
  type PermissionUpdate,
} from '../../messaging/services/conversation.service';
import { messagingPublisher } from '../../messaging/sockets/messagingPublisher';
import { CONVERSATION_TITLE_REGEX } from '../../messaging/validators/conversation.validator';
import { User } from '../../user/models/User';
import { type ClientError } from '../interfaces/clubs.interface';
import {
  channelNotFound,
  channelTitleExists,
  clubNotFound,
  invalidChannelTitle,
  isDuplicateKey,
  lastChannel,
} from '../errors';
import { Club } from '../model/clubModel';
import { Membership } from '../model/membershipModel';

const GENERAL_CHANNEL_TITLE = 'General';

const CHANNEL_PERMISSION_BY_ROLE: Record<Membership['role'], ParticipantPermission> = {
  OFFICER: ParticipantPermission.MODERATE,
  MEMBER: ParticipantPermission.WRITE,
};

type MembershipBody = {
  _id: string;
  userId: string;
  clubId: string;
  role: Membership['role'];
  status: Membership['status'];
};

type CommittedDeparture = {
  membership: MembershipBody;
  channelIds: readonly string[];
};

function membershipBody(membership: {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  clubId: Types.ObjectId;
  role: Membership['role'];
  status: Membership['status'];
}): MembershipBody {
  return {
    _id: membership._id.toString(),
    userId: membership.userId.toString(),
    clubId: membership.clubId.toString(),
    role: membership.role,
    status: membership.status,
  };
}

export async function createGeneralChannel(
  clubId: Types.ObjectId,
  proposerId: Types.ObjectId,
  session: ClientSession
): Promise<IConversation> {
  const channel = await createChannel(clubId, GENERAL_CHANNEL_TITLE, [proposerId], session);
  await updateParticipantPermissions(
    channel._id,
    undefined,
    [proposerId, CHANNEL_PERMISSION_BY_ROLE.OFFICER],
    session
  );
  return channel;
}

export async function addMemberToClubChannels(
  clubId: Types.ObjectId,
  userId: Types.ObjectId,
  session: ClientSession
): Promise<void> {
  const channels = await getClubChannels(clubId);
  // Operations in a transaction have to run one at a time.
  for (const channel of channels) {
    await addParticipantsToConversation(channel._id, [userId], session);
  }
}

export async function syncMemberChannelPermission(
  clubId: Types.ObjectId,
  userId: Types.ObjectId,
  role: Membership['role'],
  session: ClientSession
): Promise<void> {
  const permission = CHANNEL_PERMISSION_BY_ROLE[role];
  const channels = await getClubChannels(clubId);

  for (const channel of channels) {
    const seat = await ConversationParticipant.findOne({ conversationId: channel._id, userId })
      .select('permission')
      .session(session)
      .lean()
      .exec();
    if (!seat || seat.permission === permission) {
      continue;
    }

    await updateParticipantPermissions(channel._id, undefined, [userId, permission], session);
  }
}

export async function commitMemberRole(input: {
  membershipId: Types.ObjectId;
  role: Membership['role'];
}): Promise<MembershipBody | null> {
  const session = await mongoose.startSession();
  try {
    return await session.withTransaction(async () => {
      const current = await Membership.findOne({ _id: input.membershipId, status: 'ACTIVE' }).session(session);
      if (!current) {
        return null;
      }
      current.role = input.role;
      await current.save({ session });
      await syncMemberChannelPermission(current.clubId, current.userId, input.role, session);
      return membershipBody(current);
    });
  } finally {
    await session.endSession();
  }
}

export async function commitMemberDeparture(input: {
  membershipId: Types.ObjectId;
  status: 'INACTIVE' | 'REMOVED';
}): Promise<MembershipBody | null> {
  const session = await mongoose.startSession();
  try {
    const committed = await session.withTransaction(async () => {
      const current = await Membership.findOne({ _id: input.membershipId, status: 'ACTIVE' }).session(session);
      if (!current) {
        return null;
      }
      current.status = input.status;
      await current.save({ session });
      const channelIds = await deleteMemberChannelSeats(current.clubId, current.userId, session);
      const departure: CommittedDeparture = {
        membership: membershipBody(current),
        channelIds,
      };
      return departure;
    });
    if (!committed) {
      return null;
    }
    // chat:join_room admits any committed seat, so this runs only after the delete is visible.
    for (const channelId of committed.channelIds) {
      messagingPublisher.evictUserFromConversation(channelId, committed.membership.userId);
    }
    return committed.membership;
  } finally {
    await session.endSession();
  }
}

async function deleteMemberChannelSeats(
  clubId: Types.ObjectId,
  userId: Types.ObjectId,
  session: ClientSession
): Promise<readonly string[]> {
  const channels = await getClubChannels(clubId);
  const channelIds: string[] = [];
  // Operations in a transaction have to run one at a time.
  for (const channel of channels) {
    await ConversationParticipant.deleteOne({ conversationId: channel._id, userId }, { session });
    channelIds.push(channel._id.toString());
  }
  return channelIds;
}

type ChannelBody = { _id: string; title: string };

export type ChannelCommandResult = { channel: ChannelBody } | { error: ClientError };

class ChannelCommandError extends Error {
  constructor(readonly clientError: ClientError) {
    super(clientError.message);
    this.name = 'ChannelCommandError';
  }
}

function readableTitle(title: string): string | null {
  const trimmed = title.trim();
  if (trimmed.length < 1 || trimmed.length > 100 || !CONVERSATION_TITLE_REGEX.test(trimmed)) {
    return null;
  }
  return trimmed;
}

function ruledChannelError(error: unknown): ClientError | null {
  return error instanceof ChannelCommandError ? error.clientError : null;
}

function channelWriteError(error: unknown): ClientError | null {
  if (isDuplicateKey(error) || (error instanceof MessagingError && error.code === MessagingErrorCode.CHANNEL_TITLE_EXISTS)) {
    return channelTitleExists();
  }
  if (error instanceof MessagingError && error.code === MessagingErrorCode.CLUB_NOT_FOUND) {
    return clubNotFound();
  }
  if (
    error instanceof MessagingError &&
    (error.code === MessagingErrorCode.TITLE_REQUIRED ||
      error.code === MessagingErrorCode.VALIDATION_FAILED ||
      error.code === MessagingErrorCode.INVALID_INPUT)
  ) {
    return invalidChannelTitle();
  }
  return null;
}

function titleTaken(clubId: Types.ObjectId, title: string, session?: ClientSession, exceptChannelId?: Types.ObjectId) {
  const query = Conversation.exists({
    clubId,
    type: ConversationType.CHANNEL,
    title,
    ...(exceptChannelId ? { _id: { $ne: exceptChannelId } } : {}),
  }).collation({ locale: 'en', strength: 2 });
  if (session) {
    query.session(session);
  }
  return query;
}

async function activeChannelRoster(clubId: Types.ObjectId, session: ClientSession) {
  const memberships = await Membership.find({ clubId, status: 'ACTIVE' }).select('userId role').session(session).lean();
  if (memberships.length === 0) {
    return [];
  }

  const users = await User.find({ _id: { $in: memberships.map((membership) => membership.userId) } })
    .select('_id')
    .session(session)
    .lean();
  const existing = new Set(users.map((user) => user._id.toString()));
  return memberships.filter((membership) => existing.has(membership.userId.toString()));
}

export async function createClubChannel(input: { clubId: Types.ObjectId; title: string }): Promise<ChannelCommandResult> {
  const title = readableTitle(input.title);
  if (!title) {
    return { error: invalidChannelTitle() };
  }

  const session = await mongoose.startSession();
  try {
    const channel = await session.withTransaction(async () => {
      if (await titleTaken(input.clubId, title, session)) {
        throw new ChannelCommandError(channelTitleExists());
      }

      const created = await createChannel(input.clubId, title, [], session);
      // Joining later walks every club channel, so the people already here have to be seated now.
      // Officers moderate and members write, which is the same split a role change applies.
      const roster = await activeChannelRoster(input.clubId, session);
      if (roster.length > 0) {
        await addParticipantsToConversation(
          created._id,
          roster.map((membership) => membership.userId),
          session
        );
        const updates: PermissionUpdate[] = roster.map((membership) => [
          membership.userId,
          CHANNEL_PERMISSION_BY_ROLE[membership.role],
        ]);
        await updateParticipantPermissions(created._id, undefined, updates, session);
      }
      return { _id: created._id.toString(), title: created.title ?? title };
    });
    return { channel };
  } catch (error) {
    const ruled = ruledChannelError(error) ?? channelWriteError(error);
    if (ruled) {
      return { error: ruled };
    }
    throw error;
  } finally {
    await session.endSession();
  }
}

export async function renameClubChannel(input: {
  clubId: Types.ObjectId;
  channelId: Types.ObjectId;
  title: string;
  requesterId: Types.ObjectId;
}): Promise<ChannelCommandResult> {
  const title = readableTitle(input.title);
  if (!title) {
    return { error: invalidChannelTitle() };
  }

  const channel = await Conversation.findOne({
    _id: input.channelId,
    clubId: input.clubId,
    type: ConversationType.CHANNEL,
  })
    .select('title')
    .lean();
  if (!channel) {
    return { error: channelNotFound() };
  }
  if (channel.title === title) {
    return { channel: { _id: input.channelId.toString(), title } };
  }
  if (await titleTaken(input.clubId, title, undefined, input.channelId)) {
    return { error: channelTitleExists() };
  }

  try {
    const updated = await updateConversationTitle(input.channelId, input.requesterId, title);
    const savedTitle = updated.title ?? title;
    messagingPublisher.conversationRenamed(input.channelId.toString(), savedTitle);
    return { channel: { _id: updated._id.toString(), title: savedTitle } };
  } catch (error) {
    if (error instanceof MessagingError && error.code === MessagingErrorCode.CONVERSATION_NOT_FOUND) {
      return { error: channelNotFound() };
    }
    const ruled = channelWriteError(error);
    if (ruled) {
      return { error: ruled };
    }
    throw error;
  }
}

export async function removeClubChannel(input: {
  clubId: Types.ObjectId;
  channelId: Types.ObjectId;
}): Promise<ChannelCommandResult> {
  const session = await mongoose.startSession();
  try {
    const removed = await session.withTransaction(async () => {
      // Touch the club row so two removals conflict and retry. The retry then sees the
      // channel that remains and keeps the club from losing its last channel.
      const locked = await Club.updateOne(
        { _id: input.clubId, status: 'APPROVED' },
        { $set: { status: 'APPROVED' } },
        { session, timestamps: true }
      );
      if (locked.matchedCount === 0) {
        throw new ChannelCommandError(clubNotFound());
      }

      const channel = await Conversation.findOne({
        _id: input.channelId,
        clubId: input.clubId,
        type: ConversationType.CHANNEL,
      }).session(session);
      if (!channel?.title) {
        throw new ChannelCommandError(channelNotFound());
      }

      const another = await Conversation.exists({
        clubId: input.clubId,
        type: ConversationType.CHANNEL,
        _id: { $ne: channel._id },
      }).session(session);
      if (!another) {
        throw new ChannelCommandError(lastChannel());
      }

      const seats = await ConversationParticipant.find({ conversationId: channel._id })
        .select('userId')
        .session(session)
        .lean();
      await Message.deleteMany({ conversationId: channel._id }, { session });
      await ConversationParticipant.deleteMany({ conversationId: channel._id }, { session });
      await channel.deleteOne({ session });
      return {
        channel: { _id: channel._id.toString(), title: channel.title },
        participantIds: seats.map((seat) => seat.userId.toString()),
      };
    });

    for (const userId of removed.participantIds) {
      messagingPublisher.participantRemoved(removed.channel._id, userId);
    }
    return { channel: removed.channel };
  } catch (error) {
    const ruled = ruledChannelError(error);
    if (ruled) {
      return { error: ruled };
    }
    throw error;
  } finally {
    await session.endSession();
  }
}
