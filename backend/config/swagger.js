const path = require('path');
const swaggerJsdoc = require('swagger-jsdoc');

const options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'Zaltix HRMS API',
            version: '1.0.0',
            description: 'API documentation for Zaltix HRMS'
        },
        servers: [
            {
                url: 'http://localhost:5000',
                description: 'Local development server'
            }
        ],
        components: {
            securitySchemes: {
                BearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT'
                }
            }
        }
    },

    // absolute path so docs load no matter where node is started from.
    // glob needs forward slashes, so convert Windows backslashes.
    apis: [path.join(__dirname, '../routes/*.js').replace(/\\/g, '/')]
};

module.exports = swaggerJsdoc(options);