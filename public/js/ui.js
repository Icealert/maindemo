/**
 * FreezeSense UI Functions
 * Contains functions for UI management, display and DOM manipulation
 */

// UI Element references
const statusEl = document.getElementById('status');
const errorEl = document.getElementById('error');
const errorMessageEl = document.getElementById('error-message');
const devicesContainer = document.getElementById('devices');
const consoleOutput = document.getElementById('console-output');
const debugConsole = document.getElementById('debug-console');

// Debug Console Functions
function toggleConsole() {
    debugConsole.classList.toggle('hidden');
}

function clearConsole() {
    consoleOutput.innerHTML = '';
}

function logToConsole(data, type = 'info') {
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
    statusEl.classList.remove('hidden');
    errorEl.classList.add('hidden');
    devicesContainer.innerHTML = '';
}

function hideLoading() {
    statusEl.classList.add('hidden');
}

function showError(message) {
    statusEl.classList.add('hidden');
    errorEl.classList.remove('hidden');
    errorMessageEl.textContent = message;
    UI.logToConsole(message, 'error');
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
        
        updatePropertyValue(deviceId, property);
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

// Export UI functions
window.UI = {
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
    addRefreshButton
}; 