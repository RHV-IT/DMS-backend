# DMS Backend

Document Management System (DMS) backend service built with Node.js, Express, and MongoDB.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Features](#features)
- [Technology Stack](#technology-stack)
- [Setup and Installation](#setup-and-installation)
- [Environment Variables](#environment-variables)
- [API Documentation](#api-documentation)
- [Deployment](#deployment)
- [Project Structure](#project-structure)
- [Contributing](#contributing)
- [License](#license)

## Overview

The DMS backend is a robust, secure, and scalable document management system designed to handle file storage, user management, role-based access control, audit logging, and more. It provides RESTful APIs for frontend applications and supports integration with desktop scanner agents and file watchers.

## Architecture

The backend follows a modular architecture with clear separation of concerns:

- **API Layer**: Express.js routes handling HTTP requests and responses
- **Business Logic**: Controllers and services implementing application logic
- **Data Layer**: Mongoose models interacting with MongoDB
- **Middleware**: Custom middleware for authentication, validation, error handling, and more
- **Configuration**: Centralized configuration for database, CORS, logging, etc.
- **Utilities**: Helper functions and reusable components

## Features

- User authentication and authorization (JWT-based)
- Role-based access control (Admin, HOD, User)
- File upload, download, preview, and versioning
- Role-based file access and department isolation
- Confidentiality levels (Public, Internal, Confidential, Highly Confidential)
- File sharing and permission management
- Comprehensive audit logging
- Dashboard analytics and recent activity
- Scanner agent integration for direct scanning
- File watcher for automated file processing
- Backup and restore functionality
- Docker containerization for easy deployment
- RESTful API with comprehensive documentation

## Technology Stack

- **Runtime**: Node.js
- **Web Framework**: Express.js
- **Database**: MongoDB with Mongoose ODM
- **Authentication**: JSON Web Tokens (JWT)
- **Password Security**: bcryptjs
- **File Storage**: Vercel Blob (production), local storage (development)
- **Real-time Communication**: Socket.IO
- **Containerization**: Docker
- **Deployment**: Vercel (for serverless functions), Docker Compose
- **Testing**: Manual testing (to be expanded)

## Setup and Installation

### Prerequisites

- Node.js (v14 or higher)
- MongoDB (v4 or higher)
- Git
- Docker (optional, for containerized deployment)

### Local Development

1. Clone the repository:
   ```bash
   git clone https://github.com/your-username/dms-backend.git
   cd dms-backend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. Start MongoDB (if not running as a service):
   ```bash
   # Using Docker
   docker run -d -p 27017:27017 --name mongo mongo:latest
   ```

5. Seed the database with initial data:
   ```bash
   node api/src/utils/seed.js
   ```

6. Start the development server:
   ```bash
   npm run dev
   # or
   node api/index.js
   ```

The server will start on `http://localhost:5000`.

### Environment Variables

Create a `.env` file in the root directory based on `.env.example`. Key variables include:

- `MONGODB_URI`: MongoDB connection string
- `PORT`: Server port (default: 5000)
- `NODE_ENV`: Environment (development, production)
- `JWT_SECRET`: Secret for signing JWT tokens
- `JWT_EXPIRES_IN`: JWT expiration time
- `REFRESH_TOKEN_SECRET`: Secret for refresh tokens
- `PASSWORD_HISTORY_LIMIT`: Number of passwords to remember
- `BLOB_READ_WRITE_TOKEN`: Vercel Blob token (for production)
- `BLOB_STORE_ID`: Vercel Blob store ID (for production)

## API Documentation

Detailed API documentation is available in [`api/DOCUMENTATION.md`](api/DOCUMENTATION.md). It covers:

- Authentication endpoints
- User management
- File operations (upload, download, preview, versioning)
- Permissions and sharing
- Notifications
- Audit logs
- Dashboard statistics
- Settings management
- Scanner agent integration

## Deployment

### Vercel (Serverless)

The backend is configured for deployment on Vercel as serverless functions. See [`vercel.json`](vercel.json) for configuration.

1. Install Vercel CLI: `npm i -g vercel`
2. Login to Vercel: `vercel login`
3. Deploy: `vercel --prod`

### Docker

The project includes Dockerfiles for development and production:

- `Dockerfile`: Production image
- `Dockerfile.dev`: Development image with hot reloading

To build and run with Docker Compose:

```bash
docker-compose up --build
```

### Traditional Server

For deployment on a traditional server or VM:

1. Install Node.js and MongoDB
2. Clone the repository and install dependencies
3. Set up environment variables
4. Seed the database
5. Start the server with a process manager (PM2, systemd, etc.)

## Project Structure

```
dms-backend/
├── api/                    # Main backend application
│   ├── src/
│   │   ├── controllers/    # Request handlers
│   │   ├── middleware/     # Custom middleware
│   │   ├── models/         # Database models
│   │   ├── routes/         # API route definitions
│   │   ├── config/         # Configuration files
│   │   ├── utils/          # Utility functions
│   │   └── app.js          # Express app setup
│   ├── index.js            # Server entry point
│   └── DOCUMENTATION.md    # API documentation
├── scanner-desktop/        # Desktop scanner application (Electron)
├── scanner-agent/          # Background service for scanner communication
├── watcher/                # File watcher for automated processing
├── scripts/                # Deployment and utility scripts
├── init-scripts/           # Database initialization scripts
├── nginx/                  # Nginx configuration (for reverse proxy)
├── .github/                # GitHub Actions workflows
├── .env.example            # Environment variables template
├── .gitignore              # Git ignore file
├── docker-compose.yml      # Docker Compose configuration
├── Dockerfile              # Production Dockerfile
├── Dockerfile.dev          # Development Dockerfile
├── package.json            # Node.js dependencies and scripts
├── README.md               # This file
└── vercel.json             # Vercel deployment configuration
```

## Contributing

We welcome contributions to improve the DMS backend! Please follow these steps:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a pull request

Please ensure your code follows the existing style and includes appropriate tests.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Thanks to all contributors who have helped shape this project.
- Built with ❤️ for efficient document management.