<<<<<<< HEAD

import { useState, type SyntheticEvent} from 'react';
import AuthLayout from '../components/AuthLayout';
import Form from 'react-bootstrap/Form';
import Button from 'react-bootstrap/Button';
import { Link, useNavigate } from 'react-router-dom'
import Alert from 'react-bootstrap/Alert';
import FloatingLabel from 'react-bootstrap/FloatingLabel';

async function readJson(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');

    if (!email.trim()) {
      setError('Please enter your UFL email.');
      return;
    }

    if (!password) {
      setError('Please enter your password.');
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: email.trim(), password }),
      });

      const data = await readJson(response);

      if (!response.ok) {
        const message = data?.message;
        if (message && !message.startsWith('ERR_')) {
          setError(message);
        } 
        else if (message === 'ERR_LOGIN_INVALID') {
          setError('Incorrect email or password.');
        } 
        else {
          setError('Something went wrong. Please try again.');
        }
        return;
      }
      //TODO: edit when home page is complete
      navigate('/clubs');
    } catch {
      setError('Could not reach the server. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout title="Login">
      {error && (
        <Alert variant="danger" className="py-2 small">
          {error}
        </Alert>
      )}

      <Form onSubmit={handleSubmit} noValidate>
        {/* Email */}
        <FloatingLabel controlId="email" label="UFL email" className="mb-3">
          <Form.Control
            type="email"
            placeholder="UFL email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-3"
            style={{
              backgroundColor: '#D9D9D9',
              border: '1px solid #333',
            }}
          />
        </FloatingLabel>

        {/* Password */}
        <FloatingLabel controlId="password" label="Password" className="mb-4">
          <Form.Control
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-3"
            style={{
              backgroundColor: '#D9D9D9',
              border: '1px solid #333',
            }}
          />
        </FloatingLabel>

        {/* Login Button */}
        <div className="d-flex justify-content-center">
          <Button
            type="submit"
            disabled={submitting}
            className="rounded-3 px-5 py-2 fw-semibold"
            style={{
              backgroundColor: '#F07833',
              border: '1px solid #14246D',
              color: '#14246D',
            }}
          >
            {submitting ? 'Logging in...' : 'Login'}
          </Button>
        </div>

        {/* Dont have an account link  */}
        <div className="text-center mt-3">
          <span className="text-muted small">Don't have an account? </span>
          <Link
            to="/signup"
            className="text-decoration-none fw-semibold"
            style={{ color: '#3046C3' }}
          >
            Sign up
          </Link>
        </div>
      </Form>
    </AuthLayout>
  );
}
=======
import AuthLayout from '../components/AuthLayout'
import Form from 'react-bootstrap/Form'
import Button from 'react-bootstrap/Button'
import { Link, useNavigate } from 'react-router-dom';


export default function Login() {
    return (
        
         <AuthLayout title="Login">
            {/*TODO: add in API implementation */}
            <Form onSubmit={(e) => e.preventDefault()} >
                <Form.Group className="mb-3" controlId='email'>
                    <Form.Label visuallyHidden>
                        UFL Email
                    </Form.Label>
                    <Form.Control
                        type="email"
                        placeholder="UFL email"
                        className="rounded-3 py-3 px-3"
                        style={{
                            backgroundColor: '#D9D9D9',
                            border: '1px solid #333'
                            
                        }}
                    >

                    </Form.Control>

                </Form.Group>

                <Form.Group className="mb-4" controlId="password">
                    <Form.Label visuallyHidden>Password</Form.Label>
                    <Form.Control
                        type="password"
                        placeholder="Password"
                        className="rounded-3 py-3 px-3"
                        style={{
                            backgroundColor: '#D9D9D9',
                            border: '1px solid #333'
                        }}
                    />
                </Form.Group>
                <div className="d-flex justify-content-center">
                    <Button
                        type="submit"
                        className="rounded-3 px-5 py-2 fw-semibold"
                        style={{ 
                            backgroundColor: '#F07833', 
                            border: '1px solid #14246D', 
                            color: '#14246D' 
                        }}
                    >
                    
                        Login
                    </Button>
                </div>

                {/* Dont have an account link  */}
                <div className="text-center mt-3">
                    <span className="text-muted small">Don't have an account? </span>
                    <Link to="/signup" className="text-decoration-none fw-semibold"
                        style={{ color: '#3046C3' }}>
                        Sign up
                    </Link>
                </div>

            </Form>
        </AuthLayout>
        


    )
}
>>>>>>> 652e7eb (Created Login page with a component layout (for login and sign up pages)
