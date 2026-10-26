import { useState, type SyntheticEvent } from 'react'
import AuthLayout from '../components/AuthLayout';
import Form from 'react-bootstrap/Form';
import Button from 'react-bootstrap/Button';
import { Link, useNavigate } from 'react-router-dom';
import { isUflEmail, isValidName, MIN_PASSWORD_LENGTH } from '../utils/validation';
import { Alert } from 'react-bootstrap';
import FloatingLabel from 'react-bootstrap/FloatingLabel';
import { useAuth } from '../hooks/useAuth';



async function readJson(response: Response) {
    try {
        return await response.json()
    } catch {
        return null
    }
}

export default function Signup() {
  const navigate = useNavigate()
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const {setUser} = useAuth()


  async function handleSubmit(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    if (!firstName.trim() || !lastName.trim()) {
            setError('Please enter your first and last name.')
            return
        }
    if (!isValidName(firstName) || !isValidName(lastName)) {
        setError("Names can only contain letters (and ' or - between words).")
        return
    }
    if (!isUflEmail(email)) {
        setError('Please use your @ufl.edu email address.')
        return
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
        setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`)
        return
    }

    setSubmitting(true)

    try{
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        credentials: 'include',
        body: JSON.stringify ({
          email: email.trim(),
          password,
          firstName: firstName.trim(),
          lastName: lastName.trim()
        }),
      })

      const data = await readJson(response)

      if (!response.ok) {
        const message = data?.message;
        if (message && !message.startsWith('ERR_')) {
          setError(message);
        } 
        else if (message === 'ERR_EMAIL_TAKEN') {
          setError('An account with this email already exists.');
        } 
        else {
          setError('Something went wrong. Please try again.');
        }
        return;
      }

       //TODO: edit when homepage is complete
       setUser(data.user)
       navigate('/clubs')

    }
    catch{
      setError('Could not reach the server. Please try again.')
    }
    finally {
      setSubmitting(false)
    }

  }
 

  return (
    <AuthLayout title="Sign Up">
      {error && (
        <Alert variant="danger" className="py-2 small">
          {error}
        </Alert>
      )}
      <Form onSubmit={handleSubmit} noValidate>
        {/* First Name  */}
        <FloatingLabel controlId="firstName" label="First Name" className="mb-3">
          <Form.Control
            type="text"
            placeholder="First Name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className="rounded-3"
            style={{
              backgroundColor: '#D9D9D9',
              border: '1px solid #333',
            }}
          />
        </FloatingLabel>

        {/* Last Name */}
        <FloatingLabel controlId="lastName" label="Last Name" className="mb-3">
          <Form.Control
            type="text"
            placeholder="Last Name"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            className="rounded-3"
            style={{
              backgroundColor: '#D9D9D9',
              border: '1px solid #333',
            }}
          />
        </FloatingLabel>

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

        {/* Sign Up Button */}
        <div className="d-flex justify-content-center">
          <Button
            type="submit"
            disabled = {submitting}
            className="rounded-3 px-5 py-2 fw-semibold"
            style={{
              backgroundColor: '#F07833',
              border: '1px solid #14246D',
              color: '#14246D',
            }}
          >
           {submitting ? 'Creating account... ' : 'Sign Up'}
          </Button>
        </div>

        {/* Already have an account link */}
        <div className="text-center mt-3">
          <span className="text-muted small">Already have an account? </span>
          <Link
            to="/login"
            className="text-decoration-none fw-semibold"
            style={{ color: '#3046C3' }}
          >
            Login
          </Link>
        </div>
      </Form>
    </AuthLayout>
  );
}
