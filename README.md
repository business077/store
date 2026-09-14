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

## Notes
- The backend exposes a health endpoint at /health
- The API includes a sample /api/products endpoint
- Node modules and environment files are intentionally ignored from Git
