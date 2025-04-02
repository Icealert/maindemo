var IotApi = require('@arduino/arduino-iot-client');
var rp = require('request-promise');

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
        console.log('Requesting access token...');
        const response = await rp(options);
        console.log('Access token received successfully');
        return response['access_token'];
    }
    catch (error) {
        console.error("Failed getting an access token:", error.message);
        throw error;
    }
}

async function run() {
    try {
        console.log('Initializing Arduino IoT Client...');
        var client = IotApi.ApiClient.instance;
        
        // Configure OAuth2 access token for authorization
        var oauth2 = client.authentications['oauth2'];
        oauth2.accessToken = await getToken();
        
        console.log('Setting up API clients...');
        var devicesApi = new IotApi.DevicesV2Api(client);
        var propertiesApi = new IotApi.PropertiesV2Api(client);
        
        // First get all devices
        console.log('\nFetching devices...');
        const devices = await devicesApi.devicesV2List();
        console.log(`Found ${devices.length} devices:`);
        console.log(JSON.stringify(devices, null, 2));

        // Then get properties for each device
        for (const device of devices) {
            console.log(`\nFetching properties for device: ${device.name} (ID: ${device.id})`);
            try {
                const properties = await propertiesApi.propertiesV2List(device.id);
                console.log('Properties:', JSON.stringify(properties, null, 2));
            } catch (error) {
                console.error(`Error getting properties for device ${device.id}:`, error.message);
                if (error.response) {
                    console.error('Response:', error.response.body);
                }
            }
        }
    } catch (error) {
        console.error('Error:', error.message);
        if (error.response) {
            console.error('Response:', error.response.body);
        }
    }
}

console.log('Starting Arduino IoT Client...');
run().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});