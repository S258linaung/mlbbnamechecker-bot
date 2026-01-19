const express = require('express');
const axios = require('axios');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet());
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type']
}));
app.use(express.json());

// Rate limiting - တစ်ယောက်ကို ၁၅ မိနစ်အတွင်း ၁၀၀ ခါပဲစစ်ခွင့်ပေးမယ်
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP
    message: {
        status: 'error',
        message: 'Too many requests, please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false
});
app.use('/api', limiter);

// Request logging middleware
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url} - IP: ${req.ip}`);
    next();
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: 'MLBB Profile Checker API'
    });
});

// Main endpoint
app.get('/api/check', async (req, res) => {
    try {
        const { id, serverid } = req.query;
        
        console.log(`Checking profile: ID=${id}, ServerID=${serverid}`);
        
        // Input validation
        if (!id || !serverid) {
            return res.status(400).json({
                status: 'error',
                message: 'Missing parameters',
                usage: 'GET /api/check?id=GAME_ID&serverid=SERVER_ID',
                example: '/api/check?id=772413599&serverid=12350'
            });
        }
        
        // Validate formats
        if (!/^\d+$/.test(id)) {
            return res.status(400).json({
                status: 'error',
                message: 'Game ID must contain only numbers'
            });
        }
        
        if (!/^\d{4,5}$/.test(serverid)) {
            return res.status(400).json({
                status: 'error',
                message: 'Server ID must be 4-5 digits'
            });
        }
        
        // Call original MLBB API
        const targetUrl = `https://cekidml.caliph.dev/api/validasi?id=${encodeURIComponent(id)}&serverid=${encodeURIComponent(serverid)}`;
        
        console.log(`Calling external API: ${targetUrl}`);
        
        const response = await axios.get(targetUrl, {
            timeout: 10000, // 10 seconds timeout
            headers: {
                'User-Agent': 'MLBB-Checker-Bot/1.0 (+https://github.com/your-repo)',
                'Accept': 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
            },
            validateStatus: function (status) {
                return status >= 200 && status < 500;
            }
        });
        
        // Log API response
        console.log(`External API response status: ${response.status}`);
        
        // Forward the response with proper status code
        res.status(response.status).json(response.data);
        
    } catch (error) {
        console.error('API Error Details:', {
            message: error.message,
            code: error.code,
            stack: error.stack
        });
        
        let statusCode = 500;
        let errorMessage = 'Internal server error';
        
        if (error.code === 'ECONNABORTED') {
            statusCode = 504;
            errorMessage = 'Request timeout from external service';
        } else if (error.code === 'ENOTFOUND') {
            statusCode = 502;
            errorMessage = 'Cannot connect to external service';
        } else if (error.response) {
            statusCode = 502;
            errorMessage = 'External service error';
        }
        
        res.status(statusCode).json({
            status: 'error',
            message: errorMessage,
            timestamp: new Date().toISOString()
        });
    }
});

// Documentation endpoint
app.get('/docs', (req, res) => {
    res.json({
        service: 'Mobile Legends: Bang Bang Profile Checker API',
        version: '1.0.0',
        description: 'API for checking MLBB player profiles',
        endpoints: [
            {
                path: '/api/check',
                method: 'GET',
                description: 'Check MLBB player profile',
                parameters: [
                    { name: 'id', type: 'string', required: true, description: 'Game ID' },
                    { name: 'serverid', type: 'string', required: true, description: 'Server ID (4-5 digits)' }
                ],
                example: 'https://your-api.onrender.com/api/check?id=772413599&serverid=12350'
            },
            {
                path: '/health',
                method: 'GET',
                description: 'Health check endpoint'
            }
        ],
        rate_limit: '100 requests per 15 minutes per IP'
    });
});

// Root endpoint
app.get('/', (req, res) => {
    res.redirect('/docs');
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        status: 'error',
        message: 'Endpoint not found',
        available_endpoints: ['/api/check', '/health', '/docs']
    });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
        status: 'error',
        message: 'Something went wrong!',
        timestamp: new Date().toISOString()
    });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`
    🚀 MLBB API Server started!
    Port: ${PORT}
    Time: ${new Date().toISOString()}
    Docs: http://localhost:${PORT}/docs
    `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received. Shutting down gracefully...');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('SIGINT received. Shutting down gracefully...');
    process.exit(0);
});
