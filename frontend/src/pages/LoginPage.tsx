import AuthLayout from '../components/AuthLayout';
import Form from 'react-bootstrap/Form';
import Button from 'react-bootstrap/Button';
import { Link } from 'react-router-dom';

export default function Login() {
  return (
    <AuthLayout title="Login">
      {/*TODO: add in API implementation */}
      <Form onSubmit={(e) => e.preventDefault()}>
        <Form.Group className="mb-3" controlId="email">
          <Form.Label visuallyHidden>UFL Email</Form.Label>

          {/* Email */}
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

        {/* Login Button */}
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
            Login
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
