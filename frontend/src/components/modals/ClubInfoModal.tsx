import { useEffect, useState, type ReactNode } from 'react';
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
import './ClubInfoModal.css';

const PREVIEW_COUNT = 3;

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

type SectionProps = {
  title: string;
  children: ReactNode;
};

function Section({ title, children }: SectionProps) {
  return (
    <section className="club-info-section">
      <h2 className="club-info-section-title">{title}</h2>
      <div className="club-info-section-body">{children}</div>
    </section>
  );
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

  const visibleChannels = showAllChannels ? channels : channels.slice(0, PREVIEW_COUNT);
  const visibleMembers = showAllMembers ? members : members.slice(0, PREVIEW_COUNT);
  const hiddenChannelCount = Math.max(channels.length - PREVIEW_COUNT, 0);
  const hiddenMemberCount = Math.max(members.length - PREVIEW_COUNT, 0);

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
      dialogClassName="club-info-dialog"
      contentClassName="club-info-modal"
      aria-labelledby="club-info-title"
    >
      <Modal.Header closeButton={!leaving} className="border-0 pb-0" closeLabel="Close club information">
        <Modal.Title id="club-info-title" as="h2" className="visually-hidden">
          {club ? `${club.name} information` : 'Club information'}
        </Modal.Title>
      </Modal.Header>

      <Modal.Body className="club-info-body">
        {show && clubId && !club && !loadError && (
          <p className="text-center text-secondary my-4" role="status">
            Loading club...
          </p>
        )}

        {loadError && (
          <Alert variant="danger" className="mb-0">
            <p className="mb-2">{loadError}</p>
            <button
              type="button"
              className="club-info-cancel"
              onClick={() => setReloadKey((key) => key + 1)}
            >
              Try again
            </button>
          </Alert>
        )}

        {club && (
          <>
            <Section title="Club Overview">
              <div className="club-info-heading">
                <p className="club-info-name">{club.name}</p>
                {club.category && (
                  <span className="club-info-category">
                    {CATEGORY_LABEL[club.category] ?? club.category}
                  </span>
                )}
              </div>
              <p className="club-info-description">{club.description || 'No description yet.'}</p>
              <div className="club-info-meeting">
                <div>
                  <p>Meeting time: {formatMeetingTime(club.meeting)}</p>
                  <p>Meeting Location: {formatMeetingLocation(club.meeting)}</p>
                </div>
                <div className="club-info-leave-wrap">
                  {confirmingLeave ? (
                    <>
                      <p className="club-info-leave-note">
                        You&apos;ll lose access to this club&apos;s channels.
                      </p>
                      <div className="club-info-actions">
                        <button
                          type="button"
                          className="club-info-cancel"
                          disabled={leaving}
                          onClick={() => {
                            setConfirmingLeave(false);
                            setLeaveError('');
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="club-info-leave"
                          disabled={leaving}
                          onClick={confirmLeave}
                        >
                          {leaving ? 'Leaving...' : 'Leave Club'}
                        </button>
                      </div>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="club-info-leave"
                      onClick={() => {
                        setLeaveError('');
                        setConfirmingLeave(true);
                      }}
                    >
                      Leave Club
                    </button>
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
                <p className="club-info-empty">No channels yet.</p>
              ) : (
                <>
                  <ul className="club-info-channels">
                    {visibleChannels.map((channel) => {
                      const label = channelLabel(channel.title);
                      return (
                        <li key={channel._id}>
                          <button
                            type="button"
                            className="club-info-channel"
                            disabled={leaving}
                            aria-label={`Open ${label} in Messages`}
                            onClick={() => openChannel(channel._id)}
                          >
                            <span className="club-info-channel-name">{label}</span>
                            <span className="club-info-channel-action">Open in Messages →</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  {hiddenChannelCount > 0 && (
                    <div className="club-info-more-row">
                      <button
                        type="button"
                        className="club-info-more"
                        aria-expanded={showAllChannels}
                        onClick={() => setShowAllChannels((current) => !current)}
                      >
                        {showAllChannels ? 'Show less' : `See ${hiddenChannelCount} more`}
                        <span className="visually-hidden"> channels</span>
                      </button>
                    </div>
                  )}
                </>
              )}
            </Section>

            <Section title={membersError ? 'Members' : `Members (${members.length})`}>
              {membersError ? (
                <Alert variant="danger" className="mb-0">
                  {membersError}
                </Alert>
              ) : members.length === 0 ? (
                <p className="club-info-empty">No members to show.</p>
              ) : (
                <>
                  <ul className="club-info-members">
                    {visibleMembers.map((member) => (
                      <li key={member.userId} className="club-info-member">
                        <span>{memberName(member)}</span>
                        {member.role === 'OFFICER' && (
                          <span className="club-info-officer">OFFICER</span>
                        )}
                      </li>
                    ))}
                  </ul>
                  {hiddenMemberCount > 0 && (
                    <div className="club-info-more-row">
                      <button
                        type="button"
                        className="club-info-more"
                        aria-expanded={showAllMembers}
                        onClick={() => setShowAllMembers((current) => !current)}
                      >
                        {showAllMembers ? 'Show less' : `See ${hiddenMemberCount} more`}
                        <span className="visually-hidden"> members</span>
                      </button>
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
