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

export function renderPropertiesSection(device) {
    if (!device || !device.properties) {
        return '<div class="text-center text-gray-500">No properties available</div>';
    }

    const properties = device.properties;
    const deviceId = device.id;

    // Group properties by category
    const groupedProperties = {
        status: [],
        settings: [],
        maintenance: [],
        info: []
    };

    properties.forEach(property => {
        const name = property.name.toLowerCase();
        if (name.includes('temp') || name.includes('flow')) {
            groupedProperties.status.push(property);
        } else if (name.includes('threshold') || name.includes('time') || name.includes('email')) {
            groupedProperties.settings.push(property);
        } else if (name.includes('maintenance')) {
            groupedProperties.maintenance.push(property);
        } else {
            groupedProperties.info.push(property);
        }
    });

    return `
        <div class="space-y-6">
            ${Object.entries(groupedProperties).map(([category, props]) => {
                if (props.length === 0) return '';
                
                const categoryTitles = {
                    status: 'Status Monitoring',
                    settings: 'Device Settings',
                    maintenance: 'Maintenance',
                    info: 'Device Information'
                };

                return `
                    <div class="space-y-4">
                        <h3 class="text-lg font-semibold text-gray-800">${categoryTitles[category]}</h3>
                        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            ${props.map(property => createPropertyCard(property, deviceId, isPropertyEditable(property))).join('')}
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

function isPropertyEditable(property) {
    const editableProperties = [
        'location',
        'sensorplacement',
        'tempThresholdMax',
        'noFlowCriticalTime',
        'notificationEmail',
        'Last_Maintenance'
    ];
    return editableProperties.includes(property.name);
}

function createPropertyCard(property, deviceId, isEditable = false) {
    const propertyName = property.name;
    const propertyValue = property.last_value;
    const propertyType = property.type;
    const bgColor = getPropertyBgColor(propertyName);
    const textColor = getPropertyTextColor(propertyName);
    const icon = getPropertyIcon(propertyName);
    const formattedValue = formatPropertyValue(property);
    const isCritical = checkIfCritical(property);

    return `
        <div class="property-card ${bgColor} rounded-xl shadow-sm border border-gray-100 p-4 relative overflow-hidden transition-all duration-200 hover:shadow-md ${isCritical ? 'border-red-500 border-2' : ''}" 
             role="region" 
             aria-label="${propertyName} property">
            <div class="flex justify-between items-start mb-3">
                <div class="flex items-center space-x-2">
                    <div class="p-2 rounded-lg bg-white/50">
                        ${icon}
                    </div>
                    <div>
                        <h3 class="text-sm font-semibold ${textColor}">${formatPropertyName(propertyName)}</h3>
                        <p class="text-xs text-gray-500">${getPropertyDescription(propertyName)}</p>
                    </div>
                </div>
                ${isEditable ? `
                    <span class="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
                        Editable
                    </span>
                ` : ''}
            </div>

            <div class="mt-2">
                <p class="text-2xl font-semibold ${textColor} ${isCritical ? 'text-red-600' : ''}">
                    ${formattedValue}
                </p>
            </div>

            ${isEditable ? `
                <div class="mt-4">
                    ${getPropertyInput(property, deviceId)}
                </div>
            ` : ''}

            <div class="mt-4 pt-3 border-t border-gray-100">
                <div class="flex items-center justify-between text-xs text-gray-500">
                    <div class="flex items-center space-x-1">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                        </svg>
                        <span>Last Updated: ${new Date(property.updated_at).toLocaleString()}</span>
                    </div>
                    ${isCritical ? `
                        <span class="flex items-center space-x-1 text-red-500">
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                            </svg>
                            <span>Critical</span>
                        </span>
                    ` : ''}
                </div>
            </div>
        </div>
    `;
}

function getPropertyIcon(propertyName) {
    const icons = {
        'temp': `<svg class="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 13V5a4 4 0 118 0v8a6 6 0 11-8 0z"/>
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 13a4 4 0 118 0 4 4 0 01-8 0z"/>
                </svg>`,
        'flow': `<svg class="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>`,
        'level': `<svg class="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/>
                </svg>`,
        'location': `<svg class="w-5 h-5 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
                </svg>`,
        'maintenance': `<svg class="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>`
    };

    for (const [key, icon] of Object.entries(icons)) {
        if (propertyName.toLowerCase().includes(key)) {
            return icon;
        }
    }
    return `<svg class="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>`;
}

function formatPropertyName(name) {
    const nameMap = {
        'Icemachine_PN_SN': 'Ice Machine Part Number and Serial Number',
        'cloudtemp': 'Temperature',
        'cloudflowrate': 'Flow Rate',
        'Last_Maintenance': 'Last Maintenance',
        'location': 'Ice Machine Location',
        'sensorplacement': 'Sensor Placement',
        'tempThresholdMax': 'Temperature Threshold',
        'noFlowCriticalTime': 'No Flow Critical Time',
        'notificationEmail': 'Notification Email Address'
    };
    return nameMap[name] || name;
}

function getPropertyDescription(name) {
    const descriptions = {
        'Icemachine_PN_SN': 'Unique identifier for your ice machine',
        'cloudtemp': 'Current temperature reading',
        'cloudflowrate': 'Water flow rate in liters per minute',
        'Last_Maintenance': 'Date of last maintenance service',
        'location': 'Physical location of the ice machine',
        'sensorplacement': 'Height of sensor from bottom of bin',
        'tempThresholdMax': 'Maximum allowed temperature',
        'noFlowCriticalTime': 'Time without flow before critical alert',
        'notificationEmail': 'Email for receiving alerts'
    };
    return descriptions[name] || 'Property value';
}

function checkIfCritical(property) {
    const { name, last_value, type } = property;
    
    if (name === 'cloudtemp') {
        const threshold = property.thing?.properties?.find(p => p.name === 'tempThresholdMax')?.last_value;
        return last_value > threshold;
    }
    
    if (name === 'cloudflowrate') {
        const criticalTime = property.thing?.properties?.find(p => p.name === 'noFlowCriticalTime')?.last_value;
        const lastUpdate = property.updated_at;
        const timeSinceFlow = (new Date() - new Date(lastUpdate)) / (1000 * 60 * 60);
        return timeSinceFlow >= criticalTime;
    }
    
    return false;
}

// Export functions to make them available globally and as ES modules
const exports = {
    renderPropertiesSection,
    createPropertyCard,
    isPropertyEditable,
    getPropertyIcon,
    formatPropertyName,
    getPropertyDescription,
    checkIfCritical,
    formatPropertyValue,
    getPropertyInputType,
    getPropertyStep,
    getPropertyBgColor,
    getPropertyTextColor,
    getSensorPlacementSelector,
    celsiusToFahrenheit,
    sortProperties
};

// Make functions available globally
Object.entries(exports).forEach(([key, value]) => {
    window[key] = value;
});

// ES Module exports
export default exports;
export {
    renderPropertiesSection,
    createPropertyCard,
    isPropertyEditable,
    getPropertyIcon,
    formatPropertyName,
    getPropertyDescription,
    checkIfCritical,
    formatPropertyValue,
    getPropertyInputType,
    getPropertyStep,
    getPropertyBgColor,
    getPropertyTextColor,
    getSensorPlacementSelector,
    celsiusToFahrenheit,
    sortProperties
}; 