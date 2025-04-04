/**
 * FreezeSense UI Functions
 * Contains functions for UI management, display and DOM manipulation
 */

// UI Element references
let statusEl, errorEl, errorMessageEl, devicesContainer, consoleOutput, debugConsole;

// Initialize UI elements
function initializeUIElements() {
    try {
        statusEl = document.getElementById('status');
        errorEl = document.getElementById('error');
        errorMessageEl = document.getElementById('error-message');
        devicesContainer = document.getElementById('devices');
        consoleOutput = document.getElementById('console-output');
        debugConsole = document.getElementById('debug-console');
        
        // Log initialization status
        console.log('UI Elements initialized:', {
            status: !!statusEl,
            error: !!errorEl,
            errorMessage: !!errorMessageEl,
            devices: !!devicesContainer,
            console: !!consoleOutput,
            debug: !!debugConsole
        });
    } catch (error) {
        console.error('Error initializing UI elements:', error);
    }
}

// Create UI object first
window.UI = {};

// Property update function
async function updatePropertyValue(deviceId, property) {
    try {
        if (!deviceId || !property) {
            throw new Error('Device ID and Property are required');
        }

        // Log the update attempt with all details
        UI.logToConsole({
            message: 'Attempting to update property',
            deviceId: deviceId,
            propertyName: property.name,
            currentValue: property.last_value,
            newValue: property.new_value,
            propertyType: property.type
        }, 'info');

        // Format the value based on type
        let formattedValue;
        switch(property.type) {
            case 'INT':
                formattedValue = parseInt(property.new_value);
                if (isNaN(formattedValue)) {
                    throw new Error('Invalid integer value');
                }
                break;
            case 'FLOAT':
                // Convert Fahrenheit to Celsius if this is a temperature property
                if (property.name.toLowerCase().includes('temp')) {
                    formattedValue = Utils.fahrenheitToCelsius(parseFloat(property.new_value));
                } else {
                    formattedValue = parseFloat(property.new_value);
                }
                if (isNaN(formattedValue)) {
                    throw new Error('Invalid float value');
                }
                break;
            case 'BOOL':
                // Convert to actual boolean instead of string
                formattedValue = property.new_value === true || property.new_value === 'true';
                break;
            case 'CHARSTRING':
            case 'STATUS':
                formattedValue = String(property.new_value).trim();
                if (!formattedValue) {
                    throw new Error('Value cannot be empty');
                }
                break;
            default:
                formattedValue = property.new_value;
        }

        // Using V2 API endpoint format and structure
        const apiUrl = `${API_URL}/api/iot/v2/devices/${deviceId}/properties`;

        // Construct payload exactly as per Arduino V2 API docs
        const requestBody = {
            propertiesValues: {
                input: true,
                properties: [{
                    name: property.name,
                    type: property.type,
                    value: formattedValue // Send raw value without converting to string
                }]
            }
        };

        UI.logToConsole({
            message: 'Sending update request',
            url: apiUrl,
            body: requestBody
        }, 'info');

        const response = await fetch(apiUrl, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'X-Organization': property.organization_id || ''  // Add organization ID if available
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => null);
            throw new Error(errorData?.error || `HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        UI.logToConsole({
            message: 'Update successful',
            deviceId: deviceId,
            propertyName: property.name,
            response: result
        }, 'info');

        // Show success message
        UI.showToast('Property updated successfully', 'success');
        
    } catch (error) {
        UI.logToConsole({
            message: 'Error updating property',
            error: error.message,
            deviceId: deviceId,
            propertyName: property?.name
        }, 'error');
        UI.showError(`Failed to update property: ${error.message}`);
        throw error;
    }
}

// Debug Console Functions
function toggleConsole() {
    if (!debugConsole) return;
    debugConsole.classList.toggle('hidden');
}

function clearConsole() {
    if (!consoleOutput) return;
    consoleOutput.innerHTML = '';
}

function logToConsole(data, type = 'info') {
    if (!consoleOutput) {
        console.log('Console output element not found');
        return;
    }

    const timestamp = new Date().toLocaleTimeString();
    const colorClass = type === 'error' ? 'text-red-400' : 
                     type === 'warning' ? 'text-yellow-400' : 
                     'text-green-400';
    
    const logEntry = document.createElement('div');
    logEntry.className = colorClass;
    logEntry.innerHTML = `[${timestamp}] ${typeof data === 'object' ? JSON.stringify(data, null, 2) : data}`;
    
    consoleOutput.appendChild(logEntry);
    consoleOutput.scrollTop = consoleOutput.scrollHeight;
}

// Loading state
function showLoading() {
    if (!statusEl || !errorEl || !devicesContainer) return;
    statusEl.classList.remove('hidden');
    errorEl.classList.add('hidden');
    devicesContainer.innerHTML = '';
}

function hideLoading() {
    if (!statusEl) return;
    statusEl.classList.add('hidden');
}

function showError(message) {
    if (!statusEl || !errorEl || !errorMessageEl) return;
    statusEl.classList.add('hidden');
    errorEl.classList.remove('hidden');
    errorMessageEl.textContent = message;
    logToConsole(message, 'error');
}

function updateLastUpdateTime() {
    const now = new Date();
    document.getElementById('lastUpdateTime').textContent = now.toLocaleTimeString();
}

// Toast notifications
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `fixed bottom-4 right-4 px-6 py-3 rounded-lg text-white ${
        type === 'error' ? 'bg-red-500' : 'bg-green-500'
    }`;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => toast.remove(), 3000);
}

// UI Helper functions
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
        'temp': 'text-blue-800',
        'temperature': 'text-blue-800',
        'humidity': 'text-green-800',
        'flow': 'text-purple-800',
        'pressure': 'text-yellow-800',
        'level': 'text-indigo-800',
        'status': 'text-gray-800',
        'Last_Maintenance': 'text-amber-800',
        'location': 'text-teal-800',
        'sensorplacement': 'text-indigo-800'
    };

    for (const [key, color] of Object.entries(colorMap)) {
        if (propertyName.toLowerCase().includes(key) || propertyName === key) {
            return color;
        }
    }
    return 'text-gray-800';
}

function formatTemperature(celsius, maxThreshold = null) {
    if (celsius === undefined || celsius === null) return 'N/A';
    const fahrenheit = Utils.celsiusToFahrenheit(celsius);
    const value = `${fahrenheit.toFixed(1)}°F`;
    
    if (maxThreshold !== null && celsius >= maxThreshold) {
        return `<span class="temp-warning">${value}</span>`;
    }
    return value;
}

function getTemperatureCardClass(temp, maxThreshold) {
    if (temp === undefined || temp === null || maxThreshold === undefined || maxThreshold === null) {
        return 'bg-gradient-to-br from-blue-50 to-blue-100';
    }
    return temp >= maxThreshold ? 'temp-warning-box' : 'bg-gradient-to-br from-blue-50 to-blue-100';
}

function formatTimeDuration(milliseconds) {
    if (!milliseconds) return 'N/A';
    
    const seconds = Math.floor(milliseconds / 1000);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;
    
    return `${hours}h ${minutes}m ${remainingSeconds}s`;
}

function formatDuration(milliseconds) {
    if (!milliseconds) return '0s';
    
    const seconds = Math.floor(milliseconds / 1000);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;
    
    let parts = [];
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (remainingSeconds > 0 || parts.length === 0) parts.push(`${remainingSeconds}s`);
    
    return parts.join(' ');
}

// Store timers for cleanup
let timeSinceFlowTimers = [];

function clearTimeSinceFlowTimers() {
    timeSinceFlowTimers.forEach(timer => clearInterval(timer));
    timeSinceFlowTimers = [];
}

function getFlowCardClass(timeSinceFlowHours, criticalTime) {
    if (timeSinceFlowHours === null || criticalTime === undefined || criticalTime === null) {
        return 'bg-gradient-to-br from-green-50 to-green-100';
    }
    console.log('Time comparison:', { timeSinceFlowHours, criticalTime, isWarning: timeSinceFlowHours >= criticalTime });
    return parseFloat(timeSinceFlowHours) >= parseFloat(criticalTime) ? 'flow-warning-box' : 'bg-gradient-to-br from-green-50 to-green-100';
}

function updateTimeSinceFlow(element, startTime) {
    if (!startTime) {
        element.textContent = 'N/A';
        return null;
    }

    const criticalTime = parseFloat(element.dataset.criticalTime);
    const cardElement = element.closest('.property-card');
    const deviceId = element.dataset.deviceId;

    // Log initial state only once when timer starts
    UI.logToConsole(`Initializing flow timer for device ${deviceId}:`, {
        startTime,
        criticalTime,
        currentTime: new Date().toISOString()
    });

    let lastCriticalState = false; // Track previous critical state

    const update = () => {
        const timeSinceFlowMs = new Date() - new Date(startTime);
        const timeSinceFlowHours = timeSinceFlowMs / (1000 * 60 * 60);
        element.textContent = formatTimeDuration(timeSinceFlowMs);
        
        // Update warning state
        cardElement.className = `property-card ${getFlowCardClass(timeSinceFlowHours, criticalTime)} p-2 rounded-lg`;
        
        // Only log when critical state changes
        const isCriticalNow = timeSinceFlowHours >= criticalTime;
        if (isCriticalNow !== lastCriticalState) {
            lastCriticalState = isCriticalNow;
            if (isCriticalNow) {
                UI.logToConsole(`Flow state changed to critical for device ${deviceId}:`, {
                    timeSinceFlowHours,
                    criticalTime,
                    lastUpdate: startTime
                });
            }
        }
    };

    update(); // Initial update
    const timer = setInterval(update, 1000); // Update every second
    timeSinceFlowTimers.push(timer);
    return timer;
}

// Form input handling
function handlePropertyInputKeydown(event) {
    if (event.key === 'Enter') {
        event.preventDefault();
        const input = event.target;
        const button = input.nextElementSibling;
        if (button) {
            button.click(); // Use native click instead of dispatching event
        }
    }
}

function handlePropertyInputChange(event) {
    const input = event.target;
    const deviceId = input.dataset.deviceId;
    
    try {
        const property = JSON.parse(input.dataset.property);
        property.new_value = input.type === 'checkbox' ? input.checked : input.value;
        
        if (!deviceId) {
            throw new Error('Device ID is missing');
        }
        
        UI.updatePropertyValue(deviceId, property);
    } catch (error) {
        logToConsole(`Error handling property input: ${error.message}`, 'error');
        showError(`Failed to handle property input: ${error.message}`);
    }
}

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
                const fahrenheit = Utils.celsiusToFahrenheit(property.last_value);
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

function getIceLevelText(status) {
    if (status.sensorPlacement === undefined || status.sensorPlacement === null) {
        return 'Sensor placement not set';
    }
    
    const placement = (status.sensorPlacement * 100).toFixed(0);
    if (status.cloudTemp === undefined || status.tempThresholdMax === undefined) {
        return 'Temperature data unavailable';
    }

    // Compare with threshold temperature
    return status.cloudTemp <= status.tempThresholdMax ? 
        `More than ${placement}% full` : 
        `Less than ${placement}% full`;
}

// Add refresh button to the UI
function addRefreshButton() {
    const refreshButton = document.createElement('button');
    refreshButton.innerHTML = `
        <div class="fixed bottom-4 left-4 bg-blue-600 text-white rounded-full p-3 shadow-lg hover:bg-blue-700 transition-colors">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
        </div>
    `;
    refreshButton.className = 'refresh-button';
    refreshButton.onclick = function() {
        // Show loading indicator/animation on the button itself
        const svgElement = refreshButton.querySelector('svg');
        const originalSVG = svgElement.outerHTML;
        svgElement.classList.add('animate-spin');
        
        // Call the fetchDevices function
        fetchDevices().finally(() => {
            // Restore button after fetch completes (success or error)
            setTimeout(() => {
                svgElement.classList.remove('animate-spin');
            }, 500);
        });
    };
    document.body.appendChild(refreshButton);
}

function createDeviceCard(device) {
    const card = document.createElement('div');
    card.className = 'bg-white rounded-lg shadow-md p-4 hover:shadow-lg transition-shadow';
    card.id = `device-${device.id}`;

    // Get device status
    const criticalProp = device.thing?.properties?.find(p => p.name === 'critical')?.last_value;
    const warningProp = device.thing?.properties?.find(p => p.name === 'warning')?.last_value;
    
    // Add status indicator class
    if (criticalProp) {
        card.classList.add('border-l-4', 'border-red-500');
    } else if (warningProp) {
        card.classList.add('border-l-4', 'border-yellow-500');
    } else {
        card.classList.add('border-l-4', 'border-green-500');
    }

    // Sort properties to show important ones first
    const sortedProperties = Utils.sortProperties(device.thing?.properties || []);

    // Create card content
    card.innerHTML = `
        <div class="flex justify-between items-start mb-4">
            <div>
                <h3 class="text-lg font-semibold text-gray-900">${device.name || 'Unnamed Device'}</h3>
                <p class="text-sm text-gray-500">${device.id}</p>
            </div>
            <span class="px-2 py-1 text-sm rounded-full ${
                device.connection_status === 'CONNECTED' 
                    ? 'bg-green-100 text-green-800' 
                    : 'bg-red-100 text-red-800'
            }">
                ${device.connection_status || 'UNKNOWN'}
            </span>
        </div>
        <div class="space-y-4">
            ${sortedProperties.map(property => `
                <div class="property-card ${UI.getPropertyBgColor(property.name)} p-2 rounded-lg">
                    <div class="flex justify-between items-center">
                        <label class="text-sm font-medium ${UI.getPropertyTextColor(property.name)}">
                            ${property.name}
                        </label>
                        <div class="flex items-center space-x-2">
                            ${property.permission === 'READ_WRITE' ? `
                                <input
                                    type="${UI.getPropertyInputType(property)}"
                                    class="form-input text-sm border-gray-300 rounded"
                                    value="${property.last_value || ''}"
                                    data-device-id="${device.id}"
                                    data-property='${JSON.stringify(property)}'
                                    onkeydown="UI.handlePropertyInputKeydown(event)"
                                    onchange="UI.handlePropertyInputChange(event)"
                                />
                            ` : `
                                <span class="text-sm ${UI.getPropertyTextColor(property.name)}">
                                    ${UI.formatPropertyValue(property)}
                                </span>
                            `}
                        </div>
                    </div>
                </div>
            `).join('')}
        </div>
    `;

    return card;
}

// Update UI object with all functions
Object.assign(window.UI, {
    toggleConsole,
    clearConsole,
    logToConsole,
    showLoading,
    hideLoading,
    showError,
    updateLastUpdateTime,
    showToast,
    getPropertyBgColor,
    getPropertyTextColor,
    formatTemperature,
    getTemperatureCardClass,
    formatTimeDuration,
    formatDuration,
    clearTimeSinceFlowTimers,
    getFlowCardClass,
    updateTimeSinceFlow,
    handlePropertyInputKeydown,
    handlePropertyInputChange,
    formatPropertyValue,
    getPropertyInputType,
    getPropertyStep,
    getIceLevelText,
    addRefreshButton,
    updatePropertyValue,
    initializeUIElements,
    createDeviceCard
}); 