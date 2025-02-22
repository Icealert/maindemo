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

// Add cache for time series data
const timeSeriesCache = new Map();
const TIME_SERIES_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Add monitoring and notification services
const MONITORING_INTERVAL = 60 * 60 * 1000; // 1 hour in milliseconds
const NOTIFICATION_COOLDOWN = 60 * 60 * 1000; // 1 hour in milliseconds

// Track last notification times
const lastNotificationTimes = new Map();

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
        
        // Get the list of devices
        const devices = await devicesApi.devicesV2List();
        
        // Get detailed information for each device
        const detailedDevices = await Promise.all(devices.map(async (device) => {
            try {
                // Get detailed device info including connection status
                const detailedDevice = await devicesApi.devicesV2Show(device.id);
                
                // Calculate if device is actually connected based on last activity
                const lastActivity = new Date(detailedDevice.last_activity_at);
                const now = new Date();
                const minutesSinceLastActivity = (now - lastActivity) / (1000 * 60);
                
                // Consider device connected if activity within last 5 minutes
                const isRecentlyActive = minutesSinceLastActivity < 5;
                
                // Add connection status to the device object
                return {
                    ...detailedDevice,
                    connection_status: isRecentlyActive ? 'CONNECTED' : 'DISCONNECTED',
                    last_connection_time: detailedDevice.last_activity_at
                };
            } catch (error) {
                console.error(`Error fetching details for device ${device.id}:`, error);
                return {
                    ...device,
                    connection_status: 'DISCONNECTED',
                    last_connection_time: null
                };
            }
        }));
        
        console.log(`Found ${detailedDevices.length} devices with connection status`);
        res.json(detailedDevices);
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
        console.log('Property update received:', {
            deviceId: req.params.id,
            body: JSON.stringify(req.body, null, 2)
        });

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
            console.log('Critical status update detected:', {
                deviceId: req.params.id,
                newValue: criticalUpdate.value
            });
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

// Time series data endpoint with caching
app.get('/api/proxy/timeseries/:thingId/:propertyId', async (req, res) => {
    try {
        const { thingId, propertyId } = req.params;
        const { aggregation, desc, from, to, interval } = req.query;
        
        // Generate cache key based on request parameters
        const cacheKey = `${thingId}-${propertyId}-${from}-${to}-${interval}`;
        
        // Check cache first
        const cachedData = timeSeriesCache.get(cacheKey);
        if (cachedData && cachedData.timestamp > Date.now() - TIME_SERIES_CACHE_TTL) {
            return res.json(cachedData.data);
        }

        const token = await getToken();
        const ArduinoIotClient = require('@arduino/arduino-iot-client');
        const defaultClient = ArduinoIotClient.ApiClient.instance;
        const oauth2 = defaultClient.authentications['oauth2'];
        oauth2.accessToken = token;

        const propsApi = new ArduinoIotClient.PropertiesV2Api(defaultClient);

        let opts = {};
        if (aggregation) opts.aggregation = aggregation;
        if (typeof desc !== 'undefined') opts.desc = (desc === 'true');
        if (from) opts.from = from;
        if (to) opts.to = to;
        if (interval) opts.interval = parseInt(interval);
        if (req.headers['x-organization']) opts['X-Organization'] = req.headers['x-organization'];

        const timeseriesData = await propsApi.propertiesV2Timeseries(thingId, propertyId, opts);
        
        // Cache the response
        timeSeriesCache.set(cacheKey, {
            timestamp: Date.now(),
            data: timeseriesData
        });

        // Clean up old cache entries
        const now = Date.now();
        for (const [key, value] of timeSeriesCache.entries()) {
            if (value.timestamp < now - TIME_SERIES_CACHE_TTL) {
                timeSeriesCache.delete(key);
            }
        }

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
                <h1 style="margin: 0; font-size: 32px; font-weight: 600;">🚨 Critical Alert</h1>
                <p style="margin: 10px 0 0 0; opacity: 0.9; font-size: 18px;">Immediate Attention Required</p>
            </div>
            
            <!-- Main Content -->
            <div style="background-color: white; padding: 30px; border-radius: 0 0 8px 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                <!-- Device Info -->
                <div style="margin-bottom: 25px; padding-bottom: 20px; border-bottom: 1px solid #eee;">
                    <h2 style="color: #333; margin: 0 0 10px 0; font-size: 28px;">${deviceName}</h2>
                    <p style="color: #666; font-size: 18px; margin: 0;">
                        <strong style="color: #444;">Location:</strong> 
                        <span style="background: #f8f9fa; padding: 3px 8px; border-radius: 4px;">${location}</span>
                    </p>
                </div>
                
                <!-- Alert Details -->
                <div style="background: #fff4f4; padding: 25px; border-radius: 8px; border-left: 6px solid #ff4444; margin: 20px 0;">
                    ${criticalReasons.map(reason => reason.replace(
                        '<div class="alert">',
                        '<div style="margin-bottom: 20px; padding: 20px; background: white; border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.08);">'
                    ).replace(
                        '<strong>',
                        '<strong style="font-size: 24px; color: #ff4444; display: block; margin-bottom: 10px;">'
                    ).replace(
                        '<br>',
                        '</strong><div style="font-size: 20px; color: #444; line-height: 1.5;">'
                    ).replace(
                        'Current:',
                        '<span style="color: #ff6b6b;">Current:</span>'
                    ).replace(
                        'Threshold:',
                        '<span style="color: #ff6b6b;">Threshold:</span>'
                    ).replace(
                        'Time without flow:',
                        '<span style="color: #ff6b6b;">Time without flow:</span>'
                    ).replace(
                        'Critical threshold:',
                        '<span style="color: #ff6b6b;">Critical threshold:</span>'
                    ).replace(
                        '</div>',
                        '</div></div>'
                    )).join('')}
                </div>
                
                <!-- Action Button -->
                <div style="margin: 30px 0; text-align: center;">
                    <a href="https://freezesense.up.railway.app/" 
                       style="display: inline-block; background: linear-gradient(135deg, #0066cc 0%, #0052a3 100%); 
                              color: white; padding: 16px 32px; text-decoration: none; border-radius: 6px;
                              font-weight: 600; font-size: 18px; transition: all 0.3s ease;">
                        View Dashboard
                    </a>
                </div>
                
                <!-- Footer -->
                <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; text-align: center;">
                    <p style="color: #666; font-size: 16px; margin: 0;">
                        This is an automated alert from <strong>FreezeSense</strong>.<br>
                        Please verify all critical alerts through physical inspection.
                    </p>
                    <p style="color: #888; font-size: 14px; margin: 10px 0 0 0;">
                        Alert generated at: ${new Date().toLocaleString('en-US', { 
                            timeZone: 'America/Chicago',
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                            hour12: true
                        })} CST
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

// Function to check device status and send notifications
async function monitorDevicesAndNotify() {
    try {
        // Get OAuth token
        const token = await getToken();
        if (!token) {
            console.error('Failed to get token for device monitoring');
            return;
        }

        // Set up Arduino IoT client
        const client = IotApi.ApiClient.instance;
        client.authentications['oauth2'].accessToken = token;
        const devicesApi = new IotApi.DevicesV2Api(client);

        // Fetch all devices
        const devices = await devicesApi.devicesV2List();
        
        // Process each device
        for (const device of devices) {
            try {
                await checkDeviceStatus(device, devicesApi);
            } catch (error) {
                console.error(`Error checking device ${device.id}:`, error);
            }
        }
    } catch (error) {
        console.error('Error in device monitoring:', error);
    }
}

// Function to check individual device status
async function checkDeviceStatus(device, devicesApi) {
    const status = await calculateDeviceStatus(device, devicesApi);
    const deviceId = device.id;

    // Get notification email
    const emailProp = device.thing?.properties?.find(p => p.name === 'notificationEmail');
    const notificationEmail = emailProp?.last_value;

    if (!notificationEmail) {
        console.log(`No notification email set for device ${deviceId}`);
        return;
    }

    // Check if we should send a notification
    const lastNotification = lastNotificationTimes.get(deviceId) || 0;
    const timeSinceLastNotification = Date.now() - lastNotification;

    if (timeSinceLastNotification < NOTIFICATION_COOLDOWN) {
        console.log(`Skipping notification for device ${deviceId} - cooldown period not elapsed`);
        return;
    }

    // Prepare notification if needed
    if (status.needsNotification) {
        const emailContent = generateEmailContent(device, status);
        await sendNotificationEmail(device, notificationEmail, emailContent);
        lastNotificationTimes.set(deviceId, Date.now());

        // Update device status properties if needed
        if (status.shouldUpdateWarning || status.shouldUpdateCritical) {
            await updateDeviceStatus(device, status, devicesApi);
        }
    }
}

// Function to calculate device status
async function calculateDeviceStatus(device, devicesApi) {
    const properties = device.thing?.properties || [];
    
    // Get current warning and critical states
    const warningProp = properties.find(p => p.name === 'warning');
    const criticalProp = properties.find(p => p.name === 'critical');
    const currentWarning = warningProp?.last_value === true;
    const currentCritical = criticalProp?.last_value === true;

    // Get temperature data
    const cloudTemp = properties.find(p => p.name === 'cloudtemp')?.last_value;
    const tempThresholdMax = properties.find(p => p.name === 'tempThresholdMax')?.last_value;

    // Get flow data
    const cloudFlowRate = properties.find(p => p.name === 'cloudflowrate');
    const noFlowCriticalTime = properties.find(p => p.name === 'noFlowCriticalTime')?.last_value;
    const flowLastUpdate = cloudFlowRate?.value_updated_at;
    const timeSinceFlowHours = flowLastUpdate ? 
        (Date.now() - new Date(flowLastUpdate).getTime()) / (1000 * 60 * 60) : null;

    // Calculate status conditions
    const isTemperatureBad = cloudTemp !== undefined && tempThresholdMax !== undefined && 
        cloudTemp > tempThresholdMax;
    const isFlowBad = timeSinceFlowHours !== null && !isNaN(noFlowCriticalTime) && 
        timeSinceFlowHours >= noFlowCriticalTime;

    // Determine new status
    const shouldBeWarning = isTemperatureBad !== isFlowBad; // XOR - only one condition is bad
    const shouldBeCritical = isTemperatureBad && isFlowBad; // Both conditions are bad

    // Check if status has changed
    const statusChanged = (shouldBeWarning !== currentWarning) || (shouldBeCritical !== currentCritical);
    const needsNotification = statusChanged && (shouldBeWarning || shouldBeCritical);

    return {
        shouldBeWarning,
        shouldBeCritical,
        shouldUpdateWarning: shouldBeWarning !== currentWarning,
        shouldUpdateCritical: shouldBeCritical !== currentCritical,
        needsNotification,
        isTemperatureBad,
        isFlowBad,
        cloudTemp,
        tempThresholdMax,
        timeSinceFlowHours,
        noFlowCriticalTime
    };
}

// Function to generate email content
function generateEmailContent(device, status) {
    const location = device.thing?.properties?.find(p => p.name === 'location')?.last_value || 'Unknown location';
    const deviceName = device.name || device.id;
    
    let subject = `Alert: ${deviceName} at ${location} - `;
    let issues = [];

    if (status.isTemperatureBad) {
        const tempF = (status.cloudTemp * 9/5) + 32;
        const thresholdF = (status.tempThresholdMax * 9/5) + 32;
        issues.push(`Temperature is high: ${tempF.toFixed(1)}°F (Threshold: ${thresholdF.toFixed(1)}°F)`);
    }

    if (status.isFlowBad) {
        issues.push(`No water flow detected for ${status.timeSinceFlowHours.toFixed(1)} hours (Critical: ${status.noFlowCriticalTime} hours)`);
    }

    subject += status.shouldBeCritical ? 'CRITICAL STATUS' : 'Warning Status';

    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: ${status.shouldBeCritical ? '#dc2626' : '#d97706'};">
                ${status.shouldBeCritical ? 'Critical Alert' : 'Warning Alert'}
            </h2>
            <p><strong>Device:</strong> ${deviceName}</p>
            <p><strong>Location:</strong> ${location}</p>
            <div style="margin: 20px 0; padding: 15px; background-color: ${status.shouldBeCritical ? '#fee2e2' : '#fef3c7'}; border-radius: 8px;">
                <h3 style="margin-top: 0;">Issues Detected:</h3>
                <ul style="margin: 0; padding-left: 20px;">
                    ${issues.map(issue => `<li style="margin: 10px 0;">${issue}</li>`).join('')}
                </ul>
            </div>
            <p style="font-size: 0.9em; color: #666;">
                This is an automated message from your FreezeSense monitoring system.
                Please check your device dashboard for more details.
            </p>
        </div>
    `;

    return { subject, html };
}

// Function to update device status
async function updateDeviceStatus(device, status, devicesApi) {
    const thingId = device.thing.id;
    
    if (status.shouldUpdateWarning) {
        await devicesApi.propertiesV2Publish(thingId, 'warning', {
            value: status.shouldBeWarning
        });
    }
    
    if (status.shouldUpdateCritical) {
        await devicesApi.propertiesV2Publish(thingId, 'critical', {
            value: status.shouldBeCritical
        });
    }
}

// Start the monitoring service
setInterval(monitorDevicesAndNotify, MONITORING_INTERVAL);

// Run initial check when server starts
monitorDevicesAndNotify();

// Start the server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
    console.log('Press Ctrl+C to quit.');
});

async function handleCriticalUpdate(deviceId, criticalValue) {
    try {
        console.log('Handling critical update:', {
            deviceId,
            criticalValue,
            criticalValueType: typeof criticalValue,
            rawValue: criticalValue
        });

        const client = IotApi.ApiClient.instance;
        client.authentications['oauth2'].accessToken = await getToken();
        const devicesApi = new IotApi.DevicesV2Api(client);
        const device = await devicesApi.devicesV2Show(deviceId);

        const emailProp = device.thing.properties.find(p => p.name === 'notificationEmail');
        console.log('Email property found:', {
            hasEmail: !!emailProp,
            emailValue: emailProp?.last_value
        });

        if (!emailProp?.last_value) {
            console.log('No email configured for device:', deviceId);
            return;
        }

        // Handle different types of boolean values from Arduino Cloud
        const isCritical = (
            criticalValue === true || 
            criticalValue === 1 || 
            String(criticalValue).toLowerCase() === 'true' ||
            String(criticalValue) === '1'
        );

        console.log('Critical status evaluation:', {
            rawValue: criticalValue,
            isCritical: isCritical
        });

        const lastSent = lastSentTimes.get(deviceId) || 0;
        const cooldown = 60 * 60 * 1000; // 1 hour
        const timeSinceLast = Date.now() - lastSent;
        
        console.log('Notification timing check:', {
            deviceId,
            isCritical,
            lastSent: new Date(lastSent).toISOString(),
            timeSinceLast: Math.floor(timeSinceLast / 1000 / 60) + ' minutes',
            cooldownPeriod: Math.floor(cooldown / 1000 / 60) + ' minutes',
            canSendNotification: !lastSent || timeSinceLast >= cooldown
        });

        if (isCritical) {
            if (!lastSent || timeSinceLast >= cooldown) {
                console.log('Sending notification email for device:', deviceId);
                await sendNotificationEmail(device, emailProp.last_value);
                lastSentTimes.set(deviceId, Date.now());
                console.log('Notification sent and timestamp updated');
            } else {
                console.log('Skipping notification - cooldown period not elapsed');
            }
        } else {
            if (lastSent) {
                console.log('Device no longer critical, removing from tracking');
                lastSentTimes.delete(deviceId);
            }
        }
    } catch (error) {
        console.error('Critical update handling failed:', error);
        throw error;
    }
}