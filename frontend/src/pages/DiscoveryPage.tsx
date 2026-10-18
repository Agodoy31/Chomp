import { useNavigate } from 'react-router-dom';
import ClubCard from '../components/ClubCard';
import type { Club } from '../types/club';
import '@fontsource/irish-grover';
import '@fontsource/inter';
import Button from 'react-bootstrap/Button';

const mockClubs: Club[] = [
  {
    _id: '1',
    name: 'UF Open Source Club',
    description:
      'Join us to promote, support, and create open source software in Gainesville and beyond. The club organizes casual coding, a twice-weekly meeting dedicated to working on open source code, planning or proposing projects, or just hanging out',
    category: 'ACADEMIC',
    meeting: { day: '', time: '', location: '' },
    status: 'APPROVED',
  },
  {
    _id: '2',
    name: 'Association for Computing Machinery',
    description:
      'ACM at UF is your guide to breaking into tech, helping you prepare for and navigate an ever-changing job market in computer science. Join us for weekly workshops, recruiter events, and swing by The Fishbowl (ACM Office Hours)',
    category: 'ACADEMIC',
    meeting: { day: 'Wednesday', time: '7:00 PM', location: 'Marston Library' },
    status: 'APPROVED',
  },

  {
    _id: '3',
    name: 'WiNGHacks',
    description:
      "UF's first hackathon created to uplift Women, Non-binary and Gender minority students in their technology journey. Learn new skills, network with their peers, and create innovative projects for a chance to win category prizes.",
    category: 'ACADEMIC',
    meeting: { day: 'Friday', time: '', location: 'Marston Library' },
    status: 'APPROVED',
  },

  {
    _id: '4',
    name: 'WICSE',
    description:
      "Computer science club WiCSE is the official student ACM-W chapter at the University of Florida. We're dedicated to increasing the representation of women in Computer Science. Our mission is to facilitate the growth and empowerment of women in Computer Science by educating and celebrating their participation in the field.",
    category: 'ACADEMIC',
    meeting: { day: '', time: '', location: 'Marston Library' },
    status: 'APPROVED',
  },

  {
    _id: '5',
    name: 'Sports Club',
    description: 'Sport club we play football, soccer, and basketball ',
    category: 'SPORTS',
    meeting: { day: '', time: '', location: 'Recs Center' },
    status: 'APPROVED',
  },

  {
    _id: '6',
    name: 'Other Club',
    description: 'We do other stuff',
    category: 'OTHER',
    meeting: { day: 'Monday', time: '', location: '' },
    status: 'APPROVED',
  },
];

export default function ClubDiscovery() {
  const navigate = useNavigate();
  const isLoggedIn = false; // TODO : Replace with user authentication

  function handleJoin(clubId: string) {
    if (!isLoggedIn) {
      navigate('/login');
      return;
    }
    // TODO call the join route
    console.log('Join club', clubId);
  }

  return (
    <div className="min-vh-100 bg-light">
      {/* TODO: this header is copied from LandingPage. Will move to shared Header component after log in/logout states. */}
      <header className="w-100 bg-white border-bottom sticky-top shadow-sm">
        <div
          className="container-fluid px-3 px-sm-4 py-3 d-grid align-items-center"
          style={{ gridTemplateColumns: '1fr auto 1fr' }}
        >
          {/* Left */}
          <div
            className="bg-primary-subtle rounded-3 d-flex align-items-center justify-content-center p-2 shadow-sm"
            style={{ width: '48px', height: '48px' }}
          >
            <img
              src="/UF_Monogram.svg"
              alt="UF Monogram Logo"
              style={{ height: '24px', width: '24px', objectFit: 'contain' }}
            />
          </div>

          {/* Center */}
          <span
            className="fw-bold"
            style={{
              color: '#3046C3',
              fontFamily: 'Irish Grover',
              fontStyle: 'italic',
              fontSize: 'clamp(24px, 6vw, 50px)',
              whiteSpace: 'nowrap',
              padding: 15,
            }}
          >
            Chomp!
          </span>

          {/* Right */}
          <div className="d-flex justify-content-end gap-1 gap-sm-2">
            <Button
              size="sm"
              variant="outline-primary"
              onClick={() => navigate('/login')}
            >
              Login
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={() => navigate('/signup')}
            >
              Sign Up
            </Button>
          </div>
        </div>
      </header>

      <div className="container py-5">
        <h1 className="fw-bold mb-4" style={{ color: '#3046C3' }}>
          Discover Clubs
        </h1>

        <div className="row g-4">
          {mockClubs.map((club) => (
            <div key={club._id} className="col-12 col-md-6 col-lg-4">
              <ClubCard club={club} onJoin={handleJoin} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
