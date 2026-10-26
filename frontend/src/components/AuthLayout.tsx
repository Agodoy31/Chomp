import type { ReactNode } from 'react';
import Header from '../components/Header';

type AuthLayoutProps = {
  title: string;
  children: ReactNode;
};

export default function AuthLayout({ title, children }: AuthLayoutProps) {
  return (
    <div className="min-vh-100 bg-white d-flex flex-column">
      <Header />

      {/* Centered card */}
      <main className="flex-grow-1 d-flex justify-content-center align-items-center p-3">
        <div
          className="card rounded-4 w-100"
          style={{
            maxWidth: 'clamp(420px, 40vw, 640px)',
            minHeight: '420px',
            border: '2px solid #3046C3',
          }}
        >
          <h1
            className="h3 text-center mx-4 mx-lg-5 pt-4 pb-3 mb-2"
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
  );
}