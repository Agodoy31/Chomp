import { useState, type SyntheticEvent } from 'react';
import { Alert, Button, Form, Modal } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import {
  isUnauthorizedError,
  renameChannel,
  type Channel,
} from '../../api/clubApi';

import {
  MAX_CHANNEL_TITLE_LENGTH,
  normalizeChannelName,
  validateChannelTitle,
} from '../../utils/channelValidation';


interface UpdateChannelModalProps {
  show: boolean;
  clubId: string;
  channel: Channel | null;
  onHide: () => void;
  onSuccess?: (updatedChannel: Channel) => void;
}

export function UpdateChannelModal({
  show,
  clubId,
  channel,
  onHide,
  onSuccess,
}: UpdateChannelModalProps) {
  const [submitting, setSubmitting] = useState(false);
   if (!show || !channel) {
    return null;
  }

  return (
    <UpdateChannelForm
      key={channel._id}
      clubId={clubId}
      channel={channel}
      submitting={submitting}
      setSubmitting={setSubmitting}
      onHide={onHide}
      onSuccess={onSuccess}
    />
  );
}

interface UpdateChannelFormProps {
  clubId: string;
  channel: Channel;
  submitting: boolean;
  setSubmitting: (value: boolean) => void;
  onHide: () => void;
  onSuccess?: (updatedChannel: Channel) => void;
}

function UpdateChannelForm({
  clubId,
  channel,
  submitting,
  setSubmitting,
  onHide,
  onSuccess,
}: UpdateChannelFormProps) {
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const isGeneralChannel = channel.title.trim().toLowerCase() === 'general';

  const [channelName, setChannelName] = useState(channel.title ?? '');
  const [error, setError] = useState('');
  const [nameInvalid, setNameInvalid] = useState(false);


  async function handleSubmit(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;

    if (isGeneralChannel) {
      setNameInvalid(true);
      setError('The General channel cannot be renamed.');
      return;
    }

    const cleaned = normalizeChannelName(channelName);
    const validationError = validateChannelTitle(cleaned);

    if (validationError) {
      setNameInvalid(true);
      setError(validationError);
      return;
    }

    if (cleaned === channel.title.trim()) {
      onSuccess?.(channel);
      onHide();
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const updated = await renameChannel(clubId, channel._id, { title: cleaned });
      onSuccess?.({
        ...channel,
        ...updated,
      });
      onHide();
    } catch (err) {
      if (isUnauthorizedError(err)) {
        setUser(null);
        onHide();
        navigate('/login');
        return;
      }
      const errorObj = err as { status?: number; response?: { status?: number } } | null;
      const status = errorObj?.status ?? errorObj?.response?.status;

      if (status === 400 || status === 409) {
        setNameInvalid(true);
      }

      setError(err instanceof Error ? err.message : 'Failed to update channel.');
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
      aria-labelledby="update-channel-modal-title"
    >
      <Modal.Header closeButton={!submitting} closeLabel="Close update channel modal">
        <Modal.Title id="update-channel-modal-title" className="fw-bold">
          Edit Channel
        </Modal.Title>
      </Modal.Header>

      <Form onSubmit={handleSubmit} aria-busy={submitting} noValidate>
        <Modal.Body className="py-4">
          {error && (
              <Alert id="update-channel-error" variant="danger">
                {error}
              </Alert>
          )}

          <Form.Group controlId="update-Channel-Name">
            <Form.Label>
              Channel Name <span aria-hidden="true">*</span>
            </Form.Label>
            <Form.Control
              type="text"
              required
              maxLength={MAX_CHANNEL_TITLE_LENGTH}
              aria-required="true"
              aria-invalid={nameInvalid}
              placeholder="e.g, gators"
              value={channelName}
              onChange={(e) => {
                setChannelName(e.target.value);
                setNameInvalid(false);
                if (error) setError('');
              }}
              disabled={submitting}
              autoFocus
              aria-describedby={error ? 'update-channel-error' : undefined}
            />
          </Form.Group>
        </Modal.Body>

        <Modal.Footer className="border-0 pt-0 justify-content-end gap-2">
          <Button
            variant="outline-secondary"
            className="rounded-2 px-4 fw-semibold"
            disabled={submitting}
            onClick={() => !submitting && onHide()}
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
            {submitting ? 'Saving...' : 'Save Changes'}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}