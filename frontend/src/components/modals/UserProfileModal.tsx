import { useState, useEffect } from 'react';
import Modal from 'react-bootstrap/Modal';
import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';
import { PencilSquare, Gear, X } from 'react-bootstrap-icons';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import type { UserProfile } from '../../types/profile';

type UserProfileModalProps = {
  show: boolean;
  onHide: () => void;
  userId?: string;
};

const BIO_MAX_LENGTH = 500;

async function readJson(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export default function UserProfileModal({
  show,
  onHide,
  userId
}: UserProfileModalProps) {

  const navigate = useNavigate();
  const { user: authUser, setUser } = useAuth();

  // Active profile to render
  const profileId = userId ?? authUser?.id;
  const isOwnProfile = profileId === authUser?.id;

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [isEditingBio, setIsEditingBio] = useState(false);
  const [bioText, setBioText] = useState('');
  const [bioError, setBioError] = useState('');
  const [savingBio, setSavingBio] = useState(false);
  const [showAllClubs, setShowAllClubs] = useState(false);

  useEffect(() => {

    if (!show || !profileId) return;
    let cancelled = false;

    async function loadProfile() {
      setLoading(true);
      setLoadError('');
      setProfile(null);

      try {
        const response = await fetch(`/api/users/${profileId}`, {
          credentials: 'include'
        });

        const data = await readJson(response);
        if (cancelled) {
          return;
        }

        if(response.status === 401){
          setUser(null);
          setLoadError('Your session expired. Please log in again.');
          return;
        }

        if (!response.ok) {
          if (data?.code === 'ERR_USER_NOT_FOUND') {
            setLoadError('User not found.');
          } 
         
          else {
            setLoadError('Could not load this profile. Please try again.');
          }
          return;
        }
        setProfile(data);
        setIsEditingBio(false);
        setBioError('');
        setShowAllClubs(false);

      } catch {
        if (!cancelled) {
          setLoadError('Could not reach the server. Please try again.');
        }
      } 
      finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadProfile();

    return () => {
      cancelled = true;
    };

  }, [show, profileId, setUser]);

  if (!profileId) return null;
  const shownProfile = profile?.id === profileId ? profile : null;
  const clubs = shownProfile?.clubs ?? [];
  const initials = shownProfile ? `${shownProfile.firstName.charAt(0)}${shownProfile.lastName.charAt(0)}`.toUpperCase() : '';
  const displayedClubs =  showAllClubs ? clubs : clubs.slice(0, 3);

  async function handleSaveBio() {
    setBioError('');

    setSavingBio(true);
    try {
      const response = await fetch(`/api/users/me`, {
        method: 'PATCH',
        headers: {'Content-Type': 'application/json'},
        credentials: 'include',
        body: JSON.stringify({ bio: bioText.trim() })
      });

      if (response.status === 401) {
        setUser(null);
        setBioError('Your session expired. Please log in again.');
        navigate('/login');
        return;
      }

      const data = await readJson(response);
      if (!response.ok){
        setBioError(data?.message || 'Could not save bio. Please try again.');
        return;
      }

      const savedBio: string = data?.bio ?? bioText.trim();
      setProfile(current => (current ? { ...current, bio: savedBio } : current));

      if(authUser) {
        setUser({ ...authUser, bio: savedBio });
      }
      setIsEditingBio(false);
    } 
    catch {
      setBioError('Could not reach the server. Please try again.');
    } 
    finally {
      setSavingBio(false);
    }
  }


  return (
    <Modal
      show={show}
      onHide={onHide}
      centered
      contentClassName="border-0 rounded-4 shadow-lg overflow-hidden"
    >
      <div
        className="p-4 text-white position-relative"
        style={{ backgroundColor: '#3046C3' }}
      >
        {/* Header Icons */}
        <div className="d-flex justify-content-between align-items-center mb-2">
          <h4 className="fw-bold m-0" style={{ fontSize: '24px' }}>
            {isOwnProfile ? 'User Profile' : shownProfile ? `${shownProfile.firstName}'s Profile` : 'Profile'}
          </h4>
          <div className="d-flex align-items-center gap-3">
            {isOwnProfile && (
              <button
                type="button"
                className="btn btn-link text-white p-0 border-0"
                onClick={() => {
                  /* Settings routing */
                }}
                title="Settings"
                aria-label="Settings"
              >
                <Gear size={22} aria-hidden="true" focusable="false" />
              </button>
            )}
            <button
              type="button"
              className="btn btn-link text-white p-0 border-0"
              onClick={onHide}
              title="Close"
              aria-label="Close Profile"
            >
              <X size={30} aria-hidden="true" focusable="false" />
            </button>
          </div>
        </div>
        
        {loadError && <p className="text-center my-4 text-danger" role="alert">{loadError}</p>}
        {loading && !loadError && <p className="text-center my-4 text-white-50" role="status">Loading profile...</p>}

        {shownProfile && (
          <>

          {/* Centered Avatar & Name */}
          <div className="d-flex flex-column align-items-center my-3">
            <div
              className="d-flex align-items-center justify-content-center rounded-circle fw-bold fs-3 text-secondary shadow-sm mb-3"
              style={{
                width: 90,
                height: 90,
                backgroundColor: '#D9D9D9',
                border: '3px solid white',
              }}
            >
              {initials}
            </div>
            <h4 className="fw-bold mb-0 text-center">
              {shownProfile.firstName} {shownProfile.lastName}
            </h4>
            <div className="small text-white-50">{shownProfile.email}</div>
          </div>

          {/* Biography Section */}
          <div className="mb-4">
            <div className="d-flex align-items-center justify-content-center gap-2 mb-2">
              <h5 className="fw-bold mb-0">Biography</h5>
              {isOwnProfile && !isEditingBio && (
                <button
                  type="button"
                  className="btn btn-link text-white p-0 border-0 d-flex align-items-center"
                  aria-label="Edit Biography"
                  onClick={() => {
                    setBioText(shownProfile.bio || '');
                    setBioError('');
                    setIsEditingBio(true);
                  }}
                >
                  <PencilSquare size={18} aria-hidden="true" focusable="false" />
                </button>
              )}
            </div>

            <div
              className="p-3 rounded-4 text-center"
              style={{
                backgroundColor: '#ffffff26',
                border: '1px solid #ffffff66',
              }}
            >
              {isOwnProfile && isEditingBio ? (
                <div>
                  <Form.Control
                    as="textarea"
                    rows={3}
                    value={bioText}
                    onChange={(e) => setBioText(e.target.value)}
                    maxLength={BIO_MAX_LENGTH}
                    placeholder="Write your bio here..."
                    className="bg-white text-dark mb-2 border-0"
                    style={{ fontSize: '16px' }}
                  />
                  <div className="text-end small text-white-50 mb-2">
                    {bioText.length}/{BIO_MAX_LENGTH}
                  </div>

                  {bioError && (
                    <p className="small mb-2 text-warning fw-medium">
                      {bioError}
                    </p>
                  )}
                  <div className="d-flex justify-content-end gap-2">
                    <Button
                      size="sm"
                      variant="outline-light"
                      disabled={savingBio}
                      onClick={() => {
                        setIsEditingBio(false);
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      className="fw-bold border-0"
                      style={{ backgroundColor: '#F07833', color: 'white' }}
                      disabled={savingBio}
                      onClick={handleSaveBio}
                    >
                      {savingBio ? 'Saving...' : 'Save'}
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="mb-0 text-white fs-6">
                  {shownProfile.bio || 'Bio not made yet!'}
                </p>
              )}
            </div>
          </div>

          {/* My Clubs Section */}
          <div>
            <h5 className="fw-bold text-center mb-2">
              {isOwnProfile ? 'My Clubs' : 'Clubs Joined'}
            </h5>
            <div
              className="p-3 rounded-4 position-relative"
              style={{
                backgroundColor: '#ffffff26',
                border: '1px solid #ffffff66',
              }}
            >
              <div className="d-flex flex-column gap-2 mb-3">
                {displayedClubs.length > 0 ? (
                  displayedClubs.map((club) => (
                    <button
                      key={club._id}
                      type="button"
                      className="btn text-white fw-medium py-2 rounded-3 text-truncate"
                      style={{
                        backgroundColor: '#1C2C94',
                        border: '1px solid #ffffff33',
                      }}
                      onClick={() => {
                        onHide();
                        navigate(`/club/${club._id}`);
                      }}
                    >
                      {club.name}
                    </button>
                  ))
                ) : (
                  <p className="text-center text-white-50 m-0 small">No clubs joined yet.</p>
                )}
              </div>

              {clubs.length > 3 && (
                  <div className="text-end">
                      <button
                      type="button"
                      className="btn btn-link text-white text-decoration-underline p-0 border-0 small"
                      style={{ fontSize: '9px' }}
                      onClick={() => setShowAllClubs(!showAllClubs)}
                      >
                      {showAllClubs ? 'Show less' : `See ${clubs.length - 3} more`}
                      </button>
                  </div>
              )}
            </div>
          </div>
        </>
        )}
      </div>
    </Modal>
  );
}