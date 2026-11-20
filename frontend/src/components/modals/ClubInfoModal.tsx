import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ComponentProps,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router-dom';
import Modal from 'react-bootstrap/Modal';
import Alert from 'react-bootstrap/Alert';
import { useAuth } from '../../hooks/useAuth';
import ClubSearch, { matchesSearch } from '../ClubSearch';
import {
  getClub,
  getClubChannels,
  getClubMembers,
  isUnauthorizedError,
  leaveClub,
} from '../../api/clubApi';
import type { ClubCategory, ClubChannel, ClubDetails, ClubMember } from '../../types/club';

const PREVIEW_COUNT = 3;
const VISIBLE_LIMIT = 3;

function useListLimit(count: number) {
  const ref = useRef<HTMLUListElement>(null);
  const [maxHeight, setMaxHeight] = useState<number>();

  useLayoutEffect(() => {
    const list = ref.current;
    const item = list?.children[VISIBLE_LIMIT - 1] as HTMLElement | undefined;
    if (!list || count <= VISIBLE_LIMIT || !item) {
      setMaxHeight(undefined);
      return;
    }
    setMaxHeight(item.offsetTop + item.offsetHeight);
  }, [count]);

  return { ref, maxHeight };
}

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

function useNarrowScreen() {
  const query = '(max-width: 576px)';
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  return matches;
}

function ClubInfoDialog({ style, ...props }: ComponentProps<typeof Modal.Dialog>) {
  const narrow = useNarrowScreen();

  return (
    <Modal.Dialog
      {...props}
      style={{
        width: narrow ? 'calc(100% - 1rem)' : 'calc(100% - 2rem)',
        maxWidth: narrow ? 'calc(100vw - 1rem)' : 'min(720px, calc(100vw - 2rem))',
        marginLeft: 'auto',
        marginRight: 'auto',
        fontFamily: 'Inter, system-ui, sans-serif',
        color: '#222',
        ...style,
      }}
    />
  );
}

const buttonFont: CSSProperties = { fontFamily: 'inherit' };

const leaveButtonStyle: CSSProperties = {
  ...buttonFont,
  borderRadius: 6,
  padding: '0.45rem 0.95rem',
  fontWeight: 600,
  fontSize: '0.95rem',
  background: '#e2554d',
  color: '#fff',
  border: 'none',
};

const cancelButtonStyle: CSSProperties = {
  ...buttonFont,
  borderRadius: 6,
  padding: '0.45rem 0.95rem',
  fontWeight: 600,
  fontSize: '0.95rem',
  background: '#fff',
  color: '#333',
  border: '1px solid #cfcfcf',
};

const moreButtonStyle: CSSProperties = {
  ...buttonFont,
  background: 'none',
  border: 'none',
  padding: 0,
  color: '#3a3a3a',
  fontSize: '0.78rem',
  whiteSpace: 'nowrap',
};

type ActionButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  base: CSSProperties;
  hover?: CSSProperties;
};

function ActionButton({ base, hover, disabled, style, children, ...props }: ActionButtonProps) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);

  return (
    <button
      {...props}
      disabled={disabled}
      onMouseEnter={(event) => {
        setHovered(true);
        props.onMouseEnter?.(event);
      }}
      onMouseLeave={(event) => {
        setHovered(false);
        props.onMouseLeave?.(event);
      }}
      onFocus={(event) => {
        setFocused(true);
        props.onFocus?.(event);
      }}
      onBlur={(event) => {
        setFocused(false);
        props.onBlur?.(event);
      }}
      style={{
        ...base,
        ...(hovered && !disabled ? hover : {}),
        ...(disabled ? { opacity: 0.65, cursor: 'not-allowed' } : {}),
        outline: focused ? '2px solid #3046c3' : 'none',
        outlineOffset: focused ? 2 : 0,
        ...style,
      }}
    >
      {children}
    </button>
  );
}

type SectionProps = {
  title: string;
  search?: ReactNode;
  children: ReactNode;
};

function Section({ title, search, children }: SectionProps) {
  const narrow = useNarrowScreen();

  return (
    <section style={{ border: '1px solid #d7d7d7', borderRadius: 4, background: '#fff', overflow: 'hidden' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.75rem',
          margin: 0,
          padding: '0.55rem 1rem',
          background: '#c5c6c7',
          borderBottom: '1px solid #e4e4e4',
          color: '#000',
          flexWrap: narrow ? 'wrap' : 'nowrap',
        }}
      >
        <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, flex: '0 0 auto' }}>{title}</h2>
        {search && (
          <div
            style={{
              flex: narrow ? '1 1 100%' : '1 1 140px',
              maxWidth: narrow ? 'none' : 220,
              minWidth: 0,
            }}
          >
            {search}
          </div>
        )}
      </div>
      <div style={{ padding: '1rem 1.1rem 0.95rem' }}>{children}</div>
    </section>
  );
}

function listStyle(maxHeight: number | undefined, gap?: string): CSSProperties {
  return {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    margin: 0,
    padding: 0,
    listStyle: 'none',
    gap,
    ...(maxHeight !== undefined
      ? { maxHeight, overflowY: 'auto', overscrollBehavior: 'contain' }
      : {}),
  };
}

export default function ClubInfoModal({ show, onHide, clubId, onLeft }: ClubInfoModalProps) {
  const navigate = useNavigate();
  const { setUser } = useAuth();

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

  useEffect(() => {
    if (!show || !clubId) return;
    const controller = new AbortController();

    async function load(id: string) {
      setLoadError('');
      setChannelsError('');
      setMembersError('');
      setLeaveError('');
      setConfirmingLeave(false);
      setClub(null);
      setChannels([]);
      setMembers([]);
      setShowAllChannels(false);
      setShowAllMembers(false);
      setChannelQuery('');
      setMemberQuery('');

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

      if (clubResult.status === 'rejected') {
        if (!isAbortError(clubResult.reason)) {
          setLoadError(errorMessage(clubResult.reason));
        }
      } else {
        setClub(clubResult.value);
      }

      if (channelResult.status === 'rejected') {
        if (!isAbortError(channelResult.reason)) {
          setChannelsError(errorMessage(channelResult.reason));
        }
      } else {
        setChannels(channelResult.value);
      }

      if (memberResult.status === 'rejected') {
        if (!isAbortError(memberResult.reason)) {
          setMembersError(errorMessage(memberResult.reason));
        }
      } else {
        setMembers(memberResult.value);
      }
    }

    load(clubId);

    return () => {
      controller.abort();
    };
  }, [show, clubId, reloadKey, navigate, setUser]);

  function reset() {
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

  const filteredChannels = channels.filter((channel) =>
    matchesSearch(channelQuery, channel.title, channelLabel(channel.title))
  );
  const filteredMembers = members.filter((member) =>
    matchesSearch(memberQuery, memberName(member), member.firstName, member.lastName)
  );
  const visibleChannels = showAllChannels ? filteredChannels : filteredChannels.slice(0, PREVIEW_COUNT);
  const visibleMembers = showAllMembers ? filteredMembers : filteredMembers.slice(0, PREVIEW_COUNT);
  const hiddenChannelCount = Math.max(filteredChannels.length - PREVIEW_COUNT, 0);
  const hiddenMemberCount = Math.max(filteredMembers.length - PREVIEW_COUNT, 0);
  const channelList = useListLimit(visibleChannels.length);
  const memberList = useListLimit(visibleMembers.length);
  const narrow = useNarrowScreen();

  return (
    <Modal
      show={show}
      onHide={() => {
        if (!leaving) onHide();
      }}
      onExited={reset}
      centered
      scrollable
      backdrop={leaving ? 'static' : true}
      keyboard={!leaving}
      dialogAs={ClubInfoDialog}
      contentClassName="border-0"
      aria-labelledby="club-info-title"
    >
      <Modal.Header closeButton={!leaving} className="border-0 pb-0" closeLabel="Close club information">
        <Modal.Title id="club-info-title" as="h2" className="visually-hidden">
          {club ? `${club.name} information` : 'Club information'}
        </Modal.Title>
      </Modal.Header>

      <Modal.Body style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', paddingTop: '0.25rem' }}>
        {show && clubId && !club && !loadError && (
          <p className="text-center text-secondary my-4" role="status">
            Loading club...
          </p>
        )}

        {loadError && (
          <Alert variant="danger" className="mb-0">
            <p className="mb-2">{loadError}</p>
            <ActionButton type="button" base={cancelButtonStyle} hover={{ background: '#f7f7f7' }} onClick={() => setReloadKey((key) => key + 1)}>
              Try again
            </ActionButton>
          </Alert>
        )}

        {club && (
          <>
            <Section title="Club Overview">
              <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.65rem' }}>
                <p style={{ margin: 0, color: '#3046c3', fontSize: '1.7rem', fontWeight: 700, lineHeight: 1.2 }}>
                  {club.name}
                </p>
                {club.category && (
                  <span
                    style={{
                      background: '#e6e4fb',
                      color: '#5c54b8',
                      borderRadius: 999,
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      padding: '0.22rem 0.75rem',
                    }}
                  >
                    {CATEGORY_LABEL[club.category] ?? club.category}
                  </span>
                )}
              </div>
              <p style={{ margin: '0.95rem 0 1.15rem', color: '#3f3f3f', whiteSpace: 'pre-wrap' }}>
                {club.description || 'No description yet.'}
              </p>
              <div
                style={{
                  display: 'flex',
                  alignItems: narrow ? 'stretch' : 'flex-end',
                  justifyContent: 'space-between',
                  gap: '1rem',
                  flexWrap: 'wrap',
                  minWidth: 0,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <p style={{ margin: '0 0 0.45rem', color: '#3a3a3a' }}>
                    Meeting time: {formatMeetingTime(club.meeting)}
                  </p>
                  <p style={{ margin: 0, color: '#3a3a3a' }}>
                    Meeting Location: {formatMeetingLocation(club.meeting)}
                  </p>
                </div>
                <div style={{ marginLeft: narrow ? 0 : 'auto', maxWidth: '100%' }}>
                  {confirmingLeave ? (
                    <>
                      <p
                        style={{
                          margin: '0 0 0.5rem',
                          color: '#555',
                          fontSize: '0.85rem',
                          textAlign: narrow ? 'left' : 'right',
                        }}
                      >
                        You&apos;ll lose access to this club&apos;s channels.
                      </p>
                      <div style={{ display: 'flex', justifyContent: narrow ? 'flex-start' : 'flex-end', gap: '0.5rem' }}>
                        <ActionButton
                          type="button"
                          base={cancelButtonStyle}
                          hover={{ background: '#f7f7f7' }}
                          disabled={leaving}
                          onClick={() => {
                            setConfirmingLeave(false);
                            setLeaveError('');
                          }}
                        >
                          Cancel
                        </ActionButton>
                        <ActionButton
                          type="button"
                          base={leaveButtonStyle}
                          hover={{ background: '#cf453e' }}
                          disabled={leaving}
                          onClick={confirmLeave}
                        >
                          {leaving ? 'Leaving...' : 'Leave Club'}
                        </ActionButton>
                      </div>
                    </>
                  ) : (
                    <ActionButton
                      type="button"
                      base={leaveButtonStyle}
                      hover={{ background: '#cf453e' }}
                      onClick={() => {
                        setLeaveError('');
                        setConfirmingLeave(true);
                      }}
                    >
                      Leave Club
                    </ActionButton>
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
              search={
                <ClubSearch
                  value={channelQuery}
                  onChange={setChannelQuery}
                  label="Search channels"
                  placeholder="Search channels"
                  size="sm"
                />
              }
            >
              {channelsError ? (
                <Alert variant="danger" className="mb-0">
                  {channelsError}
                </Alert>
              ) : channels.length === 0 ? (
                <p style={{ margin: 0, color: '#777' }}>No channels yet.</p>
              ) : filteredChannels.length === 0 ? (
                <p style={{ margin: 0, color: '#777' }}>No channels match your search.</p>
              ) : (
                <>
                  <ul ref={channelList.ref} style={listStyle(channelList.maxHeight, '0.65rem')}>
                    {visibleChannels.map((channel) => {
                      const label = channelLabel(channel.title);
                      return (
                        <li key={channel._id}>
                          <ActionButton
                            type="button"
                            disabled={leaving}
                            aria-label={`Open ${label} in Messages`}
                            onClick={() => openChannel(channel._id)}
                            base={{
                              ...buttonFont,
                              width: '100%',
                              display: 'flex',
                              alignItems: narrow ? 'flex-start' : 'center',
                              justifyContent: 'space-between',
                              flexDirection: narrow ? 'column' : 'row',
                              gap: narrow ? '0.25rem' : '1rem',
                              border: '1px solid #d5d5d5',
                              borderRadius: 8,
                              background: '#fff',
                              color: '#4a4a4a',
                              padding: '0.5rem 0.9rem',
                              textAlign: 'left',
                            }}
                            hover={{ background: '#fafafa' }}
                          >
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {label}
                            </span>
                            <span style={{ flexShrink: 0, color: '#5c5c5c' }}>Open in Messages →</span>
                          </ActionButton>
                        </li>
                      );
                    })}
                  </ul>
                  {hiddenChannelCount > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.35rem' }}>
                      <ActionButton
                        type="button"
                        base={moreButtonStyle}
                        hover={{ textDecoration: 'underline' }}
                        aria-expanded={showAllChannels}
                        aria-label={
                          showAllChannels
                            ? 'Show fewer channels'
                            : `See ${hiddenChannelCount} more channels`
                        }
                        onClick={() => setShowAllChannels((current) => !current)}
                      >
                        {showAllChannels ? 'Show less' : `See ${hiddenChannelCount} more`}
                      </ActionButton>
                    </div>
                  )}
                </>
              )}
            </Section>

            <Section
              title={membersError ? 'Members' : `Members (${members.length})`}
              search={
                <ClubSearch
                  value={memberQuery}
                  onChange={setMemberQuery}
                  label="Search members"
                  placeholder="Search members"
                  size="sm"
                />
              }
            >
              {membersError ? (
                <Alert variant="danger" className="mb-0">
                  {membersError}
                </Alert>
              ) : members.length === 0 ? (
                <p style={{ margin: 0, color: '#777' }}>No members to show.</p>
              ) : filteredMembers.length === 0 ? (
                <p style={{ margin: 0, color: '#777' }}>No members match your search.</p>
              ) : (
                <>
                  <ul ref={memberList.ref} style={listStyle(memberList.maxHeight)}>
                    {visibleMembers.map((member) => (
                      <li
                        key={member.userId}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.6rem',
                          padding: '0.8rem 0.15rem',
                          borderBottom: '1px solid #e5e5e5',
                          color: '#333',
                        }}
                      >
                        <span>{memberName(member)}</span>
                        {member.role === 'OFFICER' && (
                          <span
                            style={{
                              background: '#ffedd5',
                              color: '#c2410c',
                              borderRadius: 999,
                              fontSize: '0.68rem',
                              fontWeight: 700,
                              letterSpacing: '0.03em',
                              padding: '0.18rem 0.5rem',
                            }}
                          >
                            OFFICER
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                  {hiddenMemberCount > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.35rem' }}>
                      <ActionButton
                        type="button"
                        base={moreButtonStyle}
                        hover={{ textDecoration: 'underline' }}
                        aria-expanded={showAllMembers}
                        aria-label={
                          showAllMembers
                            ? 'Show fewer members'
                            : `See ${hiddenMemberCount} more members`
                        }
                        onClick={() => setShowAllMembers((current) => !current)}
                      >
                        {showAllMembers ? 'Show less' : `See ${hiddenMemberCount} more`}
                      </ActionButton>
                    </div>
                  )}
                </>
              )}
            </Section>
          </>
        )}
      </Modal.Body>
    </Modal>
  );
}
