const express = require('express');
const cors = require('cors');
const app = express();
// Use environment variables for port
const port = process.env.PORT || 3000;

// Import Arduino IoT client code
const IotApi = require('@arduino/arduino-iot-client');
const rp = require('request-promise');

// Use environment variables for sensitive data
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;

// Enable CORS and JSON parsing
app.use(cors({
  origin: [
    'https://web-production-d2a3c.up.railway.app',
    'http://localhost:3000' // for local development
  ],
  credentials: true
}));
app.use(express.json());
app.use(express.static('public'));

// Function to get OAuth token
async function getToken() {
    var options = {
        method: 'POST',
        url: 'https://api2.arduino.cc/iot/v1/clients/token',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        json: true,
        form: {
            grant_type: 'client_credentials',
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            audience: 'https://api2.arduino.cc/iot'
        }
    };

    try {
        const response = await rp(options);
        return response['access_token'];
    } catch (error) {
        console.error("Failed getting an access token:", error);
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
        var client = IotApi.ApiClient.instance;
        var oauth2 = client.authentications['oauth2'];
        oauth2.accessToken = await getToken();
        
        var devicesApi = new IotApi.DevicesV2Api(client);
        const devices = await devicesApi.devicesV2List();
        
        res.json(devices);
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Failed to fetch devices' });
    }
});

// API endpoint to update device properties
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
  
      // 3) Create both APIs we need:
      //    - DevicesV2Api (to fetch the device/thing info)
      //    - PropertiesV2Api (to publish the new property value)
      const devicesApi = new ArduinoIotClient.DevicesV2Api(defaultClient);
      const propertiesApi = new ArduinoIotClient.PropertiesV2Api(defaultClient);
      // Optional: remove the next line if you're not actually using ThingsV2Api
      // const thingsApi = new ArduinoIotClient.ThingsV2Api(defaultClient);
  
      // 4) Extract parameters
      const deviceId = req.params.id;
      const propertyName = req.body.propertiesValues.properties[0].name;
      const newValue = req.body.propertiesValues.properties[0].value;
  
      // (Optional) If you need the organization header
      const opts = req.headers['x-organization']
        ? { 'X-Organization': req.headers['x-organization'] }
        : undefined;
  
      // 5) Fetch the device info to get the thingId and property list
      const deviceInfo = await devicesApi.devicesV2Show(deviceId, opts);
      const thingId = deviceInfo.thing.id;
  
      // Find the property that matches `propertyName`
      const matchedProp = deviceInfo.thing.properties.find((p) => p.name === propertyName);
      if (!matchedProp) {
        return res.status(404).json({
          error: 'Property not found',
          message: `No property named "${propertyName}" found for device ID "${deviceId}."`
        });
      }
  
      const propertyId = matchedProp.id;
  
      console.log(`