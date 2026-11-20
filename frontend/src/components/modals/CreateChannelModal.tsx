import { useState, type SyntheticEvent } from 'react';
import { Alert, Button, Form, Modal } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import {
  createChannel,
  isUnauthorizedError,
  type Channel,
} from '../../api/channelApi';

interface CreateChannelModalProps {
  show: boolean;
  clubId: string;
  onHide: () => void;
  onSuccess?: (createdChannel: Channel) => void;
}

export function CreateChannelModal({
  show,
  clubId,
  onHide,
  onSuccess,
}: CreateChannelModalProps) {

  const navigate = useNavigate();
  const { setUser } = useAuth();

  const [channelName, setChannelName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [nameInvalid, setNameInvalid] = useState(false);

  function normalizeChannelName(raw: string) {
    return raw.trim().replace(/^#+\s*/, '');
  }

  async function handleSubmit(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    const cleaned = normalizeChannelName(channelName);

    if (!cleaned) {
      setNameInvalid(true);
      setError('Channel name is required.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const created = await createChannel(clubId, { name: cleaned });
      setChannelName('');
      onSuccess?.(created);
      onHide();
    } catch (err) {
      if (isUnauthorizedError(err)) {
        setUser(null);
        navigate('/login');
        return;
      }

      setError(err instanceof Error ? err.message : 'Failed to create channel.');
    } finally {
      setSubmitting(false);
    }
  }



  return (
    <Modal
      show={show}
      onHide={() => !submitting && onHide()}
      onExited={() => {
        setChannelName('');
        setError(null);
        setNameInvalid(false);
      }}
      backdrop="static"
      keyboard={!submitting}
      centered
      aria-labelledby="create-channel-modal-title"
    >
      <Modal.Header closeButton={!submitting} closeLabel="Close create channel modal">
        <Modal.Title id="create-channel-modal-title" className="fw-bold">
          Create Channel
        </Modal.Title>
      </Modal.Header>

      <Form onSubmit={handleSubmit} noValidate>
        <Modal.Body className="py-4">
          {error && (
            <div aria-live="polite">
              <Alert id="create-channel-error" variant="danger">
                {error}
              </Alert>
            </div>
          )}

          <Form.Group controlId="create-Channel-Name">
            <Form.Label>Channel Name<span aria-hidden="true">*</span></Form.Label>
            <Form.Control
              type="text"
              required
              aria-required="true"
              aria-invalid={nameInvalid}
              placeholder="# e.g, gators"
              value={channelName}
              onChange={(e) => {
                setChannelName(e.target.value);
                setNameInvalid(false);
                if (error) setError('');
              }}
              disabled={submitting}
              autoFocus
              aria-describedby={error ? 'create-channel-error' : undefined}
            />
          </Form.Group>
        </Modal.Body>

        <Modal.Footer className="border-0 pt-0 justify-content-end gap-2">
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
            {submitting ? 'Creating...' : 'Create Channel'}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}