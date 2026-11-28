import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type Ref } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { clubChannelPath } from '../../clubChannelPath';
import Alert from 'react-bootstrap/Alert';
import Badge from 'react-bootstrap/Badge';
import Button from 'react-bootstrap/Button';
import Dropdown from 'react-bootstrap/Dropdown';
import Form from 'react-bootstrap/Form';
import Modal from 'react-bootstrap/Modal';
import { PencilSquare, PlusLg, Search, ThreeDotsVertical, Trash } from 'react-bootstrap-icons';
import { useAuth } from '../../hooks/useAuth';
import {
  deleteChannel,
  getClub,
  getClubChannels,
  getClubMembers,
  isUnauthorizedError,
  leaveClub,
  removeMember,
  updateMemberRole,
} from '../../api/clubApi';
import type { ClubCategory, ClubChannel, ClubDetails, ClubMember } from '../../types/club';
import PostAnnouncementModal from './AnnouncementModal';
import { CreateChannelModal } from './CreateChannelModal';
import { EditClubModal } from './EditClubModal';

const PREVIEW_COUNT = 3;
const EXPANDED_LIST_MAX_HEIGHT = '10.5rem';
const GENERAL_CHANNEL_TITLE = 'General';
const ANNOUNCEMENT_POSTED = 'Announcement posted.';
const MEMBER_MENU_POPPER = { strategy: 'fixed' as const };

type MemberConfirm = { userId: string; action: 'demote' | 'remove' };

type FocusAfter =
  | 'leave-cancel'
  | 'leave-button'
  | 'delete-cancel'
  | 'delete-trash'
  | 'member-cancel'
  | 'member-menu'
  | 'channels-heading'
  | 'members-heading'
  | 'announcement';

const CATEGORY_LABEL: Record<ClubCategory, string> = {
  ACADEMIC: 'Academic',
  CULTURAL: 'Cultural',
  SPORTS: 'Sports',
  OTHER: 'Other',
};

type ClubInfoModalProps = {
  show: boolean;
  onHide: () => void;
  /** Approved club to load. Pass null while the modal is closed. */
  clubId: string | null;
  /** Called after the member leaves, before the modal closes. */
  onLeft?: (clubId: string) => void;
};

function errorMessage(err: unknown): string {
  const hasStatus = err instanceof Error && (err as { status?: number }).status !== undefined;
  if (!hasStatus) return 'Could not reach the server. Please try again.';
  return err instanceof Error && err.message ? err.message : 'Something went wrong. Please try again.';
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError';
}

function failureMessage(result: PromiseSettledResult<unknown>): string {
  if (result.status === 'fulfilled' || isAbortError(result.reason)) return '';
  return errorMessage(result.reason);
}

function formatMeetingTime(meeting: ClubDetails['meeting']): string {
  const parts = [meeting?.day, meeting?.time].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : 'Not set';
}

function formatMeetingLocation(meeting: ClubDetails['meeting']): string {
  const location = meeting?.location?.trim();
  return location ? location : 'Not set';
}

function channelLabel(title: string): string {
  const trimmed = title.trim();
  return trimmed.startsWith('#') ? trimmed : `# ${trimmed}`;
}

function memberName(member: ClubMember): string {
  const name = `${member.firstName} ${member.lastName}`.trim();
  return name || 'Unknown member';
}

function sortMembers(list: ClubMember[]): ClubMember[] {
  return [...list].sort(
    (a, b) =>
      Number(b.role === 'OFFICER') - Number(a.role === 'OFFICER') ||
      a.lastName.localeCompare(b.lastName) ||
      a.firstName.localeCompare(b.firstName),
  );
}

function matchesQuery(query: string, ...values: Array<string | undefined>): boolean {
  const search = query.trim().toLowerCase();
  if (search === '') return true;
  return values.some((value) => (value ?? '').toLowerCase().includes(search));
}

function matchCount(count: number, singular: string, plural: string, query: string): string {
  const noun = count === 1 ? singular : plural;
  return query.trim() ? `${count} matching ${noun}` : `${count} ${noun}`;
}

function ListSearch({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  return (
    <div className="position-relative" style={{ width: 'min(11.25rem, 100%)' }}>
      <span className="position-absolute top-50 start-0 translate-middle-y ms-2 d-flex text-secondary pe-none">
        <Search size={16} aria-hidden="true" focusable="false" />
      </span>
      <Form.Control
        type="search"
        size="sm"
        value={value}
        aria-label={label}
        placeholder="Search"
        className="ps-4"
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function Section({
  title,
  search,
  headingAction,
  headingRef,
  children,
}: {
  title: string;
  search?: ReactNode;
  headingAction?: ReactNode;
  headingRef?: Ref<HTMLHeadingElement>;
  children: ReactNode;
}) {
  return (
    <section className="border rounded overflow-hidden flex-shrink-0">
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 px-3 py-2 bg-light border-bottom">
        <h3 ref={headingRef} tabIndex={headingRef ? -1 : undefined} className="h5 mb-0">
          {title}
        </h3>
        {(search || headingAction) && (
          <div className="d-flex align-items-center gap-2 ms-auto">
            {search}
            {headingAction}
          </div>
        )}
      </div>
      <div className="p-3">{children}</div>
    </section>
  );
}

function ListToggle({
  expanded,
  hiddenCount,
  itemLabel,
  onToggle,
}: {
  expanded: boolean;
  hiddenCount: number;
  itemLabel: 'channels' | 'members';
  onToggle: () => void;
}) {
  if (hiddenCount <= 0) return null;

  return (
    <div className="d-flex justify-content-end mt-2">
      <Button type="button" variant="link" className="p-0 link-secondary" aria-expanded={expanded} onClick={onToggle}>
        {expanded ? `Show fewer ${itemLabel}` : `See ${hiddenCount} more ${itemLabel}`}
      </Button>
    </div>
  );
}

function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Alert variant="danger" className="mb-0">
      <p className="mb-2">{message}</p>
      <Button type="button" variant="outline-secondary" onClick={onRetry}>
        Try again
      </Button>
    </Alert>
  );
}

function expandedListStyle(scroll: boolean) {
  if (!scroll) return undefined;
  return {
    maxHeight: EXPANDED_LIST_MAX_HEIGHT,
    overflowY: 'auto' as const,
    overscrollBehavior: 'contain' as const,
  };
}

function ClubInfoContent({ clubId, onHide, onLeft }: { clubId: string; onHide: () => void; onLeft?: (clubId: string) => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, setUser } = useAuth();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const channelsHeadingRef = useRef<HTMLHeadingElement>(null);
  const membersHeadingRef = useRef<HTMLHeadingElement>(null);
  const announcementButtonRef = useRef<HTMLButtonElement>(null);
  const cancelLeaveRef = useRef<HTMLButtonElement>(null);
  const leaveClubRef = useRef<HTMLButtonElement>(null);
  const cancelDeleteRef = useRef<HTMLButtonElement>(null);
  const cancelMemberRef = useRef<HTMLButtonElement>(null);
  const trashRefs = useRef(new Map<string, HTMLButtonElement>());
  const menuRefs = useRef(new Map<string, HTMLButtonElement>());
  const focusAfter = useRef<FocusAfter | null>(null);
  const focusId = useRef<string | null>(null);

  const [club, setClub] = useState<ClubDetails | null>(null);
  const [channels, setChannels] = useState<ClubChannel[]>([]);
  const [members, setMembers] = useState<ClubMember[]>([]);
  const [loadError, setLoadError] = useState('');
  const [channelsError, setChannelsError] = useState('');
  const [membersError, setMembersError] = useState('');
  const [leaveError, setLeaveError] = useState('');
  const [confirmingLeave, setConfirmingLeave] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [showAllChannels, setShowAllChannels] = useState(false);
  const [showAllMembers, setShowAllMembers] = useState(false);
  const [channelQuery, setChannelQuery] = useState('');
  const [memberQuery, setMemberQuery] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [showEdit, setShowEdit] = useState(false);
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [showAnnouncement, setShowAnnouncement] = useState(false);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [deletingChannelId, setDeletingChannelId] = useState<string | null>(null);
  const [updatingMemberId, setUpdatingMemberId] = useState<string | null>(null);
  const [channelActionError, setChannelActionError] = useState('');
  const [roleError, setRoleError] = useState('');
  const [announcementError, setAnnouncementError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [statusVersion, setStatusVersion] = useState(0);
  const [memberConfirm, setMemberConfirm] = useState<MemberConfirm | null>(null);

  const reset = useCallback(() => {
    setClub(null);
    setChannels([]);
    setMembers([]);
    setLoadError('');
    setChannelsError('');
    setMembersError('');
    setLeaveError('');
    setConfirmingLeave(false);
    setLeaving(false);
    setShowAllChannels(false);
    setShowAllMembers(false);
    setChannelQuery('');
    setMemberQuery('');
    setShowEdit(false);
    setShowCreateChannel(false);
    setShowAnnouncement(false);
    setConfirmingDeleteId(null);
    setDeletingChannelId(null);
    setUpdatingMemberId(null);
    setChannelActionError('');
    setRoleError('');
    setAnnouncementError('');
    setStatusMessage('');
    setMemberConfirm(null);
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    async function load(id: string) {
      reset();

      const [clubResult, channelResult, memberResult] = await Promise.allSettled([
        getClub(id, controller.signal),
        getClubChannels(id, controller.signal),
        getClubMembers(id, controller.signal),
      ]);

      if (controller.signal.aborted) return;

      const results = [clubResult, channelResult, memberResult];
      if (results.some((result) => result.status === 'rejected' && isUnauthorizedError(result.reason))) {
        setUser(null);
        navigate('/login');
        return;
      }

      setLoadError(failureMessage(clubResult));
      if (clubResult.status === 'fulfilled') setClub(clubResult.value);

      setChannelsError(failureMessage(channelResult));
      if (channelResult.status === 'fulfilled') setChannels(channelResult.value);

      setMembersError(failureMessage(memberResult));
      if (memberResult.status === 'fulfilled') setMembers(memberResult.value);
    }

    load(clubId);

    return () => {
      controller.abort();
    };
  }, [clubId, reloadKey, navigate, setUser, reset]);

  const filteredChannels = channels.filter((channel) =>
    matchesQuery(channelQuery, channel.title, channelLabel(channel.title)),
  );
  const filteredMembers = members.filter((member) =>
    matchesQuery(memberQuery, memberName(member), member.firstName, member.lastName),
  );

  useLayoutEffect(() => {
    const target = focusAfter.current;
    const id = focusId.current;
    if (!target) return;
    focusAfter.current = null;

    if (target === 'leave-cancel') cancelLeaveRef.current?.focus();
    else if (target === 'leave-button') leaveClubRef.current?.focus();
    else if (target === 'delete-cancel') cancelDeleteRef.current?.focus();
    else if (target === 'delete-trash' && id) trashRefs.current.get(id)?.focus();
    else if (target === 'member-cancel') cancelMemberRef.current?.focus();
    else if (target === 'member-menu' && id) menuRefs.current.get(id)?.focus();
    else if (target === 'channels-heading') channelsHeadingRef.current?.focus();
    else if (target === 'members-heading') membersHeadingRef.current?.focus();
    else if (target === 'announcement') announcementButtonRef.current?.focus();
  }, [confirmingLeave, confirmingDeleteId, memberConfirm, statusVersion]);

  function announce(message: string) {
    setStatusMessage(message);
    setStatusVersion((version) => version + 1);
  }

  function retry() {
    titleRef.current?.focus();
    setReloadKey((key) => key + 1);
  }

  async function confirmLeave() {
    if (leaving) return;
    setLeaving(true);
    setLeaveError('');

    try {
      await leaveClub(clubId);
      onLeft?.(clubId);
      onHide();
    } catch (err) {
      if (isUnauthorizedError(err)) {
        setUser(null);
        onHide();
        navigate('/login');
        return;
      }
      setLeaveError(errorMessage(err));
    } finally {
      setLeaving(false);
    }
  }

  const viewerMembership = members.find((member) => String(member.userId) === user?.id);
  const viewerIsMember = viewerMembership !== undefined;
  const viewerIsOfficer = viewerMembership?.role === 'OFFICER';
  const generalChannel = channels.find(
    (channel) => channel.title.trim().toLowerCase() === GENERAL_CHANNEL_TITLE.toLowerCase(),
  );
  const channelToDelete = channels.find((channel) => channel._id === confirmingDeleteId);
  const actionLocked = leaving || deletingChannelId !== null || updatingMemberId !== null;

  function openChannel(channelId: string) {
    if (actionLocked) return;
    const path = clubChannelPath(clubId, channelId);
    onHide();
    if (location.pathname !== path) navigate(path);
  }

  function openAnnouncement() {
    if (channelsError) return;
    if (!generalChannel) {
      setAnnouncementError('This club has no General channel to post in.');
      return;
    }
    setAnnouncementError('');
    setShowAnnouncement(true);
  }

  async function removeChannel(channelId: string) {
    if (deletingChannelId) return;
    setDeletingChannelId(channelId);
    setChannelActionError('');

    try {
      await deleteChannel(clubId, channelId);
      const removed = channels.find((channel) => channel._id === channelId);
      setChannels((current) => current.filter((channel) => channel._id !== channelId));
      setConfirmingDeleteId(null);
      focusAfter.current = 'channels-heading';
      announce(`Deleted ${channelLabel(removed?.title ?? 'channel')}.`);
    } catch (err) {
      if (isUnauthorizedError(err)) {
        setUser(null);
        onHide();
        navigate('/login');
        return;
      }
      setChannelActionError(errorMessage(err));
    } finally {
      setDeletingChannelId(null);
    }
  }

  async function changeRole(member: ClubMember, role: ClubMember['role']) {
    if (updatingMemberId) return;
    setUpdatingMemberId(member.userId);
    setRoleError('');

    try {
      await updateMemberRole(clubId, member.userId, role);
      setMembers((current) =>
        sortMembers(current.map((item) => (item.userId === member.userId ? { ...item, role } : item))),
      );
      setShowAllMembers(true);
      setMemberConfirm(null);
      const isSelf = String(member.userId) === user?.id;
      const roleLabel = role === 'OFFICER' ? 'an officer' : 'a member';
      focusAfter.current = 'members-heading';
      announce(isSelf ? `You are now ${roleLabel}.` : `${memberName(member)} is now ${roleLabel}.`);
    } catch (err) {
      if (isUnauthorizedError(err)) {
        setUser(null);
        onHide();
        navigate('/login');
        return;
      }
      setRoleError(errorMessage(err));
    } finally {
      setUpdatingMemberId(null);
    }
  }

  async function removeClubMember(member: ClubMember) {
    if (updatingMemberId) return;
    setUpdatingMemberId(member.userId);
    setRoleError('');

    try {
      await removeMember(clubId, member.userId);
      setMembers((current) => current.filter((item) => item.userId !== member.userId));
      setMemberConfirm(null);
      focusAfter.current = 'members-heading';
      announce(`${memberName(member)} was removed.`);
    } catch (err) {
      if (isUnauthorizedError(err)) {
        setUser(null);
        onHide();
        navigate('/login');
        return;
      }
      setRoleError(errorMessage(err));
    } finally {
      setUpdatingMemberId(null);
    }
  }

  const visibleChannels = showAllChannels ? filteredChannels : filteredChannels.slice(0, PREVIEW_COUNT);
  const visibleMembers = showAllMembers ? filteredMembers : filteredMembers.slice(0, PREVIEW_COUNT);
  const channelsToShow =
    channelToDelete && !visibleChannels.some((channel) => channel._id === channelToDelete._id)
      ? [channelToDelete, ...visibleChannels]
      : visibleChannels;
  const confirmingMember = members.find((member) => member.userId === memberConfirm?.userId);
  const membersToShow =
    confirmingMember && !visibleMembers.some((member) => member.userId === confirmingMember.userId)
      ? [confirmingMember, ...visibleMembers]
      : visibleMembers;
  const hiddenChannelCount = Math.max(filteredChannels.length - PREVIEW_COUNT, 0);
  const hiddenMemberCount = Math.max(filteredMembers.length - PREVIEW_COUNT, 0);

  return (
    <>
    <Modal
      show
      onHide={() => {
        if (!actionLocked) onHide();
      }}
      centered
      scrollable
      size="lg"
      backdrop={actionLocked ? 'static' : true}
      keyboard={!actionLocked}
      aria-labelledby="club-info-title"
    >
      <Modal.Header closeButton={!actionLocked} closeLabel="Close club information">
        <Modal.Title ref={titleRef} id="club-info-title" as="h2" tabIndex={-1} className="h4 mb-0">
          {club ? club.name : 'Club information'}
        </Modal.Title>
      </Modal.Header>

      <Modal.Body className="d-flex flex-column gap-4">
        <p className="visually-hidden" aria-live="polite">
          <span key={statusVersion}>{statusMessage}</span>
        </p>
        {!club && !loadError && (
          <p className="text-center text-secondary my-4" role="status">
            Loading club...
          </p>
        )}

        {loadError && <LoadError message={loadError} onRetry={retry} />}

        {club && (
          <>
            <Section
              title="Club Overview"
              headingAction={
                viewerIsOfficer ? (
                  <Button
                    type="button"
                    variant="link"
                    className="text-dark p-1 d-flex"
                    aria-label="Edit club"
                    disabled={actionLocked}
                    onClick={() => setShowEdit(true)}
                  >
                    <PencilSquare size={18} aria-hidden="true" focusable="false" />
                  </Button>
                ) : undefined
              }
            >
              {club.category && (
                <Badge bg="primary-subtle" text="primary-emphasis" pill className="fw-semibold mb-3">
                  {CATEGORY_LABEL[club.category] ?? club.category}
                </Badge>
              )}
              <p className="mb-3" style={{ whiteSpace: 'pre-wrap' }}>
                {club.description || 'No description yet.'}
              </p>
              <div className="d-flex flex-column flex-sm-row align-items-stretch align-items-sm-end justify-content-between gap-3">
                <div>
                  <p className="mb-2">Meeting time: {formatMeetingTime(club.meeting)}</p>
                  <p className="mb-0">Meeting Location: {formatMeetingLocation(club.meeting)}</p>
                </div>
                {viewerIsMember && (
                  <div>
                    {confirmingLeave ? (
                      <>
                        <p className="text-secondary small mb-2 text-start text-sm-end" role="status">
                          You&apos;ll lose access to this club&apos;s channels.
                        </p>
                        <div className="d-flex justify-content-start justify-content-sm-end gap-2">
                          <Button
                            ref={cancelLeaveRef}
                            type="button"
                            variant="outline-secondary"
                            className="fw-semibold"
                            disabled={actionLocked}
                            onClick={() => {
                          focusAfter.current = 'leave-button';
                          setConfirmingLeave(false);
                              setLeaveError('');
                            }}
                          >
                            Cancel
                          </Button>
                          <Button
                            type="button"
                            variant="danger"
                            className="fw-semibold"
                            disabled={actionLocked}
                            onClick={confirmLeave}
                          >
                            {leaving ? 'Leaving...' : 'Leave Club'}
                          </Button>
                        </div>
                      </>
                    ) : (
                      <Button
                        ref={leaveClubRef}
                        type="button"
                        variant="danger"
                        className="fw-semibold"
                        disabled={actionLocked}
                        onClick={() => {
                          setLeaveError('');
                          focusAfter.current = 'leave-cancel';
                          setConfirmingLeave(true);
                        }}
                      >
                        Leave Club
                      </Button>
                    )}
                  </div>
                )}
              </div>
              {leaveError && (
                <Alert variant="danger" className="py-2 px-3 mt-3 mb-0">
                  {leaveError}
                </Alert>
              )}
            </Section>

            {viewerIsOfficer && (
              <Section title="Officer Tools">
                <Button
                  ref={announcementButtonRef}
                  type="button"
                  className="fw-semibold text-white"
                  style={{ backgroundColor: '#3046C3', borderColor: '#3046C3' }}
                  disabled={actionLocked || Boolean(channelsError)}
                  onClick={openAnnouncement}
                >
                  Post Announcement
                </Button>
                {statusMessage === ANNOUNCEMENT_POSTED && (
                  <p className="text-success small mt-2 mb-0">Announcement posted.</p>
                )}
                {announcementError && (
                  <Alert variant="danger" className="py-2 px-3 mt-3 mb-0">
                    {announcementError}
                  </Alert>
                )}
              </Section>
            )}

            <Section
              title="Channels"
              headingRef={channelsHeadingRef}
              search={<ListSearch value={channelQuery} onChange={setChannelQuery} label="Search channels" />}
              headingAction={
                viewerIsOfficer ? (
                  <Button
                    type="button"
                    variant="link"
                    className="text-dark p-1 d-flex"
                    aria-label="Add channel"
                    disabled={actionLocked || Boolean(channelsError)}
                    onClick={() => setShowCreateChannel(true)}
                  >
                    <PlusLg size={20} aria-hidden="true" focusable="false" />
                  </Button>
                ) : undefined
              }
            >
              <p className="visually-hidden" aria-live="polite">
                {channelsError ? '' : matchCount(filteredChannels.length, 'channel', 'channels', channelQuery)}
              </p>
              {channelsError ? (
                <LoadError message={channelsError} onRetry={retry} />
              ) : channels.length === 0 ? (
                <p className="text-secondary mb-0">No channels yet.</p>
              ) : filteredChannels.length === 0 && !channelToDelete ? (
                <p className="text-secondary mb-0">No channels match your search.</p>
              ) : (
                <>
                  <ul
                    className="list-unstyled d-flex flex-column gap-2 mb-0"
                    style={expandedListStyle(showAllChannels && hiddenChannelCount > 0)}
                  >
                    {channelsToShow.map((channel) => {
                      const label = channelLabel(channel.title);
                      const canDelete =
                        viewerIsOfficer && channel.title.trim().toLowerCase() !== GENERAL_CHANNEL_TITLE.toLowerCase();
                      const confirmingDelete = channel._id === confirmingDeleteId;
                      return (
                        <li key={channel._id} className="d-flex flex-column gap-2">
                          <div className="d-flex align-items-stretch gap-2">
                            <Button
                              type="button"
                              variant="outline-secondary"
                              className="flex-grow-1 min-w-0 d-flex flex-column flex-sm-row align-items-stretch align-items-sm-center justify-content-between gap-1 gap-sm-3 text-start"
                              disabled={actionLocked}
                              aria-label={`Open ${label} in Messages`}
                              onClick={() => openChannel(channel._id)}
                            >
                              <span className="text-truncate min-w-0">{label}</span>
                              <span className="flex-shrink-0">Open in Messages →</span>
                            </Button>
                            {canDelete && !confirmingDelete && (
                              <Button
                                type="button"
                                variant="link"
                                className="text-danger p-2 flex-shrink-0"
                                aria-label={`Delete ${label}`}
                                disabled={actionLocked}
                                ref={(node: HTMLButtonElement | null) => {
                                  if (node) trashRefs.current.set(channel._id, node);
                                  else trashRefs.current.delete(channel._id);
                                }}
                                onClick={() => {
                                  setChannelActionError('');
                                  focusAfter.current = 'delete-cancel';
                                  setConfirmingDeleteId(channel._id);
                                }}
                              >
                                <Trash size={18} aria-hidden="true" focusable="false" />
                              </Button>
                            )}
                          </div>
                          {confirmingDelete && (
                            <div>
                              {channelActionError && (
                                <Alert variant="danger" className="py-2 px-3">
                                  {channelActionError}
                                </Alert>
                              )}
                              <p className="fw-semibold mb-1">Delete {channel.title.trim() || 'channel'}?</p>
                              <p className="text-secondary small mb-2" role="status">
                                Are you sure you want to delete {label}? All messages in this channel will be
                                permanently removed.
                              </p>
                              <div className="d-flex justify-content-end gap-2">
                                <Button
                                  ref={cancelDeleteRef}
                                  type="button"
                                  variant="outline-secondary"
                                  disabled={deletingChannelId !== null}
                                  onClick={() => {
                                    focusAfter.current = 'delete-trash';
                                    focusId.current = channel._id;
                                    setConfirmingDeleteId(null);
                                    setChannelActionError('');
                                  }}
                                >
                                  Cancel
                                </Button>
                                <Button
                                  type="button"
                                  variant="danger"
                                  disabled={deletingChannelId !== null}
                                  onClick={() => removeChannel(channel._id)}
                                >
                                  {deletingChannelId === channel._id ? 'Deleting...' : 'Delete Channel'}
                                </Button>
                              </div>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                  <ListToggle
                    expanded={showAllChannels}
                    hiddenCount={hiddenChannelCount}
                    itemLabel="channels"
                    onToggle={() => setShowAllChannels((current) => !current)}
                  />
                </>
              )}
            </Section>

            <Section
              title={
                membersError
                  ? 'Members'
                  : `Members (${memberQuery.trim() ? filteredMembers.length : members.length})`
              }
              headingRef={membersHeadingRef}
              search={<ListSearch value={memberQuery} onChange={setMemberQuery} label="Search members" />}
            >
              <p className="visually-hidden" aria-live="polite">
                {membersError ? '' : matchCount(filteredMembers.length, 'member', 'members', memberQuery)}
              </p>
              {roleError && (
                <Alert variant="danger" className="py-2 px-3 mb-3">
                  {roleError}
                </Alert>
              )}
              {membersError ? (
                <LoadError message={membersError} onRetry={retry} />
              ) : members.length === 0 ? (
                <p className="text-secondary mb-0">No members to show.</p>
              ) : filteredMembers.length === 0 && !confirmingMember ? (
                <p className="text-secondary mb-0">No members match your search.</p>
              ) : (
                <>
                  <ul
                    className="list-group list-group-flush mb-0"
                    style={expandedListStyle(showAllMembers && hiddenMemberCount > 0)}
                  >
                    {membersToShow.map((member) => {
                      const isSelf = String(member.userId) === user?.id;
                      const confirmingThis = memberConfirm?.userId === member.userId;
                      return (
                        <li key={member.userId} className="list-group-item d-flex flex-wrap align-items-center gap-2 px-0">
                          <span className="text-truncate">{memberName(member)}</span>
                          {member.role === 'OFFICER' && (
                            <Badge bg="warning-subtle" text="warning-emphasis" pill className="fw-semibold">
                              OFFICER
                            </Badge>
                          )}
                          {viewerIsOfficer && confirmingThis && memberConfirm && (
                            <div className="w-100">
                              <p className="text-secondary small mb-2" role="status">
                                {memberConfirm.action === 'remove'
                                  ? `Remove ${memberName(member)}? They can't rejoin this club.`
                                  : "You'll lose officer access to this club."}
                              </p>
                              <div className="d-flex justify-content-end gap-2">
                                <Button
                                  ref={cancelMemberRef}
                                  type="button"
                                  size="sm"
                                  variant="outline-secondary"
                                  disabled={actionLocked}
                                  onClick={() => {
                                    focusAfter.current = 'member-menu';
                                    focusId.current = member.userId;
                                    setMemberConfirm(null);
                                    setRoleError('');
                                  }}
                                >
                                  Cancel
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="danger"
                                  disabled={actionLocked}
                                  onClick={() =>
                                    memberConfirm.action === 'remove'
                                      ? removeClubMember(member)
                                      : changeRole(member, 'MEMBER')
                                  }
                                >
                                  {updatingMemberId === member.userId
                                    ? 'Saving...'
                                    : memberConfirm.action === 'remove'
                                      ? 'Remove'
                                      : 'Make Member'}
                                </Button>
                              </div>
                            </div>
                          )}
                          {viewerIsOfficer && !confirmingThis && (
                            <Dropdown align="end" className="ms-auto">
                              <Dropdown.Toggle
                                as="button"
                                type="button"
                                bsPrefix="member-menu-toggle"
                                className="btn btn-link text-dark p-1 border-0 shadow-none"
                                aria-label={`Actions for ${memberName(member)}`}
                                disabled={actionLocked || memberConfirm !== null}
                                ref={(node: HTMLButtonElement | null) => {
                                  if (node) menuRefs.current.set(member.userId, node);
                                  else menuRefs.current.delete(member.userId);
                                }}
                              >
                                <ThreeDotsVertical size={18} aria-hidden="true" focusable="false" />
                              </Dropdown.Toggle>
                              <Dropdown.Menu role="menu" popperConfig={MEMBER_MENU_POPPER}>
                                {member.role === 'MEMBER' ? (
                                  <Dropdown.Item as="button" type="button" onClick={() => changeRole(member, 'OFFICER')}>
                                    Make Officer
                                  </Dropdown.Item>
                                ) : (
                                  <Dropdown.Item
                                    as="button"
                                    type="button"
                                    onClick={() => {
                                      if (!isSelf) {
                                        changeRole(member, 'MEMBER');
                                        return;
                                      }
                                      setRoleError('');
                                      focusAfter.current = 'member-cancel';
                                      setMemberConfirm({ userId: member.userId, action: 'demote' });
                                    }}
                                  >
                                    Make Member
                                  </Dropdown.Item>
                                )}
                                {!isSelf && (
                                  <Dropdown.Item
                                    as="button"
                                    type="button"
                                    className="text-danger"
                                    onClick={() => {
                                      setRoleError('');
                                      focusAfter.current = 'member-cancel';
                                      setMemberConfirm({ userId: member.userId, action: 'remove' });
                                    }}
                                  >
                                    Remove
                                  </Dropdown.Item>
                                )}
                              </Dropdown.Menu>
                            </Dropdown>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                  <ListToggle
                    expanded={showAllMembers}
                    hiddenCount={hiddenMemberCount}
                    itemLabel="members"
                    onToggle={() => setShowAllMembers((current) => !current)}
                  />
                </>
              )}
            </Section>
          </>
        )}
      </Modal.Body>
    </Modal>
    {club && (
      <EditClubModal
        show={showEdit}
        club={{ ...club, status: 'APPROVED' }}
        onHide={() => setShowEdit(false)}
        onSuccess={(updated) => {
          setClub({
            _id: updated._id,
            name: updated.name,
            description: updated.description,
            category: updated.category,
            meeting: updated.meeting,
          });
        }}
      />
    )}
    <CreateChannelModal
      show={showCreateChannel}
      clubId={clubId}
      onHide={() => setShowCreateChannel(false)}
      onSuccess={(created) => {
        setChannelsError('');
        setChannels((current) =>
          current.some((channel) => channel._id === created._id)
            ? current
            : [...current, { _id: created._id, title: created.title }],
        );
        setShowAllChannels(true);
      }}
    />
    {club && generalChannel && (
      <PostAnnouncementModal
        show={showAnnouncement}
        onHide={() => setShowAnnouncement(false)}
        onSuccess={() => {
          focusAfter.current = 'announcement';
          announce(ANNOUNCEMENT_POSTED);
        }}
        conversationId={generalChannel._id}
        clubName={club.name}
      />
    )}
    </>
  );
}

export default function ClubInfoModal({ show, onHide, clubId, onLeft }: ClubInfoModalProps) {
  if (!show || !clubId) return null;
  return <ClubInfoContent clubId={clubId} onHide={onHide} onLeft={onLeft} />;
}
