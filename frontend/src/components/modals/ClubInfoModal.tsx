import {
  useCallback,
  useEffect,
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
import {
  getClub,
  getClubChannels,
  getClubMembers,
  isUnauthorizedError,
  leaveClub,
} from '../../api/clubApi';
import type { ClubCategory, ClubChannel, ClubDetails, ClubMember } from '../../types/club';

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

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ border: '1px solid #d7d7d7', borderRadius: 4, background: '#fff', overflow: 'hidden' }}>
      <h2
        style={{
          margin: 0,
          padding: '0.55rem 1rem',
          background: '#c5c6c7',
          borderBottom: '1px solid #e4e4e4',
          color: '#000',
          fontSize: '1.15rem',
          fontWeight: 700,
        }}
      >
        {title}
      </h2>
      <div style={{ padding: '1rem 1.1rem 0.95rem' }}>{children}</div>
    </section>
  );
}

const listStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  margin: 0,
  padding: 0,
  listStyle: 'none',
};

export default function ClubInfoModal({ show, onHide, clubId, onLeft }: ClubInfoModalProps) {
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const narrow = useNarrowScreen();

  const [club, setClub] = useState<ClubDetails | null>(null);
  const [channels, setChannels] = useState<ClubChannel[]>([]);
  const [members, setMembers] = useState<ClubMember[]>([]);
  const [loadError, setLoadError] = useState('');
  const [channelsError, setChannelsError] = useState('');
  const [membersError, setMembersError] = useState('');
  const [leaveError, setLeaveError] = useState('');
  const [confirmingLeave, setConfirmingLeave] = useState(false);
  const [leaving, setLeaving] = useState(false);
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

            <Section title="Channels">
              {channelsError ? (
                <Alert variant="danger" className="mb-0">
                  {channelsError}
                </Alert>
              ) : channels.length === 0 ? (
                <p style={{ margin: 0, color: '#777' }}>No channels yet.</p>
              ) : (
                <ul style={listStyle}>
                  {channels.map((channel) => (
                    <li
                      key={channel._id}
                      style={{
                        padding: '0.55rem 0.15rem',
                        borderBottom: '1px solid #e5e5e5',
                        color: '#333',
                      }}
                    >
                      {channelLabel(channel.title)}
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section title={membersError ? 'Members' : `Members (${members.length})`}>
              {membersError ? (
                <Alert variant="danger" className="mb-0">
                  {membersError}
                </Alert>
              ) : members.length === 0 ? (
                <p style={{ margin: 0, color: '#777' }}>No members to show.</p>
              ) : (
                <ul style={listStyle}>
                  {members.map((member) => (
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
              )}
            </Section>
          </>
        )}
      </Modal.Body>
    </Modal>
  );
}
