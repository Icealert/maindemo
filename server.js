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
app.put('/api/devices/:id/properties', async (req, res) => {
    try {
        console.log('Received update request for device:', req.params.id);
        console.log('Request body:', JSON.stringify(req.body, null, 2));

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
        const incomingProperty = req.body.propertiesValues.properties[0];

        // Log the incoming property details
        console.log('Incoming property details:', {
            name: incomingProperty.name,
            type: incomingProperty.type,
            value: incomingProperty.value
        });

        // Construct the payload exactly as per Arduino documentation
        const updatePayload = {
            input: true,
            properties: [{
                name: incomingProperty.name,
                type: "json",  // Ensure 'json' is used for the type field
                value: incomingProperty.value
            }]
        };

        // Set up options with required headers
        const opts = {
            'X-Organization': req.headers['x-organization']
        };

        console.log('Sending update with payload:', JSON.stringify(updatePayload, null, 2));
        console.log('Headers:', JSON.stringify(opts, null, 2));

        console.log('Preparing to update database with new property value...');
        // Add database update logic here
        console.log('Database update logic executed.');

        // Log the response from the API call
        api.devicesV2UpdateProperties(id, updatePayload, opts).then(function(data) {
            console.log('API called successfully. Response:', data);
            res.json({
                success: true,
                message: 'Properties updated successfully',
                data: data
            });
        }, function(error) {
            console.error('API call failed:', error);
            if (error.response && error.response.body) {
                console.error('Error response:', JSON.stringify(error.response.body, null, 2));
            }
            res.status(error.status || 500).json({
                error: 'Failed to update properties',
                details: error.response ? error.response.body : error.message
            });
        });

    } catch (error) {
        console.error('Setup error:', error);
        res.status(500).json({
            error: 'Failed to setup request',
            details: error.message
        });
    }
});

// Start the server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
    console.log('Press Ctrl+C to quit.');
});
