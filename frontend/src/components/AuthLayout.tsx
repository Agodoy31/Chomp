import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

type AuthLayoutProps = {
    title: string
    children: ReactNode
}

export default function AuthLayout ({title, children}: AuthLayoutProps){
    return (
        <div className="min-vh-100 bg-white d-flex flex-column">
            <header
                className="text-center py-3"
                style={{ 
                    backgroundColor: "#3046C3", 
                    borderBottom: '2px solid #3046C3' }}
            >
                <Link
                    to="/"
                    className="fw-bold"
                    style={{
                        color: 'white',
                        fontFamily: 'Irish Grover',
                        fontStyle: 'italic',
                        fontSize: 'clamp(24px, 6vw, 50px)',
                        whiteSpace: 'nowrap',
                        padding: 15,
                        textDecoration: 'none',
                    }}
                >
                    Chomp!
                </Link>
            </header>
 
            {/* Centered card */}
            <main className="flex-grow-1 d-flex justify-content-center align-items-center p-3">
                <div
                    className="card rounded-4 w-100"
                    style={{ 
                    maxWidth: 'clamp(420px, 40vw, 640px)',
                    minHeight: '420px',
                    border: '2px solid #3046C3' }}
                >
                    {/* Title with the divider line underneath */}
                    <h1
                        className="h3 text-center mx-4 pt-4 pb-3 mb-2"
                        style={{
                            color: '#3046C3',
                            fontFamily: 'Irish Grover',
                            borderBottom: '2px solid #3046C3',
                        }}
                    >
                        {title}
                    </h1>
 
                    <div className="card-body p-4 p-lg-5">{children}</div>
                </div>
            </main>
        </div>

    )
}