import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Alert from 'react-bootstrap/Alert';
import Button from 'react-bootstrap/Button';
import Modal from 'react-bootstrap/Modal';
import ClubCard from '../components/ClubCard';
import type { Club } from '../types/club';
import { useAuth } from '../hooks/useAuth';
import ClubInfoModal from '../components/modals/ClubInfoModal';


async function readJson(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}


export default function MyClubs() {
  const navigate = useNavigate();
  const [infoClubId, setInfoClubId] = useState<string | null>(null);
  const { user, loading, setUser } = useAuth();

  const [clubs, setClubs] = useState<Club[]>([]);
  const [clubsLoading, setClubsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const [clubToLeave, setClubToLeave] = useState<Club | null>(null);
  const [leaving, setLeaving] = useState(false);

  const headingRef = useRef<HTMLHeadingElement>(null);
  const shouldFocusHeadingRef = useRef(false);
  const successTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);


  useEffect(() => {
    if (loading) return;

    if (!user) {
      navigate('/login');
      return;
    }
    
    async function fetchMyClubs() {
      try {
        const response = await fetch('/api/clubs/me', { credentials: 'include' });
        const data = await readJson(response);

        if (response.status === 401) {
          setUser(null);
          navigate('/login');
          return;
        }
        if (!response.ok) {
          throw new Error(data?.message || `Could not load your clubs (error ${response.status}).`);
        }

        setClubs(data?.clubs ?? []);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : 'An error occurred while loading your clubs.');
      } finally {
        setClubsLoading(false);
      }
    }

    fetchMyClubs();
    
  }, [loading, user, navigate, setUser]);

  useEffect(() => {
    return () => clearTimeout(successTimer.current);
  }, []);

  function showSuccess(message: string) {
    setSuccessMsg(message);
    clearTimeout(successTimer.current);
    successTimer.current = setTimeout(() => setSuccessMsg(''), 5000);
  }


  async function confirmLeave() {
    if (!clubToLeave) return;

    setLeaving(true);
    setActionError('');
    setSuccessMsg('');
    clearTimeout(successTimer.current);

    try {
      const response = await fetch(`/api/clubs/${clubToLeave._id}/leave`, {
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
        throw new Error(data?.message || 'Failed to leave club.');
      }
      
      const leftId = clubToLeave._id;
      showSuccess(`You left ${clubToLeave.name}.`);
      setClubs((current) => current.filter((club) => club._id !== leftId));
      shouldFocusHeadingRef.current = true;
    } 
    catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to leave club.');
    } 
    finally {
      setLeaving(false);
      setClubToLeave(null);
    }
  }

  const showEmpty = !clubsLoading && !loadError && clubs.length === 0;

  return (
    <div className="container py-5">
      <h1
        ref={headingRef}
        tabIndex={-1}
        className="fw-bold mb-4 p-4"
        style={{ 
            color: '#3046C3', 
            fontFamily: 'Inter',
         }}
      >
        My Clubs
      </h1>

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

      {successMsg && (
        <Alert variant="success" className="mb-4">
          {successMsg}
        </Alert>
      )}

      {clubsLoading && (
        <div className="text-center py-5" style={{ color: '#3046C3' }}>
          <p role="status" aria-live="polite" className="h4">
            Loading your clubs...
          </p>
        </div>
      )}

      {showEmpty && (
        <div className="text-center text-muted py-5">
          <p className="fs-7 mb-3">You haven't joined any clubs yet.</p>
          <Link to="/clubs" className="btn btn-primary rounded-pill px-4">
            Browse all clubs
          </Link>
        </div>
      )}

      {clubs.length > 0 && (
        <div className="row g-4">
          {clubs.map((club) => (
            <div key={club._id} className="col-12 col-md-6 col-lg-4">
              <ClubCard club={club} onLeave={setClubToLeave}
                onOpen={(clubId) => setInfoClubId(clubId)}
              />
            </div>
          ))}
        </div>
      )}

      <ClubInfoModal
        show={infoClubId !== null}
        clubId={infoClubId}
        onHide={() => setInfoClubId(null)}
        onLeft={(leftId) => setClubs((current) => current.filter((club) => club._id !== leftId))}
      />

       {/* Confirm before leaving, since it removes the student from the club chat */}
      <Modal
        show={clubToLeave !== null} 
        onHide={() => !leaving && setClubToLeave(null)} 
        onExited={() => {
          if (shouldFocusHeadingRef.current) {
            shouldFocusHeadingRef.current = false;
            headingRef.current?.focus();
          }
        }}
        centered

        >
        <Modal.Header closeButton={!leaving}>
          <Modal.Title>Leave {clubToLeave?.name}?</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          You'll lose access to this club's chat. You can join again later from All Clubs.
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" disabled={leaving} onClick={() => setClubToLeave(null)}>
            Cancel
          </Button>
          <Button variant="danger" disabled={leaving} onClick={confirmLeave}>
            {leaving ? 'Leaving...' : 'Leave club'}
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}
