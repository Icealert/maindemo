const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

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
const rp = require('request-promise');

// Use environment variables for sensitive data
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;

// Enable CORS and JSON parsing
app.use(cors({
  origin: [
    'https://icealert.up.railway.app',
    'http://localhost:3000' // for local development
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Organization'],
  credentials: true,
  optionsSuccessStatus: 200
}));

// Add basic authentication middleware
app.use((req, res, next) => {
    // Parse login and password from headers
    const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
    const [login, password] = Buffer.from(b64auth, 'base64').toString().split(':');

    // Verify credentials
    if (login && password && login === 'Icealert' && password === 'demo') {
        return next();
    }

    // Access denied
    res.set('WWW-Authenticate', 'Basic realm="401"');
    res.status(401).send('Authentication required.');
});

app.use(express.json());
app.use(express.static('public'));

// Function to get OAuth token
async function getToken() {
    try {
        console.log('Requesting access token...');
        
        // Verify credentials before making request
        if (!process.env.CLIENT_ID || !process.env.CLIENT_SECRET) {
            throw new Error('Missing credentials. CLIENT_ID and CLIENT_SECRET must be set.');
        }

        var options = {
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

        console.log('Token request options:', {
            url: options.url,
            method: options.method,
            hasClientId: !!options.form.client_id,
            hasClientSecret: !!options.form.client_secret,
            clientIdStart: options.form.client_id?.substring(0, 5)
        });

        const response = await rp(options);
        console.log('Access token received successfully');
        return response['access_token'];
    } catch (error) {
        console.error("Failed getting an access token:", {
            status: error.statusCode,
            message: error.message,
            error: error.error,
            stack: error.stack
        });
        throw error;
    }
}

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'healthy' });
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

// Start the server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
    console.log('Press Ctrl+C to quit.');
});