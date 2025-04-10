// Helper functions moved from index.html

// Function to get display text for ice level based on temperature
function getIceLevelText(status) {
    if (status.cloudTemp === undefined || status.tempThresholdMax === undefined || status.tempThresholdMin === undefined) {
        return 'N/A';
    }
    // Simple logic: High if above max, Low if below min, Normal otherwise
    if (status.cloudTemp > status.tempThresholdMax) {
        return 'Low'; // Higher temp likely means less ice
    } else if (status.cloudTemp < status.tempThresholdMin) {
        return 'High'; // Lower temp likely means more ice
    } else {
        return 'Normal';
    }
}

// Function to format temperature (Celsius to Fahrenheit)
function formatTemperature(celsius) {
    if (celsius === undefined || celsius === null || isNaN(celsius)) {
        return 'N/A';
    }
    const fahrenheit = (celsius * 9/5) + 32;
    return `${fahrenheit.toFixed(1)}°F`;
}

// Function to format time duration
function formatTimeDuration(ms) {
    if (ms === undefined || ms === null || isNaN(ms)) {
        return 'N/A';
    }
    if (ms < 0) return 'Recent'; // Handle cases where update is very recent

    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    let result = '';
    if (hours > 0) result += `${hours}h `;
    if (minutes > 0 || hours > 0) result += `${minutes}m `; // Show minutes if hours are shown or if minutes > 0
    result += `${seconds}s`;
    
    return result.trim() || '0s'; // Ensure '0s' is shown if duration is < 1 second
}

// Function to create HTML for a single device card
function createDeviceCardHTML(device, status, index) {
    // Template literal will be pasted here in the next step
    return `PASTE_TEMPLATE_LITERAL_HERE`; 
} 