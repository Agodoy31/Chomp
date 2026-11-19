import { useEffect, useState, type SyntheticEvent } from 'react';
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

export function EditClubModal({ show, club, onHide, onSuccess }: EditClubModalProps) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState<ClubCategory | ''>('');
  const [description, setDescription] = useState('');
  const [meetingDay, setMeetingDay] = useState('');
  const [meetingTime, setMeetingTime] = useState('');
  const [meetingLocation, setMeetingLocation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (show && club) {
      setName(club.name ?? '');
      setCategory(club.category ?? '');
      setDescription(club.description ?? '');
      setMeetingDay(club.meeting?.day ?? '');
      setMeetingTime(club.meeting?.time ?? '');
      setMeetingLocation(club.meeting?.location ?? '');
      setError(null);
    }
  }, [show, club]);

  

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

    const meetingPayload: NonNullable<UpdateClubPayload['meeting']> = {};
    if (trimmedDay) meetingPayload.day = trimmedDay;
    if (trimmedTime) meetingPayload.time = trimmedTime;
    if (trimmedLocation) meetingPayload.location = trimmedLocation;

    const payload: UpdateClubPayload = {
      name: trimmedName,
      description: trimmedDescription,
    };

    if (category) payload.category = category;
    if (Object.keys(meetingPayload).length > 0) {
      payload.meeting = meetingPayload;
    }

    setSubmitting(true);
    setError(null);

    try {
      const updatedClub = await updateClub(club._id, payload);
      onSuccess?.(updatedClub);
      onHide();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update club.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      show={show}
      onHide={onHide}
      centered
      aria-labelledby="edit-club-modal-title"
    >
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
              onChange={(e) => setCategory(e.target.value as ClubCategory | '')}
              disabled={submitting}
            >
              <option value="">Select a category...</option>
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
    </Modal>
  );
}