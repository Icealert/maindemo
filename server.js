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
  
      console.log(`Will publish new value for thingId=${thingId}, propertyId=${propertyId}`);
      console.log('newValue =', newValue);
  
      // 6) Publish the new value to update last_value
      const publishPayload = { value: newValue };
      console.log('Publishing payload:', JSON.stringify(publishPayload, null, 2));
  
      const data = await propertiesApi.propertiesV2Publish(thingId, propertyId, publishPayload, opts);
  
      // 7) Respond to the client
      console.log('Publish successful. Response:', JSON.stringify(data, null, 2));
  
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
  
  // 1) Add this route to your server.js
app.get('/api/proxy/timeseries/:thingId/:propertyId', async (req, res) => {
  try {
    // 2) Get OAuth token
    const token = await getToken();
    
    // 3) Setup the Arduino IoT client with the token
    const ArduinoIotClient = require('@arduino/arduino-iot-client');
    const defaultClient = ArduinoIotClient.ApiClient.instance;
    const oauth2 = defaultClient.authentications['oauth2'];
    oauth2.accessToken = token;

    // 4) Create the PropertiesV2Api instance
    const propsApi = new ArduinoIotClient.PropertiesV2Api(defaultClient);

    // 5) Extract path params
    const { thingId, propertyId } = req.params;

    // 6) Extract optional query params (aggregation, desc, from, to, interval)
    const {
      aggregation,   // e.g. 'AVG' or 'MIN' or 'MAX'
      desc,          // 'true' or 'false'
      from,          // ISO date string
      to,            // ISO date string
      interval       // integer in seconds
    } = req.query;

    // 7) Build the 'opts' object for propertiesV2Timeseries
    let opts = {};

    if (aggregation) opts.aggregation = aggregation;
    if (typeof desc !== 'undefined') {
      // Convert 'desc' from string to boolean
      opts.desc = (desc === 'true');
    }
    if (from)      opts.from = from;
    if (to)        opts.to = to;
    if (interval)  opts.interval = parseInt(interval);

    // OPTIONAL: If you want to pass X-Organization from header
    if (req.headers['x-organization']) {
      opts['X-Organization'] = req.headers['x-organization'];
    }

    // 8) Call the PropertiesV2Timeseries endpoint
    const timeseriesData = await propsApi.propertiesV2Timeseries(
      thingId,     // ID of the thing
      propertyId,  // ID of the numeric property
      opts
    );

    // 9) Return the raw data from Arduino Cloud to client
    res.json(timeseriesData);

  } catch (error) {
    console.error('Time-series error:', error);
    // Forward the error details
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
