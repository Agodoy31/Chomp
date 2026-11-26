import { useEffect, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Alert from 'react-bootstrap/Alert';
import Button from 'react-bootstrap/Button';
import { InfoCircle } from 'react-bootstrap-icons';
import { getClub, getClubChannels, getClubMembers, isUnauthorizedError } from '../api/clubApi';
import { fetchConversationDetails } from '../api/messagingApi';
import ConversationDetailsModal from '../components/Messaging/ConversationDetailsModal';
import MessageArea from '../components/Messaging/MessageArea';
import { clubChannelPath } from '../clubChannelPath';
import ClubInfoModal from '../components/modals/ClubInfoModal';
import { useAuth } from '../hooks/useAuth';
import type { ClubChannel, ClubDetails, ClubMember } from '../types/club';
import type { ConversationDetails } from '../types/Messaging/Conversation';
import './ClubViewPage.css';

type ClubLoad = {
  clubId: string;
  requestKey: number;
  club: ClubDetails | null;
  channels: ClubChannel[];
  officerIds: string[];
  error: string;
};

type DetailLoad = {
  channelId: string;
  requestKey: number;
  details: ConversationDetails | null;
  error: string;
};

function isAbort(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError';
}

function errorText(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

function channelLabel(title: string): string {
  const trimmed = title.trim();
  return trimmed.startsWith('#') ? trimmed : `# ${trimmed}`;
}

function FocusOnMount({ children }: { children: ReactNode }) {
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    node?.focus();
  }, [node]);
  return (
    <div ref={setNode} tabIndex={-1}>
      {children}
    </div>
  );
}

function moveChannelFocus(event: KeyboardEvent<HTMLButtonElement>, index: number, count: number) {
  const key = event.key;
  if (key !== 'ArrowDown' && key !== 'ArrowUp' && key !== 'Home' && key !== 'End') return;
  event.preventDefault();
  const buttons = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('button');
  if (!buttons?.length) return;
  const next =
    key === 'Home' ? 0 : key === 'End' ? count - 1 : key === 'ArrowDown' ? (index + 1) % count : (index - 1 + count) % count;
  buttons[next]?.focus();
}

function activeChannel(channels: ClubChannel[], selectedId: string | null): ClubChannel | null {
  return (
    channels.find((channel) => channel._id === selectedId) ??
    channels.find((channel) => channel.title.trim().toLowerCase() === 'general') ??
    channels[0] ??
    null
  );
}

function ClubView({ clubId, requestedChannelId }: { clubId: string; requestedChannelId: string }) {
  const navigate = useNavigate();
  const { user, loading: authLoading, setUser } = useAuth();
  const [clubLoad, setClubLoad] = useState<ClubLoad | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [showInfo, setShowInfo] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [detailLoad, setDetailLoad] = useState<DetailLoad | null>(null);
  const [detailReloadKey, setDetailReloadKey] = useState(0);

  const loadedClub = clubLoad?.clubId === clubId && clubLoad.requestKey === reloadKey ? clubLoad : null;
  const channel = activeChannel(loadedClub?.channels ?? [], requestedChannelId);
  const channelId = channel?._id ?? null;
  const loadedDetails =
    detailLoad?.channelId === channelId && detailLoad.requestKey === detailReloadKey ? detailLoad : null;
  const conversation = loadedDetails?.details ?? null;

  useEffect(() => {
    if (!authLoading && !user) navigate('/login');
  }, [authLoading, user, navigate]);

  useEffect(() => {
    if (authLoading || !user || !clubId) return;
    const controller = new AbortController();
    let ignore = false;

    Promise.all([
      getClub(clubId, controller.signal),
      getClubChannels(clubId, controller.signal),
      getClubMembers(clubId, controller.signal).catch((err: unknown) => {
        if (isUnauthorizedError(err) || isAbort(err)) throw err;
        return [] as ClubMember[];
      }),
    ])
      .then(([club, channels, members]) => {
        if (ignore) return;
        setClubLoad({
          clubId,
          requestKey: reloadKey,
          club,
          channels,
          officerIds: members
            .filter((member) => member.role === 'OFFICER')
            .map((member) => String(member.userId)),
          error: '',
        });
      })
      .catch((err: unknown) => {
        if (ignore || isAbort(err)) return;
        if (isUnauthorizedError(err)) {
          setUser(null);
          navigate('/login');
          return;
        }
        setClubLoad({
          clubId,
          requestKey: reloadKey,
          club: null,
          channels: [],
          officerIds: [],
          error: errorText(err, 'Could not load this club.'),
        });
      });

    return () => {
      ignore = true;
      controller.abort();
    };
  }, [authLoading, user, clubId, navigate, setUser, reloadKey]);

  useEffect(() => {
    if (!channelId) return;
    let ignore = false;

    fetchConversationDetails(channelId)
      .then((details) => {
        if (!ignore) setDetailLoad({ channelId, requestKey: detailReloadKey, details, error: '' });
      })
      .catch((err: unknown) => {
        if (ignore || isUnauthorizedError(err)) return;
        setDetailLoad({
          channelId,
          requestKey: detailReloadKey,
          details: null,
          error: errorText(err, 'Could not load this channel.'),
        });
      });

    return () => {
      ignore = true;
    };
  }, [channelId, detailReloadKey]);

  if (authLoading || !user) return null;

  if (!clubId) {
    return (
      <div className="p-4">
        <Alert variant="danger">Club not found.</Alert>
        <Link to="/myClubs" className="btn btn-outline-primary">
          My Clubs
        </Link>
      </div>
    );
  }

  if (!loadedClub) {
    return (
      <div className="d-flex h-100 align-items-center justify-content-center" role="status">
        <p className="h4 mb-0" style={{ color: '#3046C3' }}>
          Loading club...
        </p>
      </div>
    );
  }

  if (!loadedClub.club) {
    return (
      <FocusOnMount>
        <div className="p-4">
          <Alert variant="danger">{loadedClub.error || 'Could not load this club.'}</Alert>
          <div className="d-flex gap-2">
            <Button type="button" onClick={() => setReloadKey((key) => key + 1)}>
              Retry
            </Button>
            <Link to="/myClubs" className="btn btn-outline-primary">
              My Clubs
            </Link>
          </div>
        </div>
      </FocusOnMount>
    );
  }

  const club = loadedClub.club;
  const officerIds = loadedClub.officerIds;

  return (
    <div className="club-view">
      <a href="#club-messages" className="visually-hidden-focusable">
        Skip to messages
      </a>
      <div className="visually-hidden" aria-live="polite">
        {channel ? `Viewing ${channelLabel(channel.title)}` : 'This club has no channels yet.'}
      </div>
      <aside className="club-view__sidebar" aria-label={club.name}>
        <div className="club-view__identity">
          <h1 className="club-view__name text-truncate" title={club.name}>
            {club.name}
          </h1>
          <button
            type="button"
            className="club-view__info"
            aria-label={`About ${club.name}`}
            aria-haspopup="dialog"
            aria-expanded={showInfo}
            onClick={() => setShowInfo(true)}
          >
            <InfoCircle size={18} aria-hidden="true" />
          </button>
        </div>

        <p className="club-view__label">CHANNELS</p>
        <nav className="club-view__channels" aria-label="Channels">
          {loadedClub.channels.length === 0 ? (
            <p className="px-2 small mb-0">No channels yet</p>
          ) : (
            loadedClub.channels.map((item, index) => {
              const isActive = item._id === channel?._id;
              return (
                <button
                  key={item._id}
                  type="button"
                  className={`club-view__channel${isActive ? ' is-active' : ''}`}
                  aria-current={isActive ? 'page' : undefined}
                  onKeyDown={(event) => moveChannelFocus(event, index, loadedClub.channels.length)}
                  onClick={() => navigate(clubChannelPath(clubId, item._id))}
                >
                  {channelLabel(item.title)}
                </button>
              );
            })
          )}
        </nav>
      </aside>

      <section
        id="club-messages"
        tabIndex={-1}
        className="club-view__main"
        aria-label={channel ? channelLabel(channel.title) : club.name}
      >
        {channel ? (
          <MessageArea
            key={channel._id}
            headingLevel="h2"
            historyFocusable
            detailsExpanded={showDetails}
            conversation={conversation}
            isLoadingDetails={!loadedDetails}
            detailsError={loadedDetails?.error || null}
            onRetryDetails={() => setDetailReloadKey((key) => key + 1)}
            onOpenDetails={() => setShowDetails(true)}
            onMessageSent={() => undefined}
            isOfficer={(userId) => officerIds.includes(userId)}
          />
        ) : (
          <div className="d-flex flex-grow-1 align-items-center justify-content-center" role="status">
            <p className="text-muted mb-0">This club has no channels yet.</p>
          </div>
        )}
      </section>

      <ClubInfoModal
        show={showInfo}
        clubId={club._id}
        onHide={() => setShowInfo(false)}
        onLeft={() => navigate('/myClubs')}
      />
      <ConversationDetailsModal
        show={showDetails}
        onHide={() => setShowDetails(false)}
        conversation={conversation}
        onTitleUpdated={(conversationId, title) => {
          setDetailLoad((current) =>
            current?.details?._id === conversationId
              ? { ...current, details: { ...current.details, title, displayName: title } }
              : current
          );
        }}
      />
    </div>
  );
}

export default function ClubViewPage() {
  const { clubId = '', channelId = '' } = useParams();
  return <ClubView key={clubId} clubId={clubId} requestedChannelId={channelId} />;
}
