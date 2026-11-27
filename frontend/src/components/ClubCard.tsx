import type { Club } from '../types/club';
import { Dropdown } from 'react-bootstrap';
import { ThreeDotsVertical } from 'react-bootstrap-icons';

type ClubCardProps = {
  club: Club;
  onJoin?: (clubId: string) => void;
  onLeave?: (club: Club) => void;
  onOpen?: (clubId: string) => void;
  
};

// Meeting day and time are optional, so the card only shows what exists
function formatMeetingTime(meeting: Club['meeting']): string {
  const meetingTime = [meeting?.day, meeting?.time].filter(Boolean);
  return meetingTime.length > 0 ? meetingTime.join(' ') : '';
}

export default function ClubCard({ club, onJoin, onLeave, onOpen }: ClubCardProps) {
  const meetingTime = formatMeetingTime(club.meeting);
  const location = club.meeting?.location;
  const isOfficer = club.role === 'OFFICER';

  return (
    <div
      className="card h-100 rounded-4 shadow-sm"
      style={{
        border: '2px solid #3046C3',
      }}
    >
      <div className="card-body d-flex flex-column p-4">
       <div className="d-flex justify-content-between align-items-start mb-2">
          <div className="d-flex gap-2 flex-wrap align-items-center">
            <span className="badge bg-primary-subtle text-primary px-3 py-2">
              {club.category}
            </span>
            {isOfficer && (
            <span 
                className="badge fw-semibold px-3 py-2"
                style={{ backgroundColor: '#FFEDD5', color: '#C2410C' }}
              >
                OFFICER
              </span>
            )}
          </div>
          {onLeave && (
            <Dropdown align="end">
              <Dropdown.Toggle
                as="button"
                type="button"
                bsPrefix="club-card-toggle"
                className="btn btn-link text-muted p-0 text-decoration-none border-0 shadow-none"
                style={{ background: 'none', border: 'none' }}
                aria-label={`Options for ${club.name}`}
              >
                <ThreeDotsVertical size={20} />
              </Dropdown.Toggle>
              <Dropdown.Menu>
                <Dropdown.Item
                  as="button"
                  type="button"
                  className="text-danger fw-semibold"
                  onClick={() => onLeave(club)}
                >
                  Leave Club
                </Dropdown.Item>
              </Dropdown.Menu>
            </Dropdown>
          )}
        </div>


        <h4 className="card-title fw-bold text-dark mt-2 mb-2">{club.name}</h4>

        <p className="card-text text-muted mb-3">{club.description}</p>
        <div className="mt-auto pt-3 mb-3">
          {meetingTime && (
            <p className="mb-1">
              <span className="fw-semibold">Meeting time:</span> {meetingTime}
            </p>
          )}
          {location && (
            <p className="mb-0">
              <span className="fw-semibold">Meeting location:</span> {location}
            </p>
          )}
        </div>

        <div className="d-flex flex-column gap-2">
          {onJoin && (
            <button
              type="button"
              className="btn rounded-pill w-100 fw-semibold py-2"
              style={{
                backgroundColor: '#F07833',
                borderColor: '#14246D',
                color: '#14246D',
              }}
              aria-label={`Join ${club.name}`}
              onClick={() => onJoin(club._id)}
            >
              Join
            </button>
          )}

           {onOpen && (
            <button
              type="button"
              className="btn btn-primary rounded-pill w-100 fw-semibold py-2"
              style={{ backgroundColor: '#3046C3', borderColor: '#3046C3' }}
              aria-label={`Open ${club.name}`}
              onClick={() => onOpen(club._id)}
            >
              Open Club
            </button>
          )}
        </div>
      </div>
    </div>
  );
}