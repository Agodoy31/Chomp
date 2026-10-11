
import { useNavigate } from 'react-router-dom';
import "@fontsource/irish-grover";
import "@fontsource/inter"
import Button from 'react-bootstrap/Button';

//import gator logo

export default function LandingPage() {
    const navigate = useNavigate();

    return (
        <div className="min-vh-100 bg-white text-dark d-flex flex-column">

            {/* Header Section */}
            <header className="w-100 bg-white border-bottom sticky-top shadow-sm">
                <div className="container-fluid px-4 py-3 d-flex align-items-center justify-content-between position-relative">
                   <div className="d-flex align-items-center">
                        <span className="badge bg-primary-subtle text-primary fw-bold px-3 py-2 rounded-pill">
                            UF
                        </span>
                    </div>
                

                    <div className="position-absolute start-50 translate-middle-x">
                        <span 
                        className="fw-bold" 
                        style={{ color: '#3046C3', fontFamily:"Irish Grover", fontStyle: 'italic', fontSize: 50 }}
                        >
                        Chomp!
                        </span>
                    </div>

                    <div className="d-flex align-items-center gap-2">
                         <Button variant="outline-primary"
                            onClick={() => navigate('/login')}
                            >Login
                         </Button>

                        < Button variant="primary"
                             onClick={() => navigate('/signup')}

                        >Sign Up
                        </Button>

                    </div>
                </div>
            </header>

            {/* Main Section */}
            <main className='flex-grow-1'>
                <section className='py-3'>
                    <div className="container py-2 text-center">
                        <div 
                            className="px-5 py-2 rounded-pill fw-normal mx-auto"
                            style={{
                                backgroundColor: '#f3d1ae9a',
                                color: '#F07833',
                                maxWidth: '600px',
                                fontFamily: 'Inter',
                                fontSize: 25
                             }}
                            >
                            Connecting All Gators!
                            
                        </div>

                    {/* Hero Heading */}
                    <h1 className= "fw-semibold mt-5 mx-auto"
                        style={{
                            color: '#3046C3',
                            fontFamily: 'Inter',
                            fontSize: 48, 
                            padding: 30

                        }}   
                        >
                        Discover, Join, and Chat with UF Clubs and Peers!
                    </h1>

                    <p className="mx-auto m-3" 
                        style={{ 
                            maxWidth: '600px'
                           
                        }}
                        >
                         Connecting with campus organizations, join club discussions, and send direct messages to peers and club officers.
                    </p>

                    {/* Get started button */}
                    <div className = "mx-auto mt-3 text-start" 
                            style={{ 
                                maxWidth: '600px' 
                            }}
                        >      
                        <button className = "btn px-4 py-2 fw-semibold rounded-pill shadow-sm m-3"
                            style={{
                                backgroundColor: '#FFE5D0',
                                borderColor: '#FDBA74',
                                color: '#D97706',
                                whiteSpace: 'nowrap',
                                padding: 15,
                                width: 333,
                                height: 92
                        
                            }}
                            onClick={() => navigate('/signup')}
                        >
                            Get Started Today
                        
                        </button>
                     </div>  


                </div>

                </section>






            </main>



        </div>
    );
}