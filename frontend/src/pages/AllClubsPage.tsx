import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Alert from 'react-bootstrap/Alert';
import ClubCard from '../components/ClubCard';
import { getClubs } from '../api/clubApi';
import { useAuth } from '../hooks/useAuth';
import type { Club } from '../types/club';

export default function AllClubs() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  const [clubs, setClubs] = useState<Club[]>([]);
  const [clubsLoading, setClubsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

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

    async function loadClubs() {
      try {
        const approved = await getClubs();
        if (!cancelled) setClubs(approved);
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Could not load clubs.');
        }
      } finally {
        if (!cancelled) setClubsLoading(false);
      }
    }

    loadClubs();
    return () => {
      cancelled = true;
    };
  }, [loading, user, navigate]);

  if (loading || !user?.isAdmin) return null;

  const showEmpty = !clubsLoading && !loadError && clubs.length === 0;

  return (
    <section aria-labelledby="all-clubs-heading" className="px-3 px-lg-5 py-4">
      <h1
        id="all-clubs-heading"
        className="fw-bold mb-4"
        style={{ color: '#3046C3', fontFamily: 'Inter' }}
      >
        All Clubs
      </h1>

      {loadError && (
        <Alert variant="danger" className="mb-4">
          {loadError}
        </Alert>
      )}

      {clubsLoading && (
        <p role="status" aria-live="polite" className="h5" style={{ color: '#3046C3' }}>
          Loading clubs...
        </p>
      )}

      {showEmpty && <p className="text-muted mb-0">No approved clubs yet.</p>}

      {clubs.length > 0 && (
        <div className="row g-4">
          {clubs.map((club) => (
            <div key={club._id} className="col-12 col-md-6 col-lg-4">
              <ClubCard club={club} onOpen={(clubId) => navigate(`/clubs/${clubId}`)} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
