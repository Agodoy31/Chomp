import { useNavigate } from 'react-router-dom';
import "@fontsource/irish-grover";
import "@fontsource/inter";
import Button from 'react-bootstrap/Button';

//import gator logo

export default function LandingPage() {
    const navigate = useNavigate();

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
                    <div>
                        <span className="badge bg-primary-subtle text-primary fw-bold px-3 py-2 rounded-pill">
                            UF
                        </span>
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

                        {/* Buttons: one shared row, wraps on small screens */}
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
                                    backgroundColor: '#ABB5EE',
                                    borderColor: '#3046C3',
                                    color: '#3046C3',
                                    whiteSpace: 'nowrap',
                                    width: 250,
                                    maxWidth: '100%',
                                    height: 70,
                                }}
                            >
                                Explore Clubs!
                            </button>
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