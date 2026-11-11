import { useNavigate } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import ClubCard from '../components/ClubCard';
import type { Club, ClubCategory } from '../types/club';
import Header from '../components/Header';
import Alert from 'react-bootstrap/Alert';
import Form from 'react-bootstrap/Form';
import Button from 'react-bootstrap/Button';
import { Search, X } from 'react-bootstrap-icons';
import './ClubDiscovery.css';



const CATEGORY_FILTERS: { value: ClubCategory; label: string }[] = [
    { value: 'ACADEMIC', label: 'Academic' },
    { value: 'CULTURAL', label: 'Cultural' },
    { value: 'SPORTS', label: 'Sports' },
    { value: 'OTHER', label: 'Other' },
]

async function readJson(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export default function ClubDiscovery() {
  const navigate = useNavigate();
  const [clubs, setClubs] = useState<Club[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [loadError, setLoadError] = useState('');
  const [joinError, setJoinError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [query, setQuery] = useState('');
  const [categories, setCategories] = useState<ClubCategory[]>([]);

  const searchRef = useRef<HTMLInputElement>(null);
  const successTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const controller = new AbortController();

    async function fetchClubs() {
      setLoadError('');

      try {
        const params = new URLSearchParams();
        categories.forEach((cat) => params.append('category', cat));

        const url = `/api/clubs${params.toString() ? `?${params.toString()}` : ''}`;
        
        const response = await fetch(url, {
          method: 'GET',
          credentials: 'include',
          signal: controller.signal,
        });
        
        const data = await readJson(response);

        if (!response.ok) {
          throw new Error(data?.message || `Could not load clubs (error ${response.status}).`);
        }

        setClubs(data?.clubs ?? []);
      } catch (err: unknown) {
        if (!(err instanceof Error && err.name === 'AbortError')) {
          setLoadError(err instanceof Error ? err.message : 'An error occurred while fetching clubs.');
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    const timer = setTimeout(fetchClubs, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [categories]);

  useEffect(() => {
    return () => clearTimeout(successTimer.current);
  }, []);

  function showSuccess(message: string) {
    setSuccessMsg(message);
    clearTimeout(successTimer.current);
    successTimer.current = setTimeout(() => setSuccessMsg(''), 5000);
  }

  async function handleJoin(clubId: string) {
    setJoinError('');
    setSuccessMsg('');
    clearTimeout(successTimer.current);

    try {
      const response = await fetch(`/api/clubs/${clubId}/join`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await readJson(response);

      if (response.status === 401) {
        navigate('/login');
        return;
      }

      if (data?.code === 'ERR_ALREADY_MEMBER') {
        showSuccess("You're already a member of this club.");
        return;
      }

      if (!response.ok) {
        throw new Error(data?.message || 'Failed to join club.');
      }

      showSuccess('You joined the club!');
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : 'Failed to join club');
    }
  }

  function handleCategoryToggle(cat: ClubCategory) {
    setCategories(prev => {
        if (prev.includes(cat)) {
          return prev.filter(c => c !== cat);
        } else {
          return [...prev, cat];
        }
      });
  }

  function clearSearch() {
    setQuery('');
    searchRef.current?.focus();
  }

  function clearCategories() {
    setCategories([]);
    searchRef.current?.focus();
  }

  function clearAll() {
    setQuery('');
    setCategories([]);
    searchRef.current?.focus();
  }

  const search = query.trim().toLowerCase();
  const visibleClubs = clubs.filter((club) => {
    const matchesSearch =
      search === '' ||
      club.name.toLowerCase().includes(search) ||
      club.description.toLowerCase().includes(search);
    return matchesSearch;
  });

  const showControls = !loading && !loadError && clubs.length > 0;
  const showEmpty = !loading && !loadError && clubs.length === 0;
  const showNoMatches = showControls && visibleClubs.length === 0;

  const resultsAnnouncement = showControls
    ? visibleClubs.length === 0
      ? 'No clubs match your search.'
      : `${visibleClubs.length} ${visibleClubs.length === 1 ? 'club' : 'clubs'} found.`
    : '';

  return (
    <div className="min-vh-100 bg-light">
      <Header />
      <div className="container py-5">
        <h1 className="fw-bold mb-4" style={{ color: '#3046C3', fontFamily: 'Inter' }}>
          Discover Clubs
        </h1>

        {loadError && (
          <Alert variant="danger" className="mb-4">
            {loadError}
          </Alert>
        )}

        {joinError && (
          <Alert variant="danger" className="mb-4">
            {joinError}
          </Alert>
        )}

        {successMsg && (
          <Alert variant="success" className="mb-4">
            {successMsg}
          </Alert>
        )}

        <div role="status" aria-live="polite" className="visually-hidden">
          {resultsAnnouncement}
        </div>

        {showControls && (
          <>
            <div className="position-relative mb-3" role="search">
              <span
                className="position-absolute top-50 start-0 translate-middle-y ms-3 text-secondary d-flex"
                style={{ pointerEvents: 'none' }}
              >
                <Search size={18} aria-hidden="true" focusable="false" />
              </span>

              <Form.Control
                ref={searchRef}
                type="text"
                size="lg"
                placeholder="Search Clubs by Name or Description"
                aria-label="Search clubs"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="club-search rounded-4 ps-5 pe-5"
              />

              {query && (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={clearSearch}
                  className="position-absolute top-50 end-0 translate-middle-y me-3 btn p-1 border-0 bg-transparent text-secondary d-flex"
                >
                  <X size={30} aria-hidden="true" focusable="false" />
                </button>
              )}
            </div>

            <div className="d-flex flex-wrap gap-2 mb-4" role="group" aria-label="Filter by category">
              {CATEGORY_FILTERS.map((filter) => {
                const active = categories.includes(filter.value);
                return (
                  <Button
                    key={filter.value}
                    size="sm"
                    aria-pressed={active}
                    onClick={() => handleCategoryToggle(filter.value)}
                    className="rounded-pill px-3 fw-semibold"
                    style={{
                      backgroundColor: active ? '#3046C3' : '#fff',
                      borderColor: '#3046C3',
                      color: active ? '#fff' : '#3046C3',
                    }}
                  >
                    {filter.label}
                  </Button>
                );
              })}
              {categories.length > 0 && (
                <Button
                  size="sm"
                  variant="outline-secondary"
                  onClick={clearCategories}
                  className="rounded-pill px-3 fw-semibold ms-auto"
                >
                  Clear Filters
                </Button>
              )}
            </div>
          </>
        )}

        {loading && (
          <div className="text-center py-5" style={{ color: '#3046C3' }}>
            <h4> Loading clubs... </h4>
          </div>
        )}

        {showEmpty && (
          <div className="text-center text-muted py-5">
            <p>No clubs found right now. Check back later!</p>
          </div>
        )}

        {showNoMatches && (
          <div className="text-center text-muted py-5">
            <p className="fs-5 mb-1">No clubs match your search</p>
            <button className="btn btn-outline-primary rounded-pill px-4" onClick={clearAll}>
              Clear search and filters
            </button>
          </div>
        )}

        {visibleClubs.length > 0 && (
          <div className="row g-4">
            {visibleClubs.map((club) => (
              <div key={club._id} className="col-12 col-md-6 col-lg-4">
                <ClubCard club={club} onJoin={handleJoin} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}