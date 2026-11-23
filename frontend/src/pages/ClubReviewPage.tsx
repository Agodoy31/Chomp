import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Alert from 'react-bootstrap/Alert';
import Button from 'react-bootstrap/Button';
import { useAuth } from '../hooks/useAuth';
import type { Club, ClubCategory } from '../types/club';

const CATEGORY_LABEL: Record<ClubCategory, string> = {
  ACADEMIC: 'Academic',
  CULTURAL: 'Cultural',
  SPORTS: 'Sports',
  OTHER: 'Other',
};

async function readJson(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function meetingTime(club: Club) {
  return [club.meeting?.day, club.meeting?.time].filter(Boolean).join(' ');
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
        <h2 className="h5 mb-0" style={{ color: '#3046C3', fontStyle: 'italic', fontWeight: 700 }}>
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
          <p className="mb-1">Meeting time:{time ? ` ${time}` : ''}</p>
          <p className="mb-0">Meeting Location:{location ? ` ${location}` : ''}</p>
        </div>
        <div className="d-flex gap-2 ms-auto">
          <Button
            type="button"
            id={`reject-${club._id}`}
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
  const busyRef = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const focusNextRef = useRef<string | null>(null);

  useEffect(() => {
    if (focusNextRef.current === null) return;
    const nextId = focusNextRef.current;
    focusNextRef.current = null;
    if (nextId) {
      document.getElementById(`reject-${nextId}`)?.focus();
      return;
    }
    headingRef.current?.focus();
  }, [clubs]);

  useEffect(() => {
    if (loading) return;

    if (!user) {
      navigate('/login');
      return;
    }
    if (!user.isAdmin) {
      navigate('/myClubs');
      return;
    }

    let cancelled = false;

    async function loadPending() {
      try {
        const response = await fetch('/api/clubs/pending', { credentials: 'include' });
        const data = await readJson(response);
        if (cancelled) return;

        if (response.status === 401) {
          setUser(null);
          navigate('/login');
          return;
        }
        if (!response.ok) {
          throw new Error(data?.message || 'Could not load club requests.');
        }

        setClubs(data?.clubs ?? []);
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Could not load club requests.');
        }
      } finally {
        if (!cancelled) setClubsLoading(false);
      }
    }

    loadPending();
    return () => {
      cancelled = true;
    };
  }, [loading, user, navigate, setUser]);

  function dropClub(removedId: string) {
    setClubs((current) => {
      const index = current.findIndex((item) => item._id === removedId);
      const next = current[index + 1] ?? current[index - 1];
      focusNextRef.current = next?._id ?? '';
      return current.filter((item) => item._id !== removedId);
    });
  }

  async function decide(club: Club, action: 'approve' | 'reject') {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setActionError('');

    try {
      const response = await fetch(`/api/clubs/${encodeURIComponent(club._id)}/${action}`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await readJson(response);

      if (response.status === 401) {
        setUser(null);
        navigate('/login');
        return;
      }
      if (!response.ok) {
        // A name clash leaves the request pending. Any other miss means another admin already decided it.
        if (response.status === 404 || data?.code === 'ERR_CLUB_NOT_PENDING') {
          dropClub(club._id);
        }
        throw new Error(data?.message || `Could not ${action} this club.`);
      }

      dropClub(club._id);
      setStatus(`${action === 'approve' ? 'Approved' : 'Rejected'} ${club.name}.`);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : `Could not ${action} this club.`);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  if (loading || !user?.isAdmin) return null;

  const showEmpty = !clubsLoading && !loadError && clubs.length === 0;
  const announcement = clubsLoading
    ? 'Loading club requests...'
    : [status, showEmpty ? 'No clubs are waiting for review.' : ''].filter(Boolean).join(' ');

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
        {announcement}
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
        <p aria-hidden="true" className="h5" style={{ color: '#3046C3' }}>
          Loading club requests...
        </p>
      )}

      {showEmpty && (
        <p aria-hidden="true" className="text-muted mb-0">
          No clubs are waiting for review.
        </p>
      )}

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
