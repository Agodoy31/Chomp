import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Alert from 'react-bootstrap/Alert';
import Button from 'react-bootstrap/Button';
import { approveClub, getPendingClubs, isUnauthorizedError, rejectClub } from '../api/clubApi';
import { useAuth } from '../hooks/useAuth';
import type { Club, ClubCategory } from '../types/club';

const CATEGORY_LABEL: Record<ClubCategory, string> = {
  ACADEMIC: 'Academic',
  CULTURAL: 'Cultural',
  SPORTS: 'Sports',
  OTHER: 'Other',
};

function meetingTime(club: Club) {
  return [club.meeting?.day, club.meeting?.time].filter(Boolean).join(' ');
}

function nextClubId(clubs: Club[], removedId: string): string {
  const index = clubs.findIndex((item) => item._id === removedId);
  if (index < 0) return '';
  const next = clubs[index + 1] ?? clubs[index - 1];
  return next?._id ?? '';
}

function PendingClubCard({
  club,
  disabled,
  onDecide,
}: {
  club: Club;
  disabled: boolean;
  onDecide: (club: Club, action: 'approve' | 'reject') => void;
}) {
  const time = meetingTime(club);
  const location = club.meeting?.location;

  return (
    <article className="bg-white rounded-3 p-3 p-md-4" style={{ border: '1px solid #c8c8c8' }}>
      <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
        <h2
          id={`club-heading-${club._id}`}
          tabIndex={-1}
          className="h5 mb-0"
          style={{ color: '#3046C3', fontStyle: 'italic', fontWeight: 700 }}
        >
          {club.name}
        </h2>
        <span
          className="badge rounded-pill fw-normal"
          style={{ backgroundColor: '#E6E4F6', color: '#6A6790' }}
        >
          {CATEGORY_LABEL[club.category] ?? club.category}
        </span>
      </div>

      <p className="mb-3">{club.description}</p>

      <div className="d-flex flex-wrap justify-content-between align-items-start gap-3">
        <div>
          <p className="mb-1">Meeting time: {time || 'Not set'}</p>
          <p className="mb-0">Meeting Location: {location || 'Not set'}</p>
        </div>
        <div className="d-flex gap-2 ms-auto">
          <Button
            type="button"
            variant="danger"
            size="sm"
            disabled={disabled}
            aria-busy={disabled}
            aria-label={`Reject ${club.name}`}
            onClick={() => onDecide(club, 'reject')}
          >
            Reject Club
          </Button>
          <Button
            type="button"
            size="sm"
            className="text-white border-0"
            style={{ backgroundColor: '#3046C3' }}
            disabled={disabled}
            aria-busy={disabled}
            aria-label={`Approve ${club.name}`}
            onClick={() => onDecide(club, 'approve')}
          >
            Approve Club
          </Button>
        </div>
      </div>
    </article>
  );
}

export default function ClubReview() {
  const navigate = useNavigate();
  const { user, loading, setUser } = useAuth();

  const [clubs, setClubs] = useState<Club[]>([]);
  const [clubsLoading, setClubsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [focusNonce, setFocusNonce] = useState(0);
  const busyRef = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const focusNextRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    if (focusNextRef.current === null) return;
    const nextId = focusNextRef.current;
    focusNextRef.current = null;
    const target = nextId ? document.getElementById(`club-heading-${nextId}`) : headingRef.current;
    target?.focus();
  }, [focusNonce]);

  useEffect(() => {
    if (loading) return;

    if (!user) {
      navigate('/login', { replace: true });
      return;
    }
    if (!user.isAdmin) {
      navigate('/myClubs', { replace: true });
      return;
    }

    let cancelled = false;

    async function loadPending() {
      try {
        const pending = await getPendingClubs();
        if (!cancelled) setClubs(pending);
      } catch (err) {
        if (cancelled) return;
        if (isUnauthorizedError(err)) {
          setUser(null);
          navigate('/login', { replace: true });
          return;
        }
        setLoadError(err instanceof Error ? err.message : 'Could not load club requests.');
      } finally {
        if (!cancelled) setClubsLoading(false);
      }
    }

    loadPending();
    return () => {
      cancelled = true;
    };
  }, [loading, user, navigate, setUser]);

  function moveFocus(id: string) {
    focusNextRef.current = id;
    setFocusNonce((nonce) => nonce + 1);
  }

  function dropClub(removedId: string) {
    moveFocus(nextClubId(clubs, removedId));
    setClubs((current) => current.filter((item) => item._id !== removedId));
  }

  async function decide(club: Club, action: 'approve' | 'reject') {
    if (busyRef.current) return;
    document.getElementById(`club-heading-${club._id}`)?.focus();
    busyRef.current = true;
    setBusy(true);
    setActionError('');
    setStatus('');

    try {
      if (action === 'approve') await approveClub(club._id);
      else await rejectClub(club._id);

      dropClub(club._id);
      setStatus(`${action === 'approve' ? 'Approved' : 'Rejected'} ${club.name}.`);
    } catch (err) {
      if (isUnauthorizedError(err)) {
        setUser(null);
        navigate('/login', { replace: true });
        return;
      }

      const statusCode = err instanceof Error ? (err as { status?: number }).status : undefined;
      const code = err instanceof Error ? (err as { code?: string }).code : undefined;
      // A name clash leaves the request pending. A missing or already decided club comes off the queue.
      if (statusCode === 404 || code === 'ERR_CLUB_NOT_PENDING') {
        dropClub(club._id);
      } else {
        moveFocus(club._id);
      }
      setActionError(err instanceof Error ? err.message : `Could not ${action} this club.`);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  if (loading || !user?.isAdmin) return null;

  const showEmpty = !clubsLoading && !loadError && clubs.length === 0;

  return (
    <section aria-labelledby="club-approvals-heading" className="px-3 px-lg-5 py-4">
      <h1
        id="club-approvals-heading"
        ref={headingRef}
        tabIndex={-1}
        className="fw-bold mb-4"
        style={{ color: '#3046C3', fontFamily: 'Inter' }}
      >
        Club Approvals
      </h1>
      <p className="visually-hidden" role="status" aria-live="polite">
        {status}
      </p>

      {loadError && (
        <Alert variant="danger" className="mb-4">
          {loadError}
        </Alert>
      )}

      {actionError && (
        <Alert variant="danger" className="mb-4" dismissible onClose={() => setActionError('')}>
          {actionError}
        </Alert>
      )}

      {clubsLoading && (
        <p role="status" aria-live="polite" className="h5" style={{ color: '#3046C3' }}>
          Loading club requests...
        </p>
      )}

      {showEmpty && <p className="text-muted mb-0">No clubs are waiting for review.</p>}

      {clubs.length > 0 && (
        <ul className="list-unstyled d-flex flex-column gap-4 mb-0">
          {clubs.map((club) => (
            <li key={club._id}>
              <PendingClubCard club={club} disabled={busy} onDecide={decide} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
