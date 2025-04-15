// Device status management
let deviceStatusList = document.getElementById('deviceStatusList');
let deviceListContent = document.getElementById('deviceListContent');
let connectedDevicesCount = document.getElementById('connectedDevicesCount');
let disconnectedBadgeCount = document.getElementById('disconnectedBadgeCount');

function toggleDeviceStatusList() {
    deviceStatusList.classList.toggle('hidden');
    if (!deviceStatusList.classList.contains('hidden')) {
        updateDeviceList();
    }
}

function updateDeviceList() {
    // Get devices from the window.lastDevicesData (set by your existing fetchDevices function)
    const devices = window.lastDevicesData || [];
    
    // Map devices to include their calculated status
    const deviceStatusData = devices.map(device => {
        const status = calculateDeviceStatus(device);
        const deviceName = device.thing?.properties?.find(p => p.name === 'devicename')?.last_value || device.name;
        const location = device.thing?.properties?.find(p => p.name === 'location')?.last_value || 'Location not set';
        
        return {
            id: device.id,
            name: deviceName,
            location: location,
            isConnected: status.isConnected,
            lastSeen: status.lastConnectedTime ? new Date(status.lastConnectedTime).toLocaleString() : 'N/A',
            temperature: status.cloudTemp !== undefined ? `${celsiusToFahrenheit(status.cloudTemp).toFixed(1)}°F` : 'N/A',
            status: status.isGreat ? 'great' : status.isWarning ? 'warning' : 'critical'
        };
    });

    // Sort devices: disconnected first, then by name
    const sortedDevices = [...deviceStatusData].sort((a, b) => {
        if (!a.isConnected && b.isConnected) return -1;
        if (a.isConnected && !b.isConnected) return 1;
        return a.name.localeCompare(b.name);
    });

    // Clear existing content
    deviceListContent.innerHTML = '';

    // Add devices to the list
    sortedDevices.forEach(device => {
        const deviceElement = createDeviceElement(device);
        deviceListContent.appendChild(deviceElement);
    });

    // Update counts
    const connectedCount = deviceStatusData.filter(d => d.isConnected).length;
    const disconnectedCount = deviceStatusData.filter(d => !d.isConnected).length;

    // Update the counts in the button
    connectedDevicesCount.textContent = `${connectedCount} / ${devices.length}`;
    
    if (disconnectedCount > 0) {
        disconnectedBadgeCount.textContent = disconnectedCount;
        disconnectedBadgeCount.classList.remove('hidden');
    } else {
        disconnectedBadgeCount.classList.add('hidden');
    }
}

function createDeviceElement(device) {
    const div = document.createElement('div');
    
    // Set background color based on connection and status
    let bgColor = 'bg-gray-50';
    let statusColor = 'text-gray-600';
    let statusText = 'Unknown';
    
    if (!device.isConnected) {
        bgColor = 'bg-red-50';
        statusColor = 'text-red-600';
        statusText = 'Disconnected';
    } else {
        switch (device.status) {
            case 'great':
                bgColor = 'bg-green-50';
                statusColor = 'text-green-600';
                statusText = 'Connected - Great';
                break;
            case 'warning':
                bgColor = 'bg-yellow-50';
                statusColor = 'text-yellow-600';
                statusText = 'Connected - Warning';
                break;
            case 'critical':
                bgColor = 'bg-red-50';
                statusColor = 'text-red-600';
                statusText = 'Connected - Critical';
                break;
        }
    }

    div.className = `flex items-center justify-between p-3 rounded-md ${bgColor} mb-2 hover:bg-opacity-75 transition-colors duration-200`;

    div.innerHTML = `
        <div class="flex items-center space-x-3">
            <div class="w-2 h-2 rounded-full ${statusColor} animate-pulse"></div>
            <div>
                <p class="font-medium text-gray-800">${device.name}</p>
                <p class="text-xs text-gray-500">${device.location}</p>
                <div class="flex items-center space-x-2 mt-1">
                    <span class="text-xs text-gray-500">
                        <svg class="w-3 h-3 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                        </svg>
                        ${device.lastSeen}
                    </span>
                    ${device.isConnected ? `
                        <span class="text-xs text-gray-500">
                            <svg class="w-3 h-3 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 13v-1m4 1v-3m4 3V8M12 21l-8-8 8-8 8 8-8 8z"/>
                            </svg>
                            ${device.temperature}
                        </span>
                    ` : ''}
                </div>
            </div>
        </div>
        <span class="text-xs font-medium ${statusColor} whitespace-nowrap">${statusText}</span>
    `;

    return div;
}

// Close the device list when clicking outside
document.addEventListener('click', (event) => {
    const button = document.getElementById('connectedDevicesButton');
    if (!button.contains(event.target) && !deviceStatusList.contains(event.target)) {
        deviceStatusList.classList.add('hidden');
    }
});

// Register to update when devices are fetched
document.addEventListener('devicesUpdated', updateDeviceList);

// Initial update if data is already available
if (window.lastDevicesData) {
    updateDeviceList();
} 