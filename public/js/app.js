// API URL configuration
const API_URL = window.location.origin;

// Device filtering functions
let currentDevices = [];

function showActiveDevices() {
    filterAndDisplayDevices(device => true);
}

function showConnectedDevices() {
    filterAndDisplayDevices(device => device.connection_status === 'CONNECTED');
}

function showGreatDevices() {
    filterAndDisplayDevices(device => {
        const criticalProp = device.thing?.properties?.find(p => p.name === 'critical');
        const warningProp = device.thing?.properties?.find(p => p.name === 'warning');
        return !criticalProp?.last_value && !warningProp?.last_value;
    });
}

function showWarningDevices() {
    filterAndDisplayDevices(device => {
        const warningProp = device.thing?.properties?.find(p => p.name === 'warning');
        return warningProp?.last_value === true;
    });
}

function showCriticalDevices() {
    filterAndDisplayDevices(device => {
        const criticalProp = device.thing?.properties?.find(p => p.name === 'critical');
        return criticalProp?.last_value === true;
    });
}

function filterAndDisplayDevices(filterFn) {
    const filteredDevices = currentDevices.filter(filterFn);
    displayDevices(filteredDevices);
}

// Modal functions
function showDisclaimer() {
    const modal = document.getElementById('disclaimer-modal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }
}

function hideDisclaimer() {
    const modal = document.getElementById('disclaimer-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}

function showContactModal() {
    const modal = document.getElementById('contact-modal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }
}

function hideContact() {
    const modal = document.getElementById('contact-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}

function showFAQ() {
    const modal = document.getElementById('faq-modal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }
}

function closeFAQ() {
    const modal = document.getElementById('faq-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}

function showSetupGuide() {
    const modal = document.getElementById('setup-modal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }
}

function hideSetupGuide() {
    const modal = document.getElementById('setup-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}

function showKnownBugs() {
    const modal = document.getElementById('known-bugs-modal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }
}

function hideKnownBugs() {
    const modal = document.getElementById('known-bugs-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}

// Device fetching and display
async function fetchDevices() {
    try {
        UI.showLoading();
        UI.logToConsole('Fetching devices...', 'info');

        const response = await fetch(`${API_URL}/api/devices`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const devices = await response.json();
        currentDevices = devices; // Store devices globally
        
        UI.logToConsole(`Fetched ${devices.length} devices`, 'info');
        displayDevices(devices);
        updateDeviceCounts(devices);
        UI.hideLoading();
        UI.updateLastUpdateTime();

    } catch (error) {
        UI.logToConsole('Error fetching devices: ' + error.message, 'error');
        UI.showError('Failed to fetch devices: ' + error.message);
    }
}

function updateDeviceCounts(devices) {
    // Update the count displays
    document.getElementById('activeDevicesCount').textContent = devices.length;
    
    const connectedCount = devices.filter(d => d.connection_status === 'CONNECTED').length;
    document.getElementById('connectedDevicesCount').textContent = connectedCount;
    
    const criticalCount = devices.filter(d => {
        const criticalProp = d.thing?.properties?.find(p => p.name === 'critical');
        return criticalProp?.last_value === true;
    }).length;
    document.getElementById('criticalDevicesCount').textContent = criticalCount;
    
    const warningCount = devices.filter(d => {
        const warningProp = d.thing?.properties?.find(p => p.name === 'warning');
        return warningProp?.last_value === true;
    }).length;
    document.getElementById('warningDevicesCount').textContent = warningCount;
    
    const greatCount = devices.filter(d => {
        const criticalProp = d.thing?.properties?.find(p => p.name === 'critical');
        const warningProp = d.thing?.properties?.find(p => p.name === 'warning');
        return !criticalProp?.last_value && !warningProp?.last_value;
    }).length;
    document.getElementById('greatDevicesCount').textContent = greatCount;
}

function displayDevices(devices) {
    if (!devicesContainer) {
        UI.logToConsole('Devices container not found', 'error');
        return;
    }

    // Clear existing content
    devicesContainer.innerHTML = '';

    if (devices.length === 0) {
        devicesContainer.innerHTML = `
            <div class="col-span-full text-center py-8">
                <p class="text-gray-500">No devices found</p>
            </div>
        `;
        return;
    }

    // Sort devices by status (critical first, then warning, then others)
    const sortedDevices = [...devices].sort((a, b) => {
        const aCritical = a.thing?.properties?.find(p => p.name === 'critical')?.last_value || false;
        const bCritical = b.thing?.properties?.find(p => p.name === 'critical')?.last_value || false;
        const aWarning = a.thing?.properties?.find(p => p.name === 'warning')?.last_value || false;
        const bWarning = b.thing?.properties?.find(p => p.name === 'warning')?.last_value || false;
        
        if (aCritical !== bCritical) return bCritical ? 1 : -1;
        if (aWarning !== bWarning) return bWarning ? 1 : -1;
        return 0;
    });

    // Create and append device cards
    sortedDevices.forEach(device => {
        const deviceCard = createDeviceCard(device);
        devicesContainer.appendChild(deviceCard);
    });
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    // Add refresh button to UI
    UI.addRefreshButton();
    
    // Set up keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            // Close all modals
            const modals = document.querySelectorAll('[id$="-modal"]');
            modals.forEach(modal => {
                modal.classList.add('hidden');
                modal.classList.remove('flex');
            });
        }
    });
}); 