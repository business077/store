# DevStore

A full-stack marketplace app with a React frontend and Express backend.

## Stack
- Frontend: React + Vite
- Backend: Node.js + Express
- Database: MongoDB (optional via MONGO_URI)

## Project structure
- client/: frontend source code
- server/: backend API and server entry

## Local setup

### 1) Install backend dependencies
cd server
npm install

### 2) Install frontend dependencies
cd ../client
npm install

### 3) Start backend
cd ../server
npm run dev

### 4) Start frontend
cd ../client
npm run dev

The frontend will run on http://localhost:5173 and the API on http://localhost:5000.

## Environment
Copy the example env files and update values as needed.

- server/.env.example
- client/.env.example

For production user authentication, configure these server variables for OTP email delivery:

```env
JWT_SECRET=replace-with-a-long-random-secret
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-smtp-user
SMTP_PASSWORD=your-smtp-password
MAIL_FROM=no-reply@example.com
```

Users register and log in at `/auth` with a unique email, username, and password. They can request an email OTP to change either their username or password. Admin authentication remains separate at `/admin`.

Without SMTP settings, the server only exposes a development OTP when `NODE_ENV` is not `production`; configure SMTP before deploying.

## Notes
- The backend exposes a health endpoint at /health
- The API includes a sample /api/products endpoint
- Node modules and environment files are intentionally ignored from Git
