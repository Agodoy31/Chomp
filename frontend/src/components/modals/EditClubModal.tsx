import { useState, type SyntheticEvent } from 'react';
import { Alert, Button, Form, Modal } from 'react-bootstrap';
import { updateClub, type UpdateClubPayload } from '../../api/clubApi';
import type { Club, ClubCategory } from '../../types/club';

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

export function EditClubModal({ show, club, onHide, onSuccess }: EditClubModalProps) {
  return (
    <Modal
      show={show}
      onHide={onHide}
      centered
      aria-labelledby="edit-club-modal-title"
    >
      {club && <EditClubForm  key={club._id} club={club} onHide={onHide} onSuccess={onSuccess} />}
    </Modal>
  );
}

type EditClubFormProps = {
  club: Club;
  onHide: () => void;
  onSuccess?: (updatedClub: Club) => void;
};

function EditClubForm({ club, onHide, onSuccess }: EditClubFormProps) {
  const [name, setName] = useState(club.name ?? '');

  const [category, setCategory] = useState<ClubCategory>(club.category);
  const [description, setDescription] = useState(club.description ?? '');
  const [meetingDay, setMeetingDay] = useState(club.meeting?.day ?? '');
  const [meetingTime, setMeetingTime] = useState(club.meeting?.time ?? '');
  const [meetingLocation, setMeetingLocation] = useState(club.meeting?.location ?? '');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!club){
      return;
    }

    const trimmedName = name.trim();
    const trimmedDescription = description.trim();
    const trimmedDay = meetingDay.trim();
    const trimmedTime = meetingTime.trim();
    const trimmedLocation = meetingLocation.trim();

    if (!trimmedName) {
      setError('Club name is required.');
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

    const meetingPayload: NonNullable<UpdateClubPayload['meeting']> = {};
    if (trimmedDay) meetingPayload.day = formatMeetingDay(trimmedDay);
    if (trimmedTime) meetingPayload.time = formatMeetingTime(trimmedTime);
    if (trimmedLocation) meetingPayload.location = trimmedLocation;

    const payload: UpdateClubPayload = {
      name: trimmedName,
      description: trimmedDescription,
      category,
      meeting: meetingPayload
    };

    setSubmitting(true);
    setError(null);

    try {
      const updatedClub = await updateClub(club._id, payload);
       onSuccess?.({ ...club, ...updatedClub, meeting: updatedClub.meeting ?? {} });      
       onHide();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update club.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Modal.Header 
        closeButton 
        closeLabel="Close edit club modal"
        >
        <Modal.Title id="edit-club-modal-title">Edit Club</Modal.Title>
      </Modal.Header>

      <Form onSubmit={handleSubmit} aria-busy={submitting} noValidate>
        <Modal.Body>
          {error && (
            <Alert variant="danger" role="alert" aria-live="polite">
              {error}
            </Alert>
          )}

          <Form.Group className="mb-3" controlId="edit-Club-Name">
            <Form.Label>Club Name</Form.Label>
            <Form.Control
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={submitting}
            />
          </Form.Group>

          <Form.Group className="mb-3" controlId="edit-Club-Category">
            <Form.Label>Category</Form.Label>
            <Form.Select
              value={category}
              onChange={(e) => setCategory(e.target.value as ClubCategory)}
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
            <Form.Label>Description</Form.Label>
            <Form.Control
              as="textarea"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
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
                    onChange={(e) => setMeetingDay(e.target.value)}
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
                    onChange={(e) => setMeetingTime(e.target.value)}
                  />
                </Form.Group>
              </div>
            </div>

            <Form.Group className="mb-2" controlId="edit-Meeting-Location">
              <Form.Label>Meeting Location</Form.Label>
              <Form.Control
                type="text"
                placeholder="e.g. Reitz Union 2320"
                value={meetingLocation}
                onChange={(e) => setMeetingLocation(e.target.value)}
              />
            </Form.Group>
          </fieldset>
        </Modal.Body>

        <Modal.Footer>
          <Button
            variant="outline-secondary"
            className="rounded-2 px-4 fw-semibold"
            disabled={submitting}
            onClick={onHide}
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
    </>
  );
}