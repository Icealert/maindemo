const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const nodemailer = require('nodemailer');
const winston = require('winston');
const compression = require('compression');
const rp = require('request-promise');
require('winston-daily-rotate-file');

// Load environment variables
dotenv.config();

// Configure Winston logger with rotation and compression
const logger = winston.createLogger({
    transports: [
        new winston.transports.DailyRotateFile({
            filename: 'logs/app-%DATE%.log',
            datePattern: 'YYYY-MM-DD',
            maxSize: '10m',
            maxFiles: '7d',
            zippedArchive: true,
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.json()
            )
        })
    ]
});

// Memory cleanup interval (every 5 minutes)
const CLEANUP_INTERVAL = 5 * 60 * 1000;

// Initialize Maps with max sizes
const lastSentTimes = new Map();
const MAX_MAP_SIZE = 100; // Reduced from 500 to minimize memory footprint

// Cache for OAuth tokens with expiration
let tokenCache = {
    token: null,
    expiresAt: null
};

// Cleanup function for Maps and Cache
function cleanupMemory() {
    // Clean up lastSentTimes map more aggressively
    if (lastSentTimes.size > MAX_MAP_SIZE) {
        const entriesToKeep = Array.from(lastSentTimes.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, MAX_MAP_SIZE / 2);
        lastSentTimes.clear();
        entriesToKeep.forEach(([key, value]) => lastSentTimes.set(key, value));
    }

    // Clear expired token
    if (tokenCache.expiresAt && Date.now() > tokenCache.expiresAt) {
        tokenCache = { token: null, expiresAt: null };
    }

    // Force garbage collection if available
    if (global.gc) {
        global.gc();
    }
}

// Schedule more frequent cleanups
setInterval(cleanupMemory, CLEANUP_INTERVAL / 5);

// Log environment status (without sensitive data)
console.log('Starting server with environment:', {
    NODE_ENV: process.env.NODE_ENV,
    PORT: process.env.PORT,
    HAS_CLIENT_ID: !!process.env.CLIENT_ID,
    HAS_CLIENT_SECRET: !!process.env.CLIENT_SECRET
});

// Verify required environment variables
const requiredEnvVars = ['CLIENT_ID', 'CLIENT_SECRET'];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
    console.error('Missing required environment variables:', missingEnvVars);
    console.error('Please set these variables in Railway dashboard');
    process.exit(1);
}

const app = express();
const port = process.env.PORT || 8080;

// Import Arduino IoT client code
const IotApi = require('@arduino/arduino-iot-client');

// Use environment variables for sensitive data
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;

// Enable compression for all responses
app.use(compression());

// Configure CORS with specific origins
const allowedOrigins = [
    'https://freezesense.up.railway.app',
    'http://localhost:3000'
];

app.use(cors({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Organization'],
    credentials: true,
    optionsSuccessStatus: 200
}));

// Parse JSON with size limits
app.use(express.json({ limit: '1mb' }));
app.use(express.static('public', {
    maxAge: '1h',
    etag: true
}));

// Configure email transporter
const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    },
    tls: {
        rejectUnauthorized: false
    }
});

// Add to the top of server.js
if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.warn('Email notifications disabled - missing EMAIL_USER/EMAIL_PASS in environment');
}

// Function to get OAuth token with caching
async function getToken() {
    try {
        // Check cache first
        if (tokenCache.token && tokenCache.expiresAt && Date.now() < tokenCache.expiresAt) {
            return tokenCache.token;
        }

        // Verify credentials
        if (!process.env.CLIENT_ID || !process.env.CLIENT_SECRET) {
            throw new Error('Missing credentials. CLIENT_ID and CLIENT_SECRET must be set.');
        }

        const options = {
            method: 'POST',
            url: 'https://api2.arduino.cc/iot/v1/clients/token',
            headers: { 
                'content-type': 'application/x-www-form-urlencoded',
                'accept': 'application/json'
            },
            form: {
                grant_type: 'client_credentials',
                client_id: process.env.CLIENT_ID,
                client_secret: process.env.CLIENT_SECRET,
                audience: 'https://api2.arduino.cc/iot'
            },
            json: true
        };

        const response = await rp(options);
        
        // Cache the token with expiration (1 hour before actual expiration)
        tokenCache = {
            token: response['access_token'],
            expiresAt: Date.now() + (response['expires_in'] - 3600) * 1000
        };

        return tokenCache.token;
    } catch (error) {
        logger.error('Token fetch error:', error);
        throw error;
    }
}

// Health check endpoint
app.get('/health', (req, res) => {
    const used = process.memoryUsage();
    res.json({
        status: 'healthy',
        memory: {
            heapUsed: Math.round(used.heapUsed / 1024 / 1024) + 'MB',
            heapTotal: Math.round(used.heapTotal / 1024 / 1024) + 'MB',
            rss: Math.round(used.rss / 1024 / 1024) + 'MB'
        }
    });
});

// API endpoint to get devices data
app.get('/api/devices', async (req, res) => {
    try {
        console.log('Fetching devices...');
        var client = IotApi.ApiClient.instance;
        var oauth2 = client.authentications['oauth2'];
        oauth2.accessToken = await getToken();
        
        console.log('Token received, fetching devices list...');
        var devicesApi = new IotApi.DevicesV2Api(client);
        const devices = await devicesApi.devicesV2List();
        
        console.log(`Found ${devices.length} devices`);
        res.json(devices);
    } catch (error) {
        console.error('Error fetching devices:', {
            status: error.statusCode,
            message: error.message,
            error: error.error
        });
        res.status(500).json({ 
            error: 'Failed to fetch devices',
            details: error.message
        });
    }
});

// API endpoint to update device properties
app.put('/api/iot/v2/devices/:id/properties', async (req, res) => {
    try {
        console.log('Received update request for device:', req.params.id);
        console.log('Original request body:', JSON.stringify(req.body, null, 2));

        // 1) Get token first
        const token = await getToken();

        // 2) Set up the Arduino IoT client with OAuth2 token
        const ArduinoIotClient = require('@arduino/arduino-iot-client');
        const defaultClient = ArduinoIotClient.ApiClient.instance;
        const oauth2 = defaultClient.authentications['oauth2'];
        oauth2.accessToken = token;

        // 3) Create APIs we need
        const devicesApi = new ArduinoIotClient.DevicesV2Api(defaultClient);
        const propertiesApi = new ArduinoIotClient.PropertiesV2Api(defaultClient);

        // 4) Extract parameters
        const deviceId = req.params.id;
        const propertyName = req.body.propertiesValues.properties[0].name;
        const newValue = req.body.propertiesValues.properties[0].value;

        // Get organization header if present
        const opts = req.headers['x-organization']
            ? { 'X-Organization': req.headers['x-organization'] }
            : undefined;

        // 5) Fetch device info
        const deviceInfo = await devicesApi.devicesV2Show(deviceId, opts);
        const thingId = deviceInfo.thing.id;

        // Find matching property
        const matchedProp = deviceInfo.thing.properties.find((p) => p.name === propertyName);
        if (!matchedProp) {
            return res.status(404).json({
                error: 'Property not found',
                message: `No property named "${propertyName}" found for device ID "${deviceId}"`
            });
        }

        const propertyId = matchedProp.id;

        // 6) Publish the new value
        const publishPayload = { value: newValue };
        const data = await propertiesApi.propertiesV2Publish(thingId, propertyId, publishPayload, opts);

        // Check if critical status is being updated
        const criticalUpdate = req.body.propertiesValues.properties.find(
            p => p.name === 'critical'
        );
        
        if (criticalUpdate) {
            await handleCriticalUpdate(deviceId, criticalUpdate.value);
        }

        // 7) Send response
        res.json({
            success: true,
            message: 'Property updated successfully',
            data: data,
            timestamp: new Date().toISOString(),
            deviceId,
            propertyName
        });

    } catch (error) {
        console.error('Update error:', error);
        const status = error.status || 500;
        res.status(status).json({
            error: 'Failed to update properties',
            message: error.message
        });
    }
});

// Time series data endpoint
app.get('/api/proxy/timeseries/:thingId/:propertyId', async (req, res) => {
    try {
        const token = await getToken();
        
        const ArduinoIotClient = require('@arduino/arduino-iot-client');
        const defaultClient = ArduinoIotClient.ApiClient.instance;
        const oauth2 = defaultClient.authentications['oauth2'];
        oauth2.accessToken = token;

        const propsApi = new ArduinoIotClient.PropertiesV2Api(defaultClient);
        const { thingId, propertyId } = req.params;
        const { aggregation, desc, from, to, interval } = req.query;

        let opts = {};
        if (aggregation) opts.aggregation = aggregation;
        if (typeof desc !== 'undefined') opts.desc = (desc === 'true');
        if (from) opts.from = from;
        if (to) opts.to = to;
        if (interval) opts.interval = parseInt(interval);
        if (req.headers['x-organization']) opts['X-Organization'] = req.headers['x-organization'];

        const timeseriesData = await propsApi.propertiesV2Timeseries(thingId, propertyId, opts);
        res.json(timeseriesData);

    } catch (error) {
        console.error('Time-series error:', error);
        res.status(error.status || 500).json({
            error: 'Failed to fetch time-series data',
            message: error.message
        });
    }
});

// Modify notification check interval to use streaming and batching
async function* getDevicesStream(devicesApi) {
    const BATCH_SIZE = 5;
    let offset = 0;
    
    while (true) {
        const devices = await devicesApi.devicesV2List();
        if (!devices || devices.length === 0) break;
        
        for (let i = 0; i < devices.length; i += BATCH_SIZE) {
            yield devices.slice(i, i + BATCH_SIZE);
            // Small delay between batches to prevent memory spikes
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        offset += devices.length;
        if (devices.length < BATCH_SIZE) break;
    }
}

// Modify your notification check interval to use less memory
setInterval(async () => {
    try {
        const client = IotApi.ApiClient.instance;
        client.authentications['oauth2'].accessToken = await getToken();
        const devicesApi = new IotApi.DevicesV2Api(client);
        
        // Process devices in smaller chunks using generator
        for await (const deviceBatch of getDevicesStream(devicesApi)) {
            for (const device of deviceBatch) {
                const emailProp = device.thing.properties.find(p => p.name === 'notificationEmail');
                const criticalProp = device.thing.properties.find(p => p.name === 'critical');
                
                if (!emailProp?.last_value) continue;
                
                const isCritical = String(criticalProp?.last_value).toLowerCase() === 'true';
                const lastSent = lastSentTimes.get(device.id) || 0;
                const cooldown = 60 * 60 * 1000;
                
                if (isCritical && Date.now() - lastSent >= cooldown) {
                    await sendNotificationEmail(device, emailProp.last_value);
                    lastSentTimes.set(device.id, Date.now());
                } else if (!isCritical) {
                    lastSentTimes.delete(device.id);
                }
            }
        }
    } catch (error) {
        console.error('Notification check failed:', error.message);
    }
}, 300000);

// Optimize email sending to use less memory
async function sendNotificationEmail(device, email) {
    try {
        const deviceName = device.name || 'Unnamed Device';
        const location = device.thing.properties.find(p => p.name === 'location')?.last_value || 'Unknown location';
        const criticalReasons = [];

        // Process properties one at a time and clean up references
        const tempProp = device.thing.properties.find(p => p.name === 'cloudtemp');
        const tempThreshold = device.thing.properties.find(p => p.name === 'tempThresholdMax');
        if (tempProp && tempThreshold && tempProp.last_value > tempThreshold.last_value) {
            // Convert Celsius to Fahrenheit
            const currentTempF = (tempProp.last_value * 9/5) + 32;
            const thresholdTempF = (tempThreshold.last_value * 9/5) + 32;
            criticalReasons.push(`<div class="alert">
                <strong>High Temperature Alert</strong><br>
                Current: ${currentTempF.toFixed(1)}°F<br>
                Threshold: ${thresholdTempF.toFixed(1)}°F
            </div>`);
        }

        const flowProp = device.thing.properties.find(p => p.name === 'cloudflowrate');
        const flowThreshold = device.thing.properties.find(p => p.name === 'noFlowCriticalTime');
        if (flowProp && flowThreshold && flowProp.last_value === 0) {
            // Calculate time since flow using value_updated_at
            const flowLastUpdate = flowProp.value_updated_at;
            const timeSinceFlowMs = flowLastUpdate ? new Date() - new Date(flowLastUpdate) : null;
            const timeSinceFlowHours = timeSinceFlowMs ? timeSinceFlowMs / (1000 * 60 * 60) : null;
            
            // Calculate hours and minutes
            const hours = Math.floor(timeSinceFlowHours);
            const minutes = Math.floor((timeSinceFlowHours - hours) * 60);
            
            criticalReasons.push(`<div class="alert">
                <strong>No Water Flow Alert</strong><br>
                Time without flow: ${hours} hours ${minutes} minutes<br>
                Critical threshold: ${flowThreshold.last_value} hours
            </div>`);
        }

        // Send minimal HTML email with reduced memory footprint
        const htmlContent = `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 0; background-color: #f8f9fa;">
            <!-- Header -->
            <div style="background: linear-gradient(135deg, #ff4444 0%, #ff6b6b 100%); color: white; padding: 30px 20px; text-align: center; border-radius: 8px 8px 0 0;">
                <h1 style="margin: 0; font-size: 28px; font-weight: 600;">🚨 Critical Alert</h1>
                <p style="margin: 10px 0 0 0; opacity: 0.9; font-size: 16px;">Immediate Attention Required</p>
            </div>
            
            <!-- Main Content -->
            <div style="background-color: white; padding: 30px; border-radius: 0 0 8px 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                <!-- Device Info -->
                <div style="margin-bottom: 25px; padding-bottom: 20px; border-bottom: 1px solid #eee;">
                    <h2 style="color: #333; margin: 0 0 10px 0; font-size: 24px;">${deviceName}</h2>
                    <p style="color: #666; font-size: 16px; margin: 0;">
                        <strong style="color: #444;">Location:</strong> 
                        <span style="background: #f8f9fa; padding: 3px 8px; border-radius: 4px;">${location}</span>
                    </p>
                </div>
                
                <!-- Alert Details -->
                <div style="background: #fff4f4; padding: 20px; border-radius: 8px; border-left: 4px solid #ff4444; margin: 20px 0;">
                    ${criticalReasons.map(reason => reason.replace(
                        '<div class="alert">',
                        '<div style="margin-bottom: 15px; padding: 15px; background: white; border-radius: 6px; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">'
                    )).join('')}
                </div>
                
                <!-- Action Button -->
                <div style="margin: 30px 0; text-align: center;">
                    <a href="https://freezesense.up.railway.app/" 
                       style="display: inline-block; background: linear-gradient(135deg, #0066cc 0%, #0052a3 100%); 
                              color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px;
                              font-weight: 600; font-size: 16px; transition: all 0.3s ease;">
                        View Dashboard
                    </a>
                </div>
                
                <!-- Footer -->
                <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; text-align: center;">
                    <p style="color: #666; font-size: 14px; margin: 0;">
                        This is an automated alert from <strong>FreezeSense</strong>.<br>
                        Please verify all critical alerts through physical inspection.
                    </p>
                    <p style="color: #888; font-size: 12px; margin: 10px 0 0 0;">
                        Alert generated at: ${new Date().toLocaleString()}
                    </p>
                </div>
            </div>
        </div>`;
        
        await transporter.sendMail({
            from: {
                name: 'FreezeSense Alert System',
                address: process.env.EMAIL_USER
            },
            to: email,
            subject: `🚨 CRITICAL Alert: ${deviceName} at ${location}`,
            html: htmlContent
        });

        logger.info(`Alert sent to ${email} for device ${device.id}`);
        
        // Clear references to help GC
        criticalReasons.length = 0;
    } catch (error) {
        logger.error('Email failed:', error);
    }
}

// Add to server.js
app.post('/api/notifications/settings', async (req, res) => {
    try {
        const { deviceId, email, enabled } = req.body;
        
        // Validate email format
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({ error: 'Invalid email format' });
        }

        // Get the device
        const client = IotApi.ApiClient.instance;
        client.authentications['oauth2'].accessToken = await getToken();
        const devicesApi = new IotApi.DevicesV2Api(client);
        const device = await devicesApi.devicesV2Show(deviceId);

        // Update properties
        const propertiesApi = new IotApi.PropertiesV2Api(client);
        const thingId = device.thing.id;

        // Update email property
        const emailProp = device.thing.properties.find(p => p.name === 'notificationEmail');
        await propertiesApi.propertiesV2Publish(thingId, emailProp.id, { value: email });

        // Update notification enabled property
        const notifyProp = device.thing.properties.find(p => p.name === 'notificationsEnabled');
        await propertiesApi.propertiesV2Publish(thingId, notifyProp.id, { value: enabled });

        res.json({ success: true });

    } catch (error) {
        console.error('Notification settings error:', error);
        res.status(500).json({ 
            error: 'Failed to save settings',
            details: error.message 
        });
    }
});

// Start the server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
    console.log('Press Ctrl+C to quit.');
});

async function handleCriticalUpdate(deviceId, criticalValue) {
    try {
        const client = IotApi.ApiClient.instance;
        client.authentications['oauth2'].accessToken = await getToken();
        const devicesApi = new IotApi.DevicesV2Api(client);
        const device = await devicesApi.devicesV2Show(deviceId);

        const emailProp = device.thing.properties.find(p => p.name === 'notificationEmail');
        if (!emailProp?.last_value) return;

        const isCritical = String(criticalValue).toLowerCase() === 'true';
        const lastSent = lastSentTimes.get(deviceId) || 0;
        const cooldown = 60 * 60 * 1000; // 1 hour in milliseconds

        const timeSinceLast = Date.now() - lastSent;
        
        if (isCritical) {
            if (!lastSent || timeSinceLast >= cooldown) {
                await sendNotificationEmail(device, emailProp.last_value);
                lastSentTimes.set(deviceId, Date.now());
            }
        } else {
            if (lastSent) lastSentTimes.delete(deviceId);
        }
    } catch (error) {
        console.error('Immediate notification failed:', error);
    }
}