import { useState, useEffect } from 'react';
import Modal from 'react-bootstrap/Modal';
import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';
import { PencilSquare, Gear, X } from 'react-bootstrap-icons';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import type { Club } from '../../types/club';
import type { User } from '../../types/user';

type UserProfileModalProps = {
  show: boolean;
  onHide: () => void;
  targetUser?: User | null;
  clubs?: Club[];
};


export default function UserProfileModal({
  show,
  onHide,
  targetUser,
  clubs =  [], //TODO: Replace with actual user clubs when available
}: UserProfileModalProps) {
  const navigate = useNavigate();
  const { user: authUser } = useAuth();

  // Active profile to render
  const profileToDisplay = targetUser ?? authUser;
  const isOwnProfile = !targetUser || targetUser.id === authUser?.id;

  const [isEditingBio, setIsEditingBio] = useState(false);
  const [bioText, setBioText] = useState(profileToDisplay?.bio ?? '');
  const [showAllClubs, setShowAllClubs] = useState(false);

  useEffect(() => {
    setBioText(profileToDisplay?.bio ?? '');
    setIsEditingBio(false);
  }, [profileToDisplay]);

  if (!profileToDisplay) return null;

  const initials = `${profileToDisplay?.firstName.charAt(0)}${profileToDisplay?.lastName.charAt(0)}`.toUpperCase();

  const displayedClubs =  showAllClubs ? clubs : clubs.slice(0, 3);

  const handleSaveBio = () => {
    // TODO: Connect api endpoint when ready
    setIsEditingBio(false);
  };

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
            {isOwnProfile ? 'User Profile' : `${profileToDisplay.firstName}'s Profile`}
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
              >
                <Gear size={22} />
              </button>
            )}
            <button
              type="button"
              className="btn btn-link text-white p-0 border-0"
              onClick={onHide}
              title="Close"
            >
              <X size={30} />
            </button>
          </div>
        </div>

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
            {profileToDisplay.firstName} {profileToDisplay.lastName}
          </h4>
        </div>

        {/* Biography Section */}
        <div className="mb-4">
          <div className="d-flex align-items-center justify-content-center gap-2 mb-2">
            <h5 className="fw-bold mb-0">Biography</h5>
            {isOwnProfile && !isEditingBio && (
              <button
                type="button"
                className="btn btn-link text-white p-0 border-0 d-flex align-items-center"
                onClick={() => setIsEditingBio(true)}
              >
                <PencilSquare size={18} />
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
                  placeholder="Bio not made yet!"
                  className="bg-white text-dark mb-2 border-0"
                  style={{ fontSize: '16px' }}
                />
                <div className="d-flex justify-content-end gap-2">
                  <Button
                    size="sm"
                    variant="outline-light"
                    onClick={() => {
                      setBioText(profileToDisplay.bio || '');
                      setIsEditingBio(false);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    className="fw-bold border-0"
                    style={{ backgroundColor: '#F07833', color: 'white' }}
                    onClick={handleSaveBio}
                  >
                    Save
                  </Button>
                </div>
              </div>
            ) : (
              <p className="mb-0 text-white fs-6">
                {bioText || 'Bio not made yet!'}
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
      </div>
    </Modal>
  );
}