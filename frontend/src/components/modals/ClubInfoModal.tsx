import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import Alert from 'react-bootstrap/Alert';
import Badge from 'react-bootstrap/Badge';
import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';
import InputGroup from 'react-bootstrap/InputGroup';
import Modal from 'react-bootstrap/Modal';
import { useAuth } from '../../hooks/useAuth';
import {
  getClub,
  getClubChannels,
  getClubMembers,
  isUnauthorizedError,
  leaveClub,
} from '../../api/clubApi';
import type { ClubCategory, ClubChannel, ClubDetails, ClubMember } from '../../types/club';

const PREVIEW_COUNT = 3;
const EXPANDED_LIST_MAX_HEIGHT = '10.5rem';

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
    <InputGroup className="rounded-3 mb-3 overflow-hidden" style={{ backgroundColor: '#EDF0F5' }}>
      <InputGroup.Text className="bg-transparent border-0 pe-1">
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
          focusable="false"
        >
          <path
            d="M7.33333 12.6667C10.2789 12.6667 12.6667 10.2789 12.6667 7.33333C12.6667 4.38781 10.2789 2 7.33333 2C4.38781 2 2 4.38781 2 7.33333C2 10.2789 4.38781 12.6667 7.33333 12.6667Z"
            stroke="#6B7280"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M14 14L11.1 11.1"
            stroke="#6B7280"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </InputGroup.Text>
      <Form.Control
        type="text"
        className="border-0 bg-transparent shadow-none"
        placeholder="Search"
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        style={{ fontSize: '14px', color: '#1F2937' }}
      />
    </InputGroup>
  );
}

function Section({ title, search, children }: { title: string; search?: ReactNode; children: ReactNode }) {
  return (
    <section>
      <div className="mb-3">
        <h3 className="fw-bold mb-0 text-dark" style={{ fontSize: '15px' }}>
          {title}
        </h3>
      </div>
      {search}
      {children}
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

  function openChannel(channelId: string) {
    if (leaving) return;
    onHide();
    navigate(`/messaging?conversation=${encodeURIComponent(channelId)}`);
  }

  const visibleChannels = showAllChannels ? filteredChannels : filteredChannels.slice(0, PREVIEW_COUNT);
  const visibleMembers = showAllMembers ? filteredMembers : filteredMembers.slice(0, PREVIEW_COUNT);
  const hiddenChannelCount = Math.max(filteredChannels.length - PREVIEW_COUNT, 0);
  const hiddenMemberCount = Math.max(filteredMembers.length - PREVIEW_COUNT, 0);
  const viewerIsMember = members.some((member) => String(member.userId) === user?.id);

  return (
    <Modal
      show
      onHide={() => {
        if (!leaving) onHide();
      }}
      centered
      scrollable
      backdrop={leaving ? 'static' : true}
      keyboard={!leaving}
      aria-labelledby="club-info-title"
      contentClassName="border-0 rounded-4 shadow"
    >
      <Modal.Header
        closeButton={!leaving}
        className="border-0 pb-1 pt-4 px-4"
        closeLabel="Close club information"
      >
        <Modal.Title ref={titleRef} id="club-info-title" as="h2" tabIndex={-1} className="h5 fw-bold text-dark">
          Club information
        </Modal.Title>
      </Modal.Header>

      <Modal.Body className="px-4 pt-2 pb-4">
        {!club && !loadError && (
          <p className="text-center text-secondary my-4" role="status">
            Loading club...
          </p>
        )}

        {loadError && <LoadError message={loadError} onRetry={retry} />}

        {club && (
          <>
            <div className="mb-4">
              <div className="d-flex align-items-center gap-2 mb-1">
                <h3 className="h5 fw-bold mb-0 text-dark">{club.name}</h3>
                {viewerIsMember && !confirmingLeave && (
                  <Button
                    ref={leaveClubRef}
                    type="button"
                    size="sm"
                    variant="light"
                    onClick={() => {
                      setLeaveError('');
                      leaveFocusTarget.current = 'cancel';
                      setConfirmingLeave(true);
                    }}
                    className="border-0 py-0 px-2 rounded-3"
                    style={{ backgroundColor: '#EDF0F5', color: '#3046C3' }}
                  >
                    Leave
                  </Button>
                )}
              </div>
              <p className="text-secondary small mb-0">
                {club.category ? (CATEGORY_LABEL[club.category] ?? club.category) : 'Club'}
              </p>
              <p className="text-secondary small mb-0">Meeting time: {formatMeetingTime(club.meeting)}</p>
              <p className="text-secondary small mb-0">Meeting Location: {formatMeetingLocation(club.meeting)}</p>
              <p className="mb-0 mt-3" style={{ whiteSpace: 'pre-wrap' }}>
                {club.description || 'No description yet.'}
              </p>
              {viewerIsMember && confirmingLeave && (
                <div className="mt-3">
                  <p className="text-secondary small mb-2" role="status">
                    You&apos;ll lose access to this club&apos;s channels.
                  </p>
                  <div className="d-flex align-items-center gap-2">
                    <Button
                      ref={cancelLeaveRef}
                      type="button"
                      size="sm"
                      variant="light"
                      className="border-0 rounded-3"
                      style={{ backgroundColor: '#EDF0F5', color: '#374151' }}
                      disabled={leaving}
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
                      size="sm"
                      className="border-0 fw-semibold text-white rounded-3 px-3"
                      style={{ backgroundColor: '#FF6C2F' }}
                      disabled={leaving}
                      onClick={confirmLeave}
                    >
                      {leaving ? 'Leaving...' : 'Leave club'}
                    </Button>
                  </div>
                </div>
              )}
              {leaveError && (
                <Alert variant="danger" className="py-1 px-2 small mt-2 mb-0">
                  {leaveError}
                </Alert>
              )}
            </div>

            <div className="mb-4">
              <Section
                title="Channels"
                search={<ListSearch value={channelQuery} onChange={setChannelQuery} label="Search channels" />}
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
                      className="list-unstyled d-flex flex-column gap-3 mb-0"
                      style={expandedListStyle(showAllChannels && hiddenChannelCount > 0)}
                    >
                      {visibleChannels.map((channel) => {
                        const label = channelLabel(channel.title);
                        return (
                          <li key={channel._id}>
                            <button
                              type="button"
                              className="d-flex align-items-center justify-content-between gap-3 w-100 border-0 bg-transparent p-0 text-start"
                              disabled={leaving}
                              aria-label={`Open ${label} in Messages`}
                              onClick={() => openChannel(channel._id)}
                            >
                              <span className="text-dark fw-medium text-truncate" style={{ fontSize: '15px' }}>
                                {label}
                              </span>
                              <span className="text-secondary flex-shrink-0" style={{ fontSize: '13px' }}>
                                Open
                              </span>
                            </button>
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
            </div>

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
              {membersError ? (
                <LoadError message={membersError} onRetry={retry} />
              ) : members.length === 0 ? (
                <p className="text-secondary mb-0">No members to show.</p>
              ) : filteredMembers.length === 0 ? (
                <p className="text-secondary mb-0">No members match your search.</p>
              ) : (
                <>
                  <ul
                    className="list-unstyled d-flex flex-column gap-3 mb-0"
                    style={expandedListStyle(showAllMembers && hiddenMemberCount > 0)}
                  >
                    {visibleMembers.map((member) => {
                      const name = memberName(member);
                      return (
                        <li key={member.userId} className="d-flex align-items-center gap-3">
                          <div
                            aria-hidden="true"
                            className="rounded-circle d-flex align-items-center justify-content-center fw-bold flex-shrink-0"
                            style={{
                              width: '36px',
                              height: '36px',
                              backgroundColor: '#D4E4FC',
                              color: '#3046C3',
                              fontSize: '15px',
                            }}
                          >
                            {name.charAt(0).toUpperCase()}
                          </div>
                          <span className="text-dark fw-medium" style={{ fontSize: '15px' }}>
                            {name}
                          </span>
                          {member.role === 'OFFICER' && (
                            <Badge bg="warning-subtle" text="warning-emphasis" pill className="fw-semibold">
                              OFFICER
                            </Badge>
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
  );
}

export default function ClubInfoModal({ show, onHide, clubId, onLeft }: ClubInfoModalProps) {
  if (!show || !clubId) return null;
  return <ClubInfoContent clubId={clubId} onHide={onHide} onLeft={onLeft} />;
}
