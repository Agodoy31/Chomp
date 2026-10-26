import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import ClubCard from '../components/ClubCard';
import type { Club } from '../types/club';
import { useAuth } from '../hooks/useAuth';

const featuredClubs: Club[] = [
  {
    _id: '1',
    name: 'UF Open Source Club',
    description:
      'Join us to promote, support, and create open source software in Gainesville and beyond. The club organizes casual coding, a twice-weekly meeting dedicated to working on open source code, planning or proposing projects, or just hanging out.',
    category: 'ACADEMIC',
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
];

export default function LandingPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const scrollToSection = (sectionId: string) => {
    const section = document.getElementById(sectionId);
    if (section) section.scrollIntoView({ behavior: 'smooth' });
  };

  const handleJoinClub = (clubId: string) => {
    if (user) {
      // TODO: when clubs are inserted update to club id 
      navigate('/clubs');
    } 
    else {
      navigate('/signup');
    }
  };

  return (
    <div className="min-vh-100 bg-white text-dark d-flex flex-column">
      {/* Header Section */}
      <Header />

      {/* Main Section */}
      <main className="flex-grow-1">
        <section className="py-3">
          <div className="container py-2 text-center">
            <div
              className="px-3 px-sm-5 py-2 rounded-pill fw-normal mx-auto"
              style={{
                backgroundColor: '#f3d1ae9a',
                color: '#F07833',
                maxWidth: '600px',
                fontFamily: 'Inter',
                fontSize: 'clamp(16px, 4.5vw, 25px)',
              }}
            >
              Connecting All Gators!
            </div>

            {/* Hero Heading */}
            <h1
              className="fw-semibold mt-5 mx-auto py-3 px-2"
              style={{
                color: '#3046C3',
                fontFamily: 'Inter',
                fontSize: 'clamp(30px, 7vw, 48px)',
              }}
            >
              Discover, Join, and Chat with UF Clubs and Peers!
            </h1>

            <p className="mx-auto m-3" style={{ maxWidth: '600px' }}>
              Connect with campus organizations, join club discussions, and send
              direct messages to peers and club officers.
            </p>

            {/* Buttons*/}
            <div className="d-flex flex-wrap justify-content-center align-items-center gap-3 mt-4">
              <button
                className="btn px-4 py-2 fw-semibold rounded-pill shadow-sm"
                style={{
                  backgroundColor: '#FFE5D0',
                  borderColor: '#FDBA74',
                  color: '#D97706',
                  whiteSpace: 'nowrap',
                  width: 250,
                  maxWidth: '100%',
                  height: 70,
                }}
                onClick={() => navigate('/signup')}
              >
                Get Started Today
              </button>

              <button
                className="btn px-4 py-1 fw-semibold rounded-pill shadow-sm"
                style={{
                  backgroundColor: '#abb5ee9e',
                  borderColor: '#3046C3',
                  color: '#3046C3',
                  whiteSpace: 'nowrap',
                  width: 250,
                  maxWidth: '100%',
                  height: 70,
                }}
                onClick={() => scrollToSection('featured-clubs')}
              >
                Explore Clubs!
              </button>
            </div>
          </div>
        </section>
        {/* Featured Clubs Section  */}
        <section
          id="featured-clubs"
          className="py-5 bg-light border-top mt-5"
          style={{ scrollMarginTop: 90 }}
        >
          <div className="container py-4">
            <div className="text-center mb-5">
              <h2
                className="fw-bold"
                style={{ color: '#3046C3', fontFamily: 'Inter' }}
              >
                Featured UF Organizations
              </h2>
              <p
                className="text-muted"
                style={{ maxWidth: '500px', margin: '0 auto' }}
              >
                Discover some of the most active clubs on campus looking for new
                members right now.
              </p>
            </div>
            <div className="row g-4">
              {featuredClubs.map((club) => (
                <div key={club._id} className="col-12 col-md-6 col-lg-4">
                  <ClubCard
                    club={club}
                    onJoin={() => handleJoinClub(club._id)}
                  />{' '}
                </div>
              ))}
            </div>
            <div className="text-center mt-5">
              <button
                className="btn px-4 py-2 fw-semibold rounded-pill shadow-sm"
                style={{
                  backgroundColor: '#FFE5D0',
                  borderColor: '#FDBA74',
                  color: '#D97706',
                  whiteSpace: 'nowrap',
                  width: 300,
                  maxWidth: '100%',
                  height: 70,
                }}
                onClick={() => navigate('/clubs')}
              >
                Browse All Clubs!
              </button>
            </div>
          </div>
        </section>
      </main>

      {/* Footer Section */}
      <footer
        className="border-top py-4 text-center"
        style={{ backgroundColor: '#3046C3' }}
      >
        <span
          style={{
            color: 'white',
            fontFamily: 'Irish Grover',
            fontStyle: 'italic',
            fontSize: 'clamp(28px, 6vw, 40px)',
          }}
        >
          Chomp!
        </span>
      </footer>
    </div>
  );
}
