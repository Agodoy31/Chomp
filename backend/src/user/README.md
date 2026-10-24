# Auth & User Notes for Frontend

All backend routes currently start with `/api`. The login and signup routes are `/api/auth/login` and `/api/auth/register`.

### Login & Error Codes

On login, the route is looking for an `email` and `password`. If anything is missing or invalid, it returns a 400 or 401 status with one of the following error codes in the response body (`{ message: "ERR_..." }`):

| Code                      | Meaning                                             |
| :------------------------ | :-------------------------------------------------- |
| `ERR_EMAIL_REQUIRED`      | Missing email in the request                        |
| `ERR_PASSWORD_REQUIRED`   | Missing password in the request                     |
| `ERR_FIRST_NAME_REQUIRED` | Missing first name during registration              |
| `ERR_LAST_NAME_REQUIRED`  | Missing last name during registration               |
| `ERR_EMAIL_TAKEN`         | An account with this email already exists           |
| `ERR_LOGIN_INVALID`       | Incorrect email or password                         |
| `ERR_REQUIRE_AUTH`        | Accessing a protected route without being logged in |
| `ERR_SERVER_ERROR`        | Internal server or database error                   |

On success, login returns `SUCCESS_LOGIN` (200) and signup returns `SUCCESS_REGISTER` (201) along with the `user` object.

### Signup

For signup, the route expects: `firstName`, `lastName`, `email`, and `password`. The email must be a ufl email (the database validation will reject non-UF emails). Right now there are no strict password rules on the backend, but a simple length check should probably happen on the frontend before submitting.

### Cookies & Sessions

Session cookies are handled server-side by `express-session`, which means client-side JavaScript cannot interact with them.

For the browser to save and send cookies, every request that needs an authenticated user needs `credentials: 'include'`:

```typescript
fetch('/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',
  body: JSON.stringify({ email, password }),
});
```

### Protected Routes & Redirects

If you try to access a route that requires a logged-in user and the session is missing or invalid, the backend rejects it with a `401` status and:

```json
{
  "message": "ERR_REQUIRE_AUTH",
  "redirectTo": "/login"
}
```

The `redirectTo: '/login'` is just a temporary frontend route for the login page. The frontend is still responsible for reading this and rerouting if desired.
