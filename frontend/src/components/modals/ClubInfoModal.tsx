import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import Alert from 'react-bootstrap/Alert';
import Badge from 'react-bootstrap/Badge';
import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';
import Modal from 'react-bootstrap/Modal';
import { PencilSquare, PlusLg, Search, Trash } from 'react-bootstrap-icons';
import { useAuth } from '../../hooks/useAuth';
import {
  deleteChannel,
  getClub,
  getClubChannels,
  getClubMembers,
  isUnauthorizedError,
  leaveClub,
  updateMemberRole,
} from '../../api/clubApi';
import type { ClubCategory, ClubChannel, ClubDetails, ClubMember } from '../../types/club';
import PostAnnouncementModal from './AnnouncementModal';
import { CreateChannelModal } from './CreateChannelModal';
import { EditClubModal } from './EditClubModal';

const PREVIEW_COUNT = 3;
const EXPANDED_LIST_MAX_HEIGHT = '10.5rem';
const GENERAL_CHANNEL_TITLE = 'General';

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
  children,
}: {
  title: string;
  search?: ReactNode;
  headingAction?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="border rounded overflow-hidden">
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 px-3 py-2 bg-light border-bottom">
        <h3 className="h5 mb-0">{title}</h3>
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
  const { user, setUser } = useAuth();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const cancelLeaveRef = useRef<HTMLButtonElement>(null);
  const leaveClubRef = useRef<HTMLButtonElement>(null);
  const leaveFocusTarget = useRef<'cancel' | 'leave' | null>(null);

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
    if (leaveFocusTarget.current === 'cancel') cancelLeaveRef.current?.focus();
    else if (leaveFocusTarget.current === 'leave') leaveClubRef.current?.focus();
    leaveFocusTarget.current = null;
  }, [confirmingLeave]);

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
  const viewerIsOfficer = user?.isAdmin === true || viewerMembership?.role === 'OFFICER';
  const generalChannel = channels.find(
    (channel) => channel.title.trim().toLowerCase() === GENERAL_CHANNEL_TITLE.toLowerCase(),
  );
  const channelToDelete = channels.find((channel) => channel._id === confirmingDeleteId);
  const actionLocked = leaving || deletingChannelId !== null || updatingMemberId !== null;

  function openChannel(channelId: string) {
    if (actionLocked) return;
    onHide();
    navigate(`/messaging?conversation=${encodeURIComponent(channelId)}`);
  }

  function openAnnouncement() {
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
      setChannels((current) => current.filter((channel) => channel._id !== channelId));
      setConfirmingDeleteId(null);
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
                              leaveFocusTarget.current = 'leave';
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
                          leaveFocusTarget.current = 'cancel';
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
                  type="button"
                  className="fw-semibold text-white"
                  style={{ backgroundColor: '#3046C3', borderColor: '#3046C3' }}
                  disabled={actionLocked}
                  onClick={openAnnouncement}
                >
                  Post Announcement
                </Button>
                {announcementError && (
                  <Alert variant="danger" className="py-2 px-3 mt-3 mb-0">
                    {announcementError}
                  </Alert>
                )}
              </Section>
            )}

            <Section
              title="Channels"
              search={<ListSearch value={channelQuery} onChange={setChannelQuery} label="Search channels" />}
              headingAction={
                viewerIsOfficer ? (
                  <Button
                    type="button"
                    variant="link"
                    className="text-dark p-1 d-flex"
                    aria-label="Add channel"
                    disabled={actionLocked}
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
              ) : filteredChannels.length === 0 ? (
                <p className="text-secondary mb-0">No channels match your search.</p>
              ) : (
                <>
                  <ul
                    className="list-unstyled d-flex flex-column gap-2 mb-0"
                    style={expandedListStyle(showAllChannels && hiddenChannelCount > 0)}
                  >
                    {visibleChannels.map((channel) => {
                      const label = channelLabel(channel.title);
                      const canDelete =
                        viewerIsOfficer && channel.title.trim().toLowerCase() !== GENERAL_CHANNEL_TITLE.toLowerCase();
                      return (
                        <li key={channel._id} className="d-flex align-items-stretch gap-2">
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
                          {canDelete && (
                            <Button
                              type="button"
                              variant="link"
                              className="text-danger p-2 flex-shrink-0"
                              aria-label={`Delete ${label}`}
                              disabled={actionLocked}
                              onClick={() => {
                                setChannelActionError('');
                                setConfirmingDeleteId(channel._id);
                              }}
                            >
                              <Trash size={18} aria-hidden="true" focusable="false" />
                            </Button>
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
              ) : filteredMembers.length === 0 ? (
                <p className="text-secondary mb-0">No members match your search.</p>
              ) : (
                <>
                  <ul
                    className="list-group list-group-flush mb-0"
                    style={expandedListStyle(showAllMembers && hiddenMemberCount > 0)}
                  >
                    {visibleMembers.map((member) => (
                      <li key={member.userId} className="list-group-item d-flex flex-wrap align-items-center gap-2 px-0">
                        <span className="text-truncate">{memberName(member)}</span>
                        {member.role === 'OFFICER' && (
                          <Badge bg="warning-subtle" text="warning-emphasis" pill className="fw-semibold">
                            OFFICER
                          </Badge>
                        )}
                        {viewerIsOfficer && (
                          <Button
                            type="button"
                            size="sm"
                            variant={member.role === 'OFFICER' ? 'outline-danger' : 'outline-primary'}
                            className="ms-auto flex-shrink-0 rounded-pill"
                            disabled={actionLocked}
                            onClick={() =>
                              changeRole(member, member.role === 'OFFICER' ? 'MEMBER' : 'OFFICER')
                            }
                          >
                            {updatingMemberId === member.userId
                              ? 'Saving...'
                              : member.role === 'OFFICER'
                                ? 'Remove Officer'
                                : 'Make Officer'}
                          </Button>
                        )}
                      </li>
                    ))}
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
        conversationId={generalChannel._id}
        clubName={club.name}
      />
    )}
    <Modal
      show={channelToDelete !== undefined}
      onHide={() => {
        if (deletingChannelId) return;
        setConfirmingDeleteId(null);
        setChannelActionError('');
      }}
      centered
      backdrop={deletingChannelId ? 'static' : true}
      keyboard={!deletingChannelId}
      aria-labelledby="delete-channel-title"
    >
      <Modal.Header className="px-4 pt-4">
        <Modal.Title id="delete-channel-title" className="h5 fw-bold mb-0">
          Delete {channelToDelete?.title.trim() || 'channel'}?
        </Modal.Title>
      </Modal.Header>
      <Modal.Body className="px-4">
        {channelActionError && (
          <Alert variant="danger" className="py-2 px-3">
            {channelActionError}
          </Alert>
        )}
        <p className="mb-0">
          Are you sure you want to delete {channelToDelete ? channelLabel(channelToDelete.title) : 'this channel'}? All
          messages in this channel will be permanently removed
        </p>
      </Modal.Body>
      <Modal.Footer className="px-4 pb-4">
        <Button
          type="button"
          variant="outline-secondary"
          disabled={deletingChannelId !== null}
          onClick={() => {
            setConfirmingDeleteId(null);
            setChannelActionError('');
          }}
        >
          Cancel
        </Button>
        <Button
          type="button"
          variant="danger"
          disabled={deletingChannelId !== null || !channelToDelete}
          onClick={() => {
            if (channelToDelete) removeChannel(channelToDelete._id);
          }}
        >
          {deletingChannelId ? 'Deleting...' : 'Delete Channel'}
        </Button>
      </Modal.Footer>
    </Modal>
    </>
  );
}

export default function ClubInfoModal({ show, onHide, clubId, onLeft }: ClubInfoModalProps) {
  if (!show || !clubId) return null;
  return <ClubInfoContent clubId={clubId} onHide={onHide} onLeft={onLeft} />;
}
