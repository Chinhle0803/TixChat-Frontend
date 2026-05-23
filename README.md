# TixChat Frontend

Realtime chat application frontend built with React, Vite, and Zustand.

## Tech Stack

- **Framework**: React 18 + Vite
- **State Management**: Zustand
- **Routing**: React Router v6
- **HTTP Client**: Axios
- **Real-time**: Socket.IO Client
- **Deployment**: Vercel

## Getting Started

```bash
npm install
npm run dev
```

### Environment Variables

Copy `.env.example` to `.env.local` (or set in Vercel dashboard):

```env
VITE_API_URL=https://your-backend-domain.com/api
VITE_SOCKET_URL=https://your-backend-domain.com
VITE_APP_NAME=TixChat
VITE_MAX_MESSAGE_LENGTH=5000
```

## Deployment

This app is deployed on Vercel. The backend API and Socket.IO server should run behind HTTPS on EC2.

### Required Environment Variables (Vercel)

| Variable | Description |
|----------|-------------|
| `VITE_API_URL` | HTTPS backend API URL, e.g. `https://api.example.com/api` |
| `VITE_SOCKET_URL` | HTTPS backend Socket.IO URL, e.g. `https://api.example.com` |
| `VITE_APP_NAME` | App name |
| `VITE_MAX_MESSAGE_LENGTH` | Max message length |

Do not use a raw EC2 IP with `http://` for Vercel production. Mixed content will be blocked by the browser.

Detailed deployment notes: [../docs/vercel-ec2-deploy.md](../docs/vercel-ec2-deploy.md)

## Features

- Real-time messaging with Socket.IO
- User authentication (JWT)
- One-on-one and group conversations
- File attachments
- Friend system
- User presence (online/offline)
- Message reactions

## License

MIT
