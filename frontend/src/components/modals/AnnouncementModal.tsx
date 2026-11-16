import { useState, type SyntheticEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import Modal from 'react-bootstrap/Modal';
import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';
import Alert from 'react-bootstrap/Alert';
import { useAuth } from '../../hooks/useAuth';
import { postMessage } from '../../api/messagingApi';
import type { IMessage } from '../../types/Messaging/Message';

type PostAnnouncementModalProps = {
  show: boolean;
  onHide: () => void;
  conversationId: string;
  clubName: string;
  onSuccess?: (newMessage: IMessage) => void;
};

export default function PostAnnouncementModal({
  show,
  onHide,
  conversationId,
  clubName,
  onSuccess,
}: PostAnnouncementModalProps) {

  const navigate = useNavigate();
  const { setUser } = useAuth();

  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');

    const trimmedText = text.trim();
    if (!trimmedText) {
      setError('Please enter an announcement message.');
      return;
    }

    setSubmitting(true);

    try {
      const created = await postMessage(conversationId, trimmedText);

      if (created?._id) {
        onSuccess?.(created);
      }
      onHide();
    } 
    catch (err) {
      const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
      
      if (message.includes('401')) {

        setUser(null);
        navigate('/login');
        return;
      }

      setError(message);
    } 
    finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      show={show}
      onHide={() => !submitting && onHide()}
      onExited={() => {
        setText('');
        setError('');
      }}
      backdrop="static"
      centered
      contentClassName="rounded-3 border-0 shadow"
      aria-labelledby="modal-announcement-title"
    >
      <Modal.Header 
        closeButton={!submitting} 
        className="border-bottom-0 pb-0 pt-4 px-4 align-items-start"
        closeLabel="Close announcement modal"
      >
        <Modal.Title id="modal-announcement-title" className="fs-5 fw-bold pe-4" style={{ color: '#3046C3' }}>
          Post Announcement — {clubName}
        </Modal.Title>
      </Modal.Header>

      <Form noValidate onSubmit={handleSubmit}>
        <Modal.Body className="px-4 py-3">
          {error && (
            <div aria-live="polite">
              <Alert variant="danger" dismissible onClose={() => setError('')}>
                {error}
              </Alert>
            </div>
          )}

          <Form.Group className="mb-2" controlId="announcementText">
            <Form.Label className="fs-5 fw-semibold mb-2" style={{ color: '#3046C3' }}>
              Announcement
            </Form.Label>
            <Form.Control
              as="textarea"
              rows={5}
              placeholder="Share important information with members..."
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={submitting}
              autoFocus
              aria-label="Announcement text content"
            />
          </Form.Group>
        </Modal.Body>

        <Modal.Footer className="border-top-0 pt-0 pb-4 px-4 gap-2">
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
            {submitting ? 'Posting...' : 'Post'}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}