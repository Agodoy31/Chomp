import { useState, type SyntheticEvent } from 'react';
import { Alert, Button, Form, Modal } from 'react-bootstrap';
import type { Club, ClubCategory } from '../../types/club';
import {useAuth} from '../../hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import {
  isUnauthorizedError,
  updateClub,
  type UpdateClubPayload,
} from '../../api/clubApi';


interface EditClubModalProps {
  show: boolean;
  club: Club | null;
  onHide: () => void;
  onSuccess?: (updatedClub: Club) => void;
}

const CLUB_CATEGORY_OPTIONS: { value: ClubCategory; label: string }[] = [
  { value: 'ACADEMIC', label: 'Academic' },
  { value: 'CULTURAL', label: 'Cultural' },
  { value: 'SPORTS', label: 'Sports' },
  { value: 'OTHER', label: 'Other' },

];
const CLUB_NAME_PATTERN = /^[\p{L}\p{M}\p{N}\p{P} +]+$/u;
const NAME_MAX_LENGTH = 100;
const DESCRIPTION_MAX_LENGTH = 1000;
const LOCATION_MAX_LENGTH = 120;


const WEEKDAY_PATTERN = /^(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/i;
const TIME_PATTERN = /^(1[0-2]|0?[1-9]):[0-5][0-9]\s?(AM|PM)$/i;

function formatMeetingDay(value: string): string {
  const trimmed = value.trim().toLowerCase();
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function formatMeetingTime(value: string): string {
  const match = value.trim().match(/^(1[0-2]|0?[1-9]):([0-5][0-9])\s?(AM|PM)$/i);
  if (!match) return value.trim();

  const hour = String(Number(match[1]));
  const minute = match[2];
  const period = match[3].toUpperCase();

  return `${hour}:${minute} ${period}`;
}

function clubHadMeeting(club: Club): boolean {
  return Boolean(
    club.meeting?.day?.trim() ||
      club.meeting?.time?.trim() ||
      club.meeting?.location?.trim(),
  );
}

export function EditClubModal({ show, club, onHide, onSuccess }: EditClubModalProps) {
  const [submitting, setSubmitting] = useState(false);

  if (!show || !club) {
    return null;
  }

  return (
      <EditClubForm  
      key={club._id} 
      club={club}  
      submitting={submitting}
       setSubmitting={setSubmitting} 
       onHide={onHide} 
       onSuccess={onSuccess} />
  );
}

type EditClubFormProps = {
  club: Club;
  submitting: boolean;
  setSubmitting: (submitting: boolean) => void;
  onHide: () => void;
  onSuccess?: (updatedClub: Club) => void;
};

function EditClubForm({ club, submitting, setSubmitting, onHide, onSuccess }: EditClubFormProps) {

  const { setUser } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState(club.name ?? '');

  const [category, setCategory] = useState<ClubCategory>(club.category);
  const [description, setDescription] = useState(club.description ?? '');
  const [meetingDay, setMeetingDay] = useState(club.meeting?.day ?? '');
  const [meetingTime, setMeetingTime] = useState(club.meeting?.time ?? '');
  const [meetingLocation, setMeetingLocation] = useState(club.meeting?.location ?? '');
  const [error, setError] = useState<string | null>(null);

  const [nameInvalid, setNameInvalid] = useState(false);
  const [descriptionInvalid, setDescriptionInvalid] = useState(false);


  function handleFieldChange() {
    if (error) {
      setError(null);
    }
  }

  function handleNameChange(value: string) {
    setName(value);
    handleFieldChange();

    const trimmed = value.trim();
    if (!trimmed) {
      setNameInvalid(false);
      return;
    }

    if (!CLUB_NAME_PATTERN.test(trimmed)) {
      setNameInvalid(true);
      setError('Club name contains invalid characters.');
    } else {
      setNameInvalid(false);
    }
  }

  function handleDescriptionChange(value: string) {
    setDescription(value);
    setDescriptionInvalid(false);
    handleFieldChange();
  }


  async function handleSubmit(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;

    const trimmedName = name.trim();
    const trimmedDescription = description.trim();
    const trimmedDay = meetingDay.trim();
    const trimmedTime = meetingTime.trim();
    const trimmedLocation = meetingLocation.trim();

    const isNameMissing = !trimmedName;
    const isNamePatternInvalid = Boolean(trimmedName) && !CLUB_NAME_PATTERN.test(trimmedName);
    const isDescriptionMissing = !trimmedDescription;

    setNameInvalid(isNameMissing || isNamePatternInvalid);
    setDescriptionInvalid(isDescriptionMissing);

    if (!trimmedName) {
      setError('Club name is required.');
      return;
    }

    if (isNamePatternInvalid) {
      setError('Club name contains invalid characters.');
      return;
    }

    if (!trimmedDescription) {
      setError('Club description is required.');
      return;
    }

    if (trimmedDay && !WEEKDAY_PATTERN.test(trimmedDay)) {
      setError('Meeting day must be a day of the week, like Monday.');
      return;
    }

    if (trimmedTime && !TIME_PATTERN.test(trimmedTime)) {
      setError('Meeting time must look like 6:30 PM.');
      return;
    }

    const hasMeetingInputs = Boolean(trimmedDay || trimmedTime || trimmedLocation);
    let meetingPayload: UpdateClubPayload['meeting'];

    if (hasMeetingInputs) {
      const builtMeeting: NonNullable<Club['meeting']> = {};
      if (trimmedDay) builtMeeting.day = formatMeetingDay(trimmedDay);
      if (trimmedTime) builtMeeting.time = formatMeetingTime(trimmedTime);
      if (trimmedLocation) builtMeeting.location = trimmedLocation;
      meetingPayload = builtMeeting;
    } else if (clubHadMeeting(club)) {
      meetingPayload = {};
    }


    const payload: UpdateClubPayload = {
      name: trimmedName,
      description: trimmedDescription,
      category,
      ...(meetingPayload !== undefined ? { meeting: meetingPayload } : {})
    };

    setSubmitting(true);
    setError(null);

    try {
      const updatedClub = await updateClub(club._id, payload);
       onSuccess?.({
        ...club,
        ...updatedClub,
        status: club.status,
        role: club.role,
        meeting: updatedClub.meeting ?? meetingPayload ?? club.meeting,
      });     
       onHide();
    } catch (err) {

      if (isUnauthorizedError(err)) {
        setUser(null);
        navigate('/login');
        return;
      }

      setError(err instanceof Error ? err.message : 'Failed to update club.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      show
       onHide={() => !submitting && onHide()}
      backdrop="static"
      keyboard={!submitting}
      centered
      aria-labelledby="edit-club-modal-title"
    >
      <Modal.Header closeButton={!submitting} closeLabel="Close edit club modal">
        <Modal.Title id="edit-club-modal-title">Edit Club</Modal.Title>
      </Modal.Header>

      <Form onSubmit={handleSubmit} aria-busy={submitting} noValidate>
        <Modal.Body>
          {error && (
            <Alert variant="danger">
              {error}
            </Alert>
          )}

          <Form.Group className="mb-3" controlId="edit-Club-Name">
            <Form.Label>Club Name <span aria-hidden="true">*</span> </Form.Label>
            <Form.Control
              type="text"
              required
              aria-required="true"
              aria-invalid={nameInvalid}
              maxLength={NAME_MAX_LENGTH}
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              disabled={submitting}
            />
          </Form.Group>

          <Form.Group className="mb-3" controlId="edit-Club-Category">
            <Form.Label>Category</Form.Label>
            <Form.Select
              value={category}
              onChange={(e) => {
                setCategory(e.target.value as ClubCategory);
                handleFieldChange();
              }}              
              disabled={submitting}
            >
              {CLUB_CATEGORY_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </Form.Select>
          </Form.Group>

          <Form.Group className="mb-3" controlId="edit-Club-Description">
            <Form.Label>Description <span aria-hidden="true">*</span></Form.Label>
            <Form.Control
              as="textarea"
              rows={3}
              required
              aria-required="true"
              aria-invalid={descriptionInvalid}
              maxLength={DESCRIPTION_MAX_LENGTH}
              value={description}
              onChange={(e) => handleDescriptionChange(e.target.value)}
              disabled={submitting}
            />
          </Form.Group>

          <fieldset className="border-0 p-0 m-0" disabled={submitting}>
            <legend className="visually-hidden">Meeting Schedule</legend>
            <div className="row g-3 mb-3">
              <div className="col-6">
                <Form.Group controlId="edit-Meeting-Day">
                  <Form.Label>Meeting Day</Form.Label>
                  <Form.Control
                    type="text"
                    placeholder="e.g. Monday"
                    value={meetingDay}
                    onChange={(e) => {
                      setMeetingDay(e.target.value);
                      handleFieldChange();
                    }}
                  />
                </Form.Group>
              </div>
              <div className="col-6">
                <Form.Group controlId="edit-Meeting-Time">
                  <Form.Label>Meeting Time</Form.Label>
                  <Form.Control
                    type="text"
                    placeholder="e.g. 6:30 PM"
                    value={meetingTime}
                    onChange={(e) => {
                      setMeetingTime(e.target.value);
                      handleFieldChange();
                    }}
                  />
                </Form.Group>
              </div>
            </div>

            <Form.Group className="mb-2" controlId="edit-Meeting-Location">
              <Form.Label>Meeting Location</Form.Label>
              <Form.Control
                type="text"
                placeholder="e.g. Reitz Union 2320"
                maxLength={LOCATION_MAX_LENGTH}
                value={meetingLocation}
                onChange={(e) => {
                  setMeetingLocation(e.target.value);
                  handleFieldChange();
                }}
              />
            </Form.Group>
          </fieldset>
        </Modal.Body>

        <Modal.Footer>
          <Button
            variant="outline-secondary"
            className="rounded-2 px-4 fw-semibold"
            disabled={submitting}
            onClick={ onHide}
            aria-label="Cancel and close modal"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            className="rounded-2 px-4 fw-semibold text-white"
            style={{ backgroundColor: '#3046C3', borderColor: '#3046C3' }}
            disabled={submitting}
          >
            {submitting ? 'Saving...' : 'Save'}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}