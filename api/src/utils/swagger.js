const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Enterprise Document Management System API',
      version: '1.0.0',
      description: 'DMS Backend REST API with authentication, file management, and RBAC',
      contact: {
        name: 'API Support'
      }
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Development server'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      },
      schemas: {
        User: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            email: { type: 'string', format: 'email' },
            role: { type: 'string', enum: ['admin', 'hod', 'user'] },
            department: { type: 'string' },
            status: { type: 'string', enum: ['active', 'suspended'] }
          }
        },
        File: {
          type: 'object',
          properties: {
            fileId: { type: 'string' },
            name: { type: 'string' },
            alias: { type: 'string' },
            type: { type: 'string' },
            size: { type: 'integer' },
            confidentialityLevel: { 
              type: 'string', 
              enum: ['public', 'internal', 'confidential', 'highly_confidential'] 
            }
          }
        },
        LoginRequest: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email' },
            password: { type: 'string' }
          }
        },
        RegisterRequest: {
          type: 'object',
          required: ['name', 'email', 'password', 'department'],
          properties: {
            name: { type: 'string' },
            email: { type: 'string', format: 'email' },
            password: { type: 'string' },
            department: { type: 'string' }
          }
        },
        Error: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        }
      }
    },
    security: [{
      bearerAuth: []
    }]
  },
  apis: ['./src/routes/*.js']
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;