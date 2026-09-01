# DIU Nexus 🎓

A full-featured social platform for Daffodil International University students — built with Express, SQLite, Socket.IO, and Electron.

## Features

- 📰 News Feed (Posts, Reactions, Comments, Stories)
- 💬 Real-time Messenger (Socket.IO)
- 🎬 Reels (TikTok-style video feed)
- 👥 Friends, Groups, Events
- 🔔 Real-time Notifications
- 📚 Academic Resources sharing
- 🎓 GPA/CGPA Calculator
- 🔍 Lost & Found board
- 🏪 Student Marketplace
- 🎭 Anonymous Confessions
- 🚌 DIU Bus Schedule
- 📅 Class Routine planner
- 🌙 Dark Mode

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2a. Run as web server
npm run server
# Open: http://localhost:5000/client/index.html

# 2b. Run as desktop app
npm start

# 2c. Development (auto-restart)
npm run dev
```

## Environment Variables

Create a `.env` file:
```
JWT_SECRET=your-super-secret-key-here
PORT=5000
NODE_ENV=development
```

## Cloud Deployment

### Option 1: Render.com (Recommended)
1. Push code to GitHub
2. Create account at [render.com](https://render.com)
3. Click "New Web Service" → Connect GitHub repo
4. Render auto-detects `render.yaml` — click Deploy
5. Done! Free tier available.

### Option 2: Railway.app
1. Go to [railway.app](https://railway.app)
2. Click "New Project" → Deploy from GitHub
3. Add environment variables in dashboard
4. Deploy!

### Option 3: Vercel (Frontend + Serverless API)
```bash
npm install -g vercel
vercel deploy
```
> Note: SQLite data won't persist on Vercel. Use Turso or PlanetScale for persistent DB.

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop | Electron 25 |
| Backend | Express.js 4 |
| Database | SQLite (WAL mode) |
| Real-time | Socket.IO 4 |
| Auth | JWT + bcrypt |
| File Uploads | Multer |
| Frontend | Vanilla HTML/CSS/JS |
