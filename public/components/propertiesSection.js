// Helper function to convert Celsius to Fahrenheit
function celsiusToFahrenheit(celsius) {
    if (celsius === null || celsius === undefined) return null;
    return (celsius * 9/5) + 32;
}

// Properties Section Component
function formatPropertyValue(property) {
    if (property.last_value === undefined || property.last_value === null) {
        return 'N/A';
    }

    switch(property.type) {
        case 'BOOL':
            return property.last_value ? 'True' : 'False';
        case 'FLOAT':
            if (property.name === 'sensorplacement') {
                const percentage = property.last_value * 100;
                return `${percentage}%`;
            }
            if (property.name.toLowerCase().includes('temp')) {
                const fahrenheit = celsiusToFahrenheit(property.last_value);
                return `${fahrenheit.toFixed(1)}°F`;
            }
            if (property.name.toLowerCase().includes('flow')) {
                return `${Number(property.last_value).toFixed(2)} L/min`;
            }
            return Number(property.last_value).toFixed(2);
        case 'INT':
            return property.last_value.toString();
        case 'STRING':
            return property.last_value;
        default:
            return property.last_value;
    }
}

function getPropertyInputType(property) {
    switch(property.type) {
        case 'BOOL':
            return 'checkbox';
        case 'INT':
        case 'FLOAT':
            return 'number';
        default:
            return 'text';
    }
}

function getPropertyStep(property) {
    switch(property.type) {
        case 'FLOAT':
            return '0.01';
        case 'INT':
            return '1';
        default:
            return 'any';
    }
}

function getPropertyBgColor(propertyName) {
    const colorMap = {
        'temp': 'bg-blue-50',
        'temperature': 'bg-blue-50',
        'humidity': 'bg-green-50',
        'flow': 'bg-purple-50',
        'pressure': 'bg-yellow-50',
        'level': 'bg-indigo-50',
        'status': 'bg-gray-50',
        'Last_Maintenance': 'bg-amber-50',
        'location': 'bg-teal-50',
        'sensorplacement': 'bg-indigo-50'
    };

    for (const [key, color] of Object.entries(colorMap)) {
        if (propertyName.toLowerCase().includes(key) || propertyName === key) {
            return color;
        }
    }
    return 'bg-gray-50';
}

function getPropertyTextColor(propertyName) {
    const colorMap = {
        'temp': 'text-blue-900',
        'temperature': 'text-blue-900',
        'humidity': 'text-green-900',
        'flow': 'text-purple-900',
        'pressure': 'text-yellow-900',
        'level': 'text-indigo-900',
        'status': 'text-gray-900',
        'Last_Maintenance': 'text-amber-900',
        'location': 'text-teal-900',
        'sensorplacement': 'text-indigo-900'
    };

    for (const [key, color] of Object.entries(colorMap)) {
        if (propertyName.toLowerCase().includes(key) || propertyName === key) {
            return color;
        }
    }
    return 'text-gray-900';
}

function getSensorPlacementSelector(deviceId, property) {
    const currentValue = property.last_value ? property.last_value * 100 : null;
    return `
        <div class="flex flex-col space-y-2">
            <div class="flex space-x-2">
                <select 
                    class="w-full px-2 py-1 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                    data-device-id="${deviceId}"
                    data-property='${JSON.stringify(property).replace(/'/g, "&apos;")}'
                    id="sensorPlacement_${deviceId}"
                >
                    <option value="" ${!currentValue ? 'selected' : ''}>Select sensor placement</option>
                    <option value="0.10" ${currentValue === 10 ? 'selected' : ''}>10% from bottom</option>
                    <option value="0.25" ${currentValue === 25 ? 'selected' : ''}>25% from bottom</option>
                    <option value="0.50" ${currentValue === 50 ? 'selected' : ''}>50% from bottom</option>
                    <option value="0.75" ${currentValue === 75 ? 'selected' : ''}>75% from bottom</option>
                </select>
                <button 
                    onclick="handleUpdateButtonClick(event)"
                    data-device-id="${deviceId}"
                    data-property='${JSON.stringify(property).replace(/'/g, "&apos;")}'
                    class="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 transition-colors"
                    type="button"
                >
                    Update
                </button>
            </div>
        </div>
    `;
}

function sortProperties(properties) {
    const propertyOrder = [
        'devicename',
        'Icemachine_PN_SN',
        'location',
        'cloudtemp',
        'cloudflowrate',
        'sensorplacement',
        'tempThresholdMax',
        'noFlowCriticalTime',
        'notificationEmail',
        'Last_Maintenance'
    ];

    return properties.sort((a, b) => {
        const indexA = propertyOrder.indexOf(a.name);
        const indexB = propertyOrder.indexOf(b.name);
        
        // If both properties are in the order list, sort by their order
        if (indexA !== -1 && indexB !== -1) {
            return indexA - indexB;
        }
        
        // If only one property is in the order list, prioritize it
        if (indexA !== -1) return -1;
        if (indexB !== -1) return 1;
        
        // For properties not in the order list, sort alphabetically
        return a.name.localeCompare(b.name);
    });
}

function renderPropertiesSection(device) {
    if (!device.thing) {
        return '<p class="text-gray-500">No thing data available</p>';
    }

    return `
        <div class="bg-white rounded-lg shadow-lg border border-gray-100 p-4">
            <div class="flex items-center space-x-2 mb-6">
                <svg class="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/>
                </svg>
                <h3 class="text-xl font-semibold text-gray-900">Properties</h3>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                ${sortProperties(device.thing.properties).filter(property => 
                    !['warning', 'critical'].includes(property.name)
                ).map(property => `
                    <div class="property-card ${getPropertyBgColor(property.name)} rounded-xl shadow-sm border border-gray-100 overflow-hidden transition-all duration-200 hover:shadow-md">
                        <div class="px-5 py-4">
                            <div class="flex justify-between items-start mb-3">
                                <div class="space-y-1">
                                    <div class="flex items-center space-x-2">
                                        <h4 class="${getPropertyTextColor(property.name)} font-semibold">${
                                            property.name === 'devicename' ? 'Device Name' :
                                            property.name === 'Icemachine_PN_SN' ? 'Ice Machine Part Number and Serial Number' :
                                            property.name === 'cloudtemp' ? 'Temperature' :
                                            property.name === 'cloudflowrate' ? 'Flow Rate' :
                                            property.name === 'Last_Maintenance' ? 'Last Maintenance' :
                                            property.name === 'location' ? 'Ice Machine Location' :
                                            property.name === 'sensorplacement' ? 'Sensor Placement' :
                                            property.name === 'tempThresholdMax' ? 'Temperature Threshold' :
                                            property.name === 'noFlowCriticalTime' ? 'No Flow Critical Time' :
                                            property.name === 'notificationEmail' ? 'Notification Email Address' :
                                            property.name
                                        }</h4>
                                        <span class="px-2 py-0.5 text-xs font-medium rounded-full ${property.permission === 'READ_WRITE' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'}">
                                            ${property.permission === 'READ_WRITE' ? 'Editable' : 'Read Only'}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            ${property.name === 'devicename' ? `
                                <div class="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-100">
                                    <div class="flex items-start space-x-2">
                                        <svg class="w-4 h-4 text-blue-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                                        </svg>
                                        <div>
                                            <p class="text-sm font-medium text-blue-800 mb-1">What is Device Name?</p>
                                            <p class="text-xs text-blue-600 leading-relaxed">This is the unique identifier for your FreezeSense device. A descriptive name helps you easily identify and manage multiple devices in your system.</p>
                                        </div>
                                    </div>
                                </div>
                            ` : property.name === 'cloudtemp' ? `
                                <div class="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-100">
                                    <div class="flex items-start space-x-2">
                                        <svg class="w-4 h-4 text-blue-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                                        </svg>
                                        <div>
                                            <p class="text-sm font-medium text-blue-800 mb-1">What is Temperature?</p>
                                            <p class="text-xs text-blue-600 leading-relaxed">This is the real-time temperature reading from the sensor placed in your ice machine and helps determine the ice level in your machine.</p>
                                        </div>
                                    </div>
                                </div>
                            ` : property.name === 'cloudflowrate' ? `
                                <div class="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-100">
                                    <div class="flex items-start space-x-2">
                                        <svg class="w-4 h-4 text-blue-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                                        </svg>
                                        <div>
                                            <p class="text-sm font-medium text-blue-800 mb-1">What is Flow Rate?</p>
                                            <p class="text-xs text-blue-600 leading-relaxed">This measures the real-time water flow rate in your ice machine. It helps monitor water usage and detect potential issues with water supply or ice production.</p>
                                        </div>
                                    </div>
                                </div>
                            ` : property.name === 'Icemachine_PN_SN' ? `
                                <div class="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-100">
                                    <div class="flex items-start space-x-2">
                                        <svg class="w-4 h-4 text-blue-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                                        </svg>
                                        <div>
                                            <p class="text-sm font-medium text-blue-800 mb-1">What is Ice Machine PN/SN?</p>
                                            <p class="text-xs text-blue-600 leading-relaxed">This field helps track which ice machine this FreezeSense device is currently installed in. Enter the part number (PN) or serial number (SN) of the ice machine for easy identification and maintenance tracking.</p>
                                        </div>
                                    </div>
                                </div>
                            ` : property.name === 'Last_Maintenance' ? `
                                <div class="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-100">
                                    <div class="flex items-start space-x-2">
                                        <svg class="w-4 h-4 text-blue-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                                        </svg>
                                        <div>
                                            <p class="text-sm font-medium text-blue-800 mb-1">What is Last Maintenance?</p>
                                            <p class="text-xs text-blue-600 leading-relaxed">This tracks when your ice machine was last serviced. Regular maintenance every 6 months is recommended to ensure optimal performance, prevent issues, and extend the life of your machine.</p>
                                        </div>
                                    </div>
                                </div>
                            ` : property.name === 'location' ? `
                                <div class="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-100">
                                    <div class="flex items-start space-x-2">
                                        <svg class="w-4 h-4 text-blue-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                                        </svg>
                                        <div>
                                            <p class="text-sm font-medium text-blue-800 mb-1">What is Ice Machine Location?</p>
                                            <p class="text-xs text-blue-600 leading-relaxed">This field helps identify where the ice machine is physically located. Enter a descriptive location (e.g., "Kitchen - North Wall", "Bar Area", "Cafeteria Room 101") to easily locate and service the machine.</p>
                                        </div>
                                    </div>
                                </div>
                            ` : property.name === 'notificationEmail' ? `
                                <div class="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-100">
                                    <div class="flex items-start space-x-2">
                                        <svg class="w-4 h-4 text-blue-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                                        </svg>
                                        <div>
                                            <p class="text-sm font-medium text-blue-800 mb-1">What is Notification Email Address?</p>
                                            <p class="text-xs text-blue-600 leading-relaxed">This email address will receive critical alerts about your ice machine's status. Make sure to enter a valid email address that is regularly monitored to ensure timely response to any issues.</p>
                                        </div>
                                    </div>
                                </div>
                            ` : property.name === 'sensorplacement' ? `
                                <div class="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-100">
                                    <div class="flex items-start space-x-2">
                                        <svg class="w-4 h-4 text-blue-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                                        </svg>
                                        <div>
                                            <p class="text-sm font-medium text-blue-800 mb-1">What is Sensor Placement?</p>
                                            <p class="text-xs text-blue-600 leading-relaxed">This setting determines where the temperature sensor is placed in your ice machine, measured as a percentage from the bottom. This helps accurately track ice levels and ensures proper monitoring of your machine's performance.</p>
                                        </div>
                                    </div>
                                </div>
                            ` : property.name === 'tempThresholdMax' ? `
                                <div class="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-100">
                                    <div class="flex items-start space-x-2">
                                        <svg class="w-4 h-4 text-blue-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                                        </svg>
                                        <div>
                                            <p class="text-sm font-medium text-blue-800 mb-1">What is Temperature Threshold Max?</p>
                                            <p class="text-xs text-blue-600 leading-relaxed">This setting determines the maximum temperature threshold for your ice machine. When the temperature rises above this threshold, it indicates that ice levels have dropped below the sensor level. Adjust this value to fine-tune ice level detection and alert sensitivity.</p>
                                        </div>
                                    </div>
                                </div>
                            ` : property.name === 'noFlowCriticalTime' ? `
                                <div class="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-100">
                                    <div class="flex items-start space-x-2">
                                        <svg class="w-4 h-4 text-blue-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                                        </svg>
                                        <div>
                                            <p class="text-sm font-medium text-blue-800 mb-1">What is No Flow Critical Time?</p>
                                            <p class="text-xs text-blue-600 leading-relaxed">This setting determines how long (in hours) the system should wait without detecting water flow before triggering a critical alert. Adjust this value based on your ice machine's typical production cycles and usage patterns to avoid false alarms.</p>
                                        </div>
                                    </div>
                                </div>
                            ` : ''}

                            ${property.permission === 'READ_WRITE' ? `
                                <div class="mt-4">
                                ${property.name === 'sensorplacement' ? 
                                    getSensorPlacementSelector(device.id, property)
                                : property.name === 'Last_Maintenance' ? `
                                        <div class="flex space-x-3">
                                        <input 
                                            type="text"
                                            class="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 bg-white"
                                            value="${property.last_value || ''}"
                                            placeholder="MM/DD/YYYY"
                                            pattern="^(0[1-9]|1[0-2])/(0[1-9]|[12][0-9]|3[01])/[0-9]{4}$"
                                            title="Please enter date in MM/DD/YYYY format"
                                            data-device-id="${device.id}"
                                            data-property='${JSON.stringify(property).replace(/'/g, "&apos;")}'
                                            onkeydown="handlePropertyInputKeydown(event)"
                                        />
                                        <button 
                                            onclick="handleUpdateButtonClick(event)"
                                            data-device-id="${device.id}"
                                            data-property='${JSON.stringify(property).replace(/'/g, "&apos;")}'
                                            class="px-4 py-2 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-1 transition-colors"
                                            type="button"
                                        >
                                            Update
                                        </button>
                                    </div>
                                ` : `
                                        <div class="flex space-x-3">
                                        <input 
                                            type="${getPropertyInputType(property)}"
                                            class="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                                            value="${property.name.toLowerCase().includes('temp') ? celsiusToFahrenheit(property.last_value).toFixed(1) : property.last_value || ''}"
                                            placeholder="Enter new value"
                                            data-device-id="${device.id}"
                                            data-property='${JSON.stringify(property).replace(/'/g, "&apos;")}'
                                            step="${getPropertyStep(property)}"
                                            ${property.type === 'INT' || property.type === 'FLOAT' ? `min="0"` : ''}
                                        />
                                        <button 
                                            onclick="handleUpdateButtonClick(event)"
                                            data-device-id="${device.id}"
                                            data-property='${JSON.stringify(property).replace(/'/g, "&apos;")}'
                                            class="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 transition-colors"
                                            type="button"
                                        >
                                            Update
                                        </button>
                                    </div>
                                `}
                                </div>
                            ` : `
                                <div class="mt-3">
                                    <p class="text-2xl font-semibold ${getPropertyTextColor(property.name)}">
                                        ${property.name.toLowerCase().includes('temp') ? 
                                            `${celsiusToFahrenheit(property.last_value)?.toFixed(1)}°F` : 
                                            property.name === 'cloudflowrate' ?
                                            `${Number(property.last_value).toFixed(2)} L/min` :
                                            formatPropertyValue(property)}
                                    </p>
                                </div>
                                
                                <div class="mt-4 pt-3 border-t border-gray-100">
                                    <div class="flex items-center space-x-1 text-xs text-gray-500">
                                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                                        </svg>
                                        <span>Last Updated: ${new Date(device.last_activity_at).toLocaleString('en-US', {
                                            dateStyle: 'medium',
                                            timeStyle: 'short'
                                        })}</span>
                                    </div>
                                </div>
                            `}
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

// Export the functions
window.formatPropertyValue = formatPropertyValue;
window.getPropertyInputType = getPropertyInputType;
window.getPropertyStep = getPropertyStep;
window.getPropertyBgColor = getPropertyBgColor;
window.getPropertyTextColor = getPropertyTextColor;
window.getSensorPlacementSelector = getSensorPlacementSelector;
window.renderPropertiesSection = renderPropertiesSection;
window.celsiusToFahrenheit = celsiusToFahrenheit;
window.sortProperties = sortProperties; 