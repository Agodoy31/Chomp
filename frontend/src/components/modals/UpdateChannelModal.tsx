import { useState, type SyntheticEvent } from 'react';
import { Alert, Button, Form, Modal } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import {
  isUnauthorizedError,
  renameChannel,
  type Channel,
} from '../../api/channelApi';

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
   if (!show || !channel) {
    return null;
  }

  return (
    <UpdateChannelForm
      key={channel._id}
      clubId={clubId}
      channel={channel}
      onHide={onHide}
      onSuccess={onSuccess}
    />
  );
}

interface UpdateChannelFormProps {
  clubId: string;
  channel: Channel;
  onHide: () => void;
  onSuccess?: (updatedChannel: Channel) => void;
}

function UpdateChannelForm({
  clubId,
  channel,
  onHide,
  onSuccess,
}: UpdateChannelFormProps) {
  const navigate = useNavigate();
  const { setUser } = useAuth();

  const [channelName, setChannelName] = useState(channel.name ?? '');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [nameInvalid, setNameInvalid] = useState(false);


  function normalizeChannelName(raw: string) {
    return raw.trim().replace(/^#+\s*/, '');
  }

  async function handleSubmit(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;

    const cleaned = normalizeChannelName(channelName);

    if (!cleaned) {
      setNameInvalid(true);
      setError('Channel name is required.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const updated = await renameChannel(clubId, channel._id, { name: cleaned });
      onSuccess?.({
        ...channel,
        ...updated,
      });
      onHide();
    } catch (err) {
      if (isUnauthorizedError(err)) {
        setUser(null);
        navigate('/login');
        return;
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
      onExited={() => {
        setChannelName(channel?.name ?? '');
        setError('');
        setNameInvalid(false);
      }}
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
            <div aria-live="polite">
              <Alert id="update-channel-error" variant="danger">
                {error}
              </Alert>
            </div>
          )}

          <Form.Group controlId="update-Channel-Name">
            <Form.Label>
              Channel Name<span aria-hidden="true">*</span>
            </Form.Label>
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