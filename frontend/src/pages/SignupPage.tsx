import AuthLayout from '../components/AuthLayout';
import Form from 'react-bootstrap/Form';
import Button from 'react-bootstrap/Button';
import { Link } from 'react-router-dom';

export default function Signup() {
  return (
    <AuthLayout title="Sign Up">
      {/*TODO: add in API implementation */}
      <Form onSubmit={(e) => e.preventDefault()}>
        {/* First Name  */}
        <Form.Group className="mb-3" controlId="firstName">
          <Form.Label visuallyHidden>First Name</Form.Label>
          <Form.Control
            type="text"
            placeholder="First Name"
            className="rounded-3 py-3 px-3"
            style={{
              backgroundColor: '#D9D9D9',
              border: '1px solid #333',
            }}
          />
        </Form.Group>

        {/* Last Name */}
        <Form.Group className="mb-3" controlId="lastName">
          <Form.Label visuallyHidden>Last Name</Form.Label>

          <Form.Control
            type="text"
            placeholder="Last Name"
            className="rounded-3 py-3 px-3"
            style={{
              backgroundColor: '#D9D9D9',
              border: '1px solid #333',
            }}
          />
        </Form.Group>

        {/* Email */}
        <Form.Group className="mb-3" controlId="email">
          <Form.Label visuallyHidden>UFL Email</Form.Label>
          <Form.Control
            type="email"
            placeholder="UFL email"
            className="rounded-3 py-3 px-3"
            style={{
              backgroundColor: '#D9D9D9',
              border: '1px solid #333',
            }}
          />
        </Form.Group>

        {/* Password */}
        <Form.Group className="mb-4" controlId="password">
          <Form.Label visuallyHidden>Password</Form.Label>
          <Form.Control
            type="password"
            placeholder="Password"
            className="rounded-3 py-3 px-3"
            style={{
              backgroundColor: '#D9D9D9',
              border: '1px solid #333',
            }}
          />
        </Form.Group>

        {/* Sign Up Button */}
        <div className="d-flex justify-content-center">
          <Button
            type="submit"
            className="rounded-3 px-5 py-2 fw-semibold"
            style={{
              backgroundColor: '#F07833',
              border: '1px solid #14246D',
              color: '#14246D',
            }}
          >
            Sign Up
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
