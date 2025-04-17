// Utility functions for the application

// Logging function that can be used across the application
function logToConsole(message, data, level = 'info') {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
    
    if (data) {
        console.log(logMessage, data);
    } else {
        console.log(logMessage);
    }
}

// Export the logging function to the window object
window.logToConsole = logToConsole; 