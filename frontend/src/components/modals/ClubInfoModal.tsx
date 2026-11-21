import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import Alert from 'react-bootstrap/Alert';
import Badge from 'react-bootstrap/Badge';
import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';
import Modal from 'react-bootstrap/Modal';
import { Search } from 'react-bootstrap-icons';
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

function Section({ title, search, children }: { title: string; search?: ReactNode; children: ReactNode }) {
  return (
    <section className="border rounded overflow-hidden">
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 px-3 py-2 bg-light border-bottom">
        <h3 className="h5 mb-0">{title}</h3>
        {search}
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

function expandedListStyle(scroll: boolean) {
  if (!scroll) return undefined;
  return {
    maxHeight: EXPANDED_LIST_MAX_HEIGHT,
    overflowY: 'auto' as const,
    overscrollBehavior: 'contain' as const,
  };
}

export default function ClubInfoModal({ show, onHide, clubId, onLeft }: ClubInfoModalProps) {
  const navigate = useNavigate();
  const { setUser } = useAuth();
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
    if (!show || !clubId) return;
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
  }, [show, clubId, reloadKey, navigate, setUser, reset]);

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
    if (!clubId || leaving) return;
    setLeaving(true);
    setLeaveError('');

    try {
      await leaveClub(clubId);
      onLeft?.(clubId);
      onHide();
    } catch (err) {
      if (isUnauthorizedError(err)) {
        setUser(null);
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

  return (
    <Modal
      show={show}
      onHide={() => {
        if (!leaving) onHide();
      }}
      onExited={reset}
      centered
      scrollable
      size="lg"
      backdrop={leaving ? 'static' : true}
      keyboard={!leaving}
      aria-labelledby="club-info-title"
    >
      <Modal.Header closeButton={!leaving} closeLabel="Close club information">
        <Modal.Title ref={titleRef} id="club-info-title" as="h2" tabIndex={-1} className="h4 mb-0">
          {club ? club.name : 'Club information'}
        </Modal.Title>
      </Modal.Header>

      <Modal.Body className="d-flex flex-column gap-4">
        {show && clubId && !club && !loadError && (
          <p className="text-center text-secondary my-4" role="status">
            Loading club...
          </p>
        )}

        {loadError && (
          <Alert variant="danger" className="mb-0">
            <p className="mb-2">{loadError}</p>
            <Button type="button" variant="outline-secondary" onClick={retry}>
              Try again
            </Button>
          </Alert>
        )}

        {club && (
          <>
            <Section title="Club Overview">
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
                          variant="danger"
                          className="fw-semibold"
                          disabled={leaving}
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
              </div>
              {leaveError && (
                <Alert variant="danger" className="py-2 px-3 mt-3 mb-0">
                  {leaveError}
                </Alert>
              )}
            </Section>

            <Section
              title="Channels"
              search={<ListSearch value={channelQuery} onChange={setChannelQuery} label="Search channels" />}
            >
              <p className="visually-hidden" aria-live="polite">
                {channelsError ? '' : matchCount(filteredChannels.length, 'channel', 'channels', channelQuery)}
              </p>
              {channelsError ? (
                <Alert variant="danger" className="mb-0">
                  {channelsError}
                </Alert>
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
                      return (
                        <li key={channel._id}>
                          <Button
                            type="button"
                            variant="outline-secondary"
                            className="w-100 d-flex flex-column flex-sm-row align-items-stretch align-items-sm-center justify-content-between gap-1 gap-sm-3 text-start"
                            disabled={leaving}
                            aria-label={`Open ${label} in Messages`}
                            onClick={() => openChannel(channel._id)}
                          >
                            <span className="text-truncate min-w-0">{label}</span>
                            <span className="flex-shrink-0">Open in Messages →</span>
                          </Button>
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
              {membersError ? (
                <Alert variant="danger" className="mb-0">
                  {membersError}
                </Alert>
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
                      <li key={member.userId} className="list-group-item d-flex align-items-center gap-2 px-0">
                        <span>{memberName(member)}</span>
                        {member.role === 'OFFICER' && (
                          <Badge bg="warning-subtle" text="warning-emphasis" pill className="fw-semibold">
                            OFFICER
                          </Badge>
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
  );
}
