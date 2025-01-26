const express = require('express');
const cors = require('cors');
const app = express();
const port = 3000;

// Import Arduino IoT client code
const IotApi = require('@arduino/arduino-iot-client');
const rp = require('request-promise');

// Enable CORS and JSON parsing
app.use(cors());
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
            client_id: 'mNXZyIS1sToqYaAq5I2mVhQF9sxAbkyx',
            client_secret: 'CEdhI99emIUQjqEXQivk08ROZpwc9xxtdpVCVAsFG32KU6qYGplyoOIo0DM4EydG',
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
app.put('/api/iot/v2/devices/:id/properties', async (req, res) => {
    try {
        console.log('Received update request for device:', req.params.id);
        console.log('Original request body:', JSON.stringify(req.body, null, 2));

        // Get token first
        const token = await getToken();
        
        var ArduinoIotClient = require('@arduino/arduino-iot-client');
        var defaultClient = ArduinoIotClient.ApiClient.instance;

        // Configure OAuth2 access token for authorization: oauth2
        var oauth2 = defaultClient.authentications['oauth2'];
        oauth2.accessToken = token;

        // Create an instance of the API class
        var api = new ArduinoIotClient.DevicesV2Api();
        
        // Get parameters from request
        var id = req.params.id;
        
        // Create API payload exactly as shown in documentation
        const updatepropertiesDevicesV2Payload = {
            input: true,
            properties: [{
                name: req.body.propertiesValues.properties[0].name,
                type: "json",
                value: req.body.propertiesValues.properties[0].value
            }]
        };
        
        console.log('Sending API payload:', JSON.stringify(updatepropertiesDevicesV2Payload, null, 2));

        // Set up options with organization header if provided
        const opts = req.headers['x-organization'] ? {
            'X-Organization': req.headers['x-organization']
        } : undefined;

        // Make the API call
        try {
            const data = await api.devicesV2UpdateProperties(id, updatepropertiesDevicesV2Payload, opts);
            console.log('API call successful. Response:', JSON.stringify(data, null, 2));
            
            res.json({
                success: true,
                message: 'Property updated successfully',
                data: data,
                timestamp: new Date().toISOString(),
                deviceId: id,
                propertyName: req.body.propertiesValues.properties[0].name
            });
        } catch (apiError) {
            console.error('API call failed:', {
                status: apiError.status,
                statusText: apiError.statusText,
                body: apiError.response?.body,
                error: apiError.error
            });

            res.status(apiError.status || 500).json({
                error: 'Failed to update properties',
                message: apiError.message,
                details: apiError.response?.body || 'No additional details available'
            });
        }

    } catch (error) {
        console.error('Setup error:', error);
        res.status(500).json({
            error: 'Failed to setup request',
            message: error.message
        });
    }
});

// Start the server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
    console.log('Press Ctrl+C to quit.');
});
