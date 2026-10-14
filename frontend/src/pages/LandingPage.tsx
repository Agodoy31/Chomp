import { useNavigate } from 'react-router-dom';
import "@fontsource/irish-grover";
import "@fontsource/inter";
import Button from 'react-bootstrap/Button';

//import gator logo

export default function LandingPage() {
    const navigate = useNavigate();
    const scrollToSection = (sectionId: string) => {
	    const section = document.getElementById(sectionId);
        if(section)
	        section.scrollIntoView({ behavior: "smooth" });
    };  

    return (
        <div className="min-vh-100 bg-white text-dark d-flex flex-column">

            {/* Header Section */}
            <header className="w-100 bg-white border-bottom sticky-top shadow-sm">
                {/* 3 columns: left and right are equal, so the logo is always centered */}
                <div
                    className="container-fluid px-3 px-sm-4 py-3 d-grid align-items-center"
                    style={{ gridTemplateColumns: '1fr auto 1fr' }}
                >
                    {/* Left */}
                    <div className="bg-primary-subtle rounded-3 d-flex align-items-center justify-content-center p-2 shadow-sm" style={{ width: '48px', height: '48px' }}>
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
                            padding: 15
                        }}
                    >
                        Chomp!
                    </span>

                    {/* Right */}
                    <div className="d-flex justify-content-end gap-1 gap-sm-2">
                        <Button size="sm" variant="outline-primary" onClick={() => navigate('/login')}>
                            Login
                        </Button>
                        <Button size="sm" variant="primary" onClick={() => navigate('/signup')}>
                            Sign Up
                        </Button>
                    </div>
                </div>
            </header>

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
                                onClick={( )=> scrollToSection('featured-clubs')}
                            >
                                Explore Clubs!
                            </button>
                        </div>

                    </div>

                </section>
                {/* Featured Clubs Section  */}
                <section id="featured-clubs" className="py-5 bg-light border-top mt-5"
                        style={{ scrollMarginTop: 90 }}>
                    <div className="container py-4">
                        <div className="text-center mb-5">
                            <h2 className="fw-bold" style={{ color: '#3046C3', fontFamily: 'Inter' }}>
                                Featured UF Organizations
                            </h2>
                            <p className="text-muted" style={{ maxWidth: '500px', margin: '0 auto' }}>
                                Discover some of the most active clubs on campus looking for new members right now.
                            </p>
                        </div>

                        {/* Cards Grid */}
                        <div className="row g-4 justify-content-center">
                            {/* Club Card 1 */}
                            <div className="col-12 col-md-4">
                                <div className="card h-100 shadow-sm border-0 rounded-4 p-3">
                                    <div className="card-body d-flex flex-column">
                                        <span className="badge bg-primary-subtle text-primary mb-2 align-self-start">Technology</span>
                                        <h4 className="card-title fw-semibold text-dark">UF Open Source Club</h4>
                                        <p className="card-text text-muted small flex-grow-1">
                                            Join us to promote, support, and create open source software in Gainesville and beyond.
                                            The club organizes casual coding, a twice-weekly meeting dedicated to working on open source code, planning or proposing projects, or just hanging out.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Club Card 2 */}
                             
                                <div className=" col-12 col-md-4">
                                    <div className="card h-100 shadow-sm border-0 rounded-4 p-3">
                                        <div className="card-body d-flex flex-column">
                                            <span className="badge bg-primary-subtle text-primary mb-2 align-self-start">Technology</span>
                                            <h4 className="card-title fw-semibold text-dark">Association for Computing Machinery</h4>
                                            <p className="card-text text-muted small flex-grow-1">
                                                ACM at UF is your guide to breaking into tech, helping you prepare for and navigate an ever-changing job market in computer science.
                                                Join us for weekly workshops, recruiter events, and swing by The Fishbowl (ACM Office Hours)
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            
                            
                            {/* Club Card 3 */}
                                <div className="col-12 col-md-4">
                                    <div className="card h-100 shadow-sm border-0 rounded-4 p-3">
                                        <div className="card-body d-flex flex-column">
                                            <span className="badge bg-primary-subtle text-primary mb-2 align-self-start">Technology</span>
                                            <h4 className="card-title fw-semibold text-dark">WiNGHacks</h4>
                                            <p className="card-text text-muted small flex-grow-1">
                                                UF's first hackathon created to uplift Women, Non-binary and Gender minority students in their technology journey.
                                                Learn new skills, network with their peers, and create innovative projects for a chance to win category prizes.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            
                        </div>
                    </div>
                </section>
            </main>

            {/* Footer Section */}
            <footer className="border-top py-4 text-center" style={{ backgroundColor: '#3046C3' }}>
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