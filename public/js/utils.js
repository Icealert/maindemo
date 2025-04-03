/**
 * FreezeSense Utility Functions
 * Contains general helper functions and data processing utilities
 */

// Temperature conversion functions
function celsiusToFahrenheit(celsius) {
    if (celsius === undefined || celsius === null) return undefined;
    return (celsius * 9/5) + 32;
}

function fahrenheitToCelsius(fahrenheit) {
    return (fahrenheit - 32) * 5/9;
}

// Validation functions
function isValidMaintenanceDate(dateStr) {
    // Check if the format is correct (MM/DD/YYYY)
    const regex = /^(0[1-9]|1[0-2])\/(0[1-9]|[12][0-9]|3[01])\/[0-9]{4}$/;
    if (!regex.test(dateStr)) return false;

    // Parse the date
    const [month, day, year] = dateStr.split('/').map(num => parseInt(num));
    const date = new Date(year, month - 1, day); // month is 0-based in JS

    // Check if the date is valid and not in the future
    const now = new Date();
    now.setHours(23, 59, 59, 999); // End of today
    if (date > now) return false;

    // Check if the parsed date matches the input
    // This catches invalid dates like 02/31/2024
    return date.getMonth() === month - 1 && 
           date.getDate() === day && 
           date.getFullYear() === year;
}

function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Data processing functions
function parseTsArray(arr) {
    // Log the raw input for debugging
    if (window.UI) {
        window.UI.logToConsole('parseTsArray raw input:', {
            isArray: Array.isArray(arr),
            length: arr?.length || 0,
            sample: arr?.slice(0, 3),
            type: typeof arr
        }, 'info');
    }

    if (!Array.isArray(arr)) {
        if (window.UI) {
            window.UI.logToConsole('parseTsArray received non-array input:', arr, 'warning');
        }
        return { times: [], values: [] };
    }

    // Map the data, handling different possible property names
    const result = {
        times: arr.map(obj => {
            // Try different possible timestamp properties
            const timestamp = obj.time || obj.timestamp || obj.created_at || obj.date;
            if (!timestamp && window.UI) {
                window.UI.logToConsole('Missing timestamp in object:', obj, 'warning');
            }
            return timestamp;
        }),
        values: arr.map(obj => {
            // Try to get value, handling different possible structures
            const value = obj.hasOwnProperty('value') ? obj.value :
                         obj.hasOwnProperty('data') ? obj.data :
                         obj.hasOwnProperty('reading') ? obj.reading : null;
            
            if ((value === undefined || value === null) && window.UI) {
                window.UI.logToConsole('Missing value in object:', obj, 'warning');
            }
            return value;
        })
    };

    // Validate array lengths match
    if (result.times.length !== result.values.length && window.UI) {
        window.UI.logToConsole('Array length mismatch in parseTsArray:', {
            timesLength: result.times.length,
            valuesLength: result.values.length,
            sampleTimes: result.times.slice(0, 3),
            sampleValues: result.values.slice(0, 3)
        }, 'error');
    }

    // Remove any entries where either time or value is null/undefined
    const validIndices = result.times.map((time, i) => 
        time && result.values[i] !== undefined && result.values[i] !== null ? i : -1
    ).filter(i => i !== -1);

    const cleanResult = {
        times: validIndices.map(i => result.times[i]),
        values: validIndices.map(i => result.values[i])
    };

    // Log the final processed result
    if (window.UI) {
        window.UI.logToConsole('parseTsArray processed result:', {
            originalLength: arr.length,
            validLength: cleanResult.times.length,
            sample: validIndices.slice(0, 3).map(i => ({
                time: new Date(cleanResult.times[i]).toLocaleString(),
                value: cleanResult.values[i]
            }))
        }, 'info');
    }

    return cleanResult;
}

// Statistical functions
function calculateStats(values) {
    if (!values || values.length === 0) {
        return {
            min: 'N/A',
            max: 'N/A',
            avg: 'N/A',
            median: 'N/A',
            stdDev: 'N/A',
            mode: 'N/A'
        };
    }
    
    const numericValues = values.filter(val => !isNaN(parseFloat(val))).map(val => parseFloat(val));
    
    if (numericValues.length === 0) {
        return {
            min: 'N/A',
            max: 'N/A',
            avg: 'N/A',
            median: 'N/A',
            stdDev: 'N/A',
            mode: 'N/A'
        };
    }
    
    const sorted = [...numericValues].sort((a, b) => a - b);
    const sum = numericValues.reduce((acc, val) => acc + val, 0);
    const avg = sum / numericValues.length;
    let median;
    
    if (sorted.length % 2 === 0) {
        // Even number of values - take average of two middle values
        const midIndex = sorted.length / 2;
        median = (sorted[midIndex - 1] + sorted[midIndex]) / 2;
    } else {
        // Odd number of values - take middle value
        median = sorted[Math.floor(sorted.length / 2)];
    }
    
    const stdDev = calculateStdDev(numericValues, avg);
    const mode = calculateMode(numericValues);
    
    return {
        min: sorted[0],
        max: sorted[sorted.length - 1],
        avg: avg,
        median: median,
        stdDev: stdDev,
        mode: mode
    };
}

function calculateStdDev(values, mean) {
    if (!values || values.length <= 1) return 0;
    if (mean === undefined) {
        mean = values.reduce((acc, val) => acc + val, 0) / values.length;
    }
    
    const squaredDiffs = values.map(val => Math.pow(val - mean, 2));
    const variance = squaredDiffs.reduce((acc, val) => acc + val, 0) / values.length;
    return Math.sqrt(variance);
}

function calculateMode(values) {
    if (!values || values.length === 0) return null;
    
    const frequencyMap = new Map();
    values.forEach(val => {
        const rounded = Math.round(val * 100) / 100; // Round to 2 decimal places for better grouping
        frequencyMap.set(rounded, (frequencyMap.get(rounded) || 0) + 1);
    });
    
    let maxFreq = 0;
    let mode = null;
    frequencyMap.forEach((freq, val) => {
        if (freq > maxFreq) {
            maxFreq = freq;
            mode = val;
        }
    });
    
    return mode;
}

// Processing functions for graphs and charts
function processTemperatureByHour(timestamps, temperatures, selectedDay) {
    if (!timestamps || !temperatures || timestamps.length === 0 || temperatures.length === 0) {
        if (window.UI) {
            window.UI.logToConsole('No data available for processTemperatureByHour', 'warning');
        }
        return {
            labels: Array(24).fill(0).map((_, i) => `${i}:00`),
            data: Array(24).fill(null),
            stats: {
                min: 'N/A',
                max: 'N/A',
                avg: 'N/A'
            }
        };
    }
    
    // Initialize with all hours
    const hourlyData = Array(24).fill(null).map(() => []);
    const now = new Date();
    
    // Calculate start and end times based on selected day
    let startTime, endTime;
    
    if (selectedDay === 1) { // Past 24 hours
        startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        endTime = now;
    } else if (selectedDay === 7) { // Past 7 days
        startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        endTime = now;
    } else if (selectedDay === 30) { // Past 30 days
        startTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        endTime = now;
    } else {
        if (window.UI) {
            window.UI.logToConsole(`Invalid selectedDay value: ${selectedDay}`, 'error');
        }
        return {
            labels: Array(24).fill(0).map((_, i) => `${i}:00`),
            data: Array(24).fill(null),
            stats: {
                min: 'N/A',
                max: 'N/A',
                avg: 'N/A'
            }
        };
    }
    
    // Group temperature data by hour
    for (let i = 0; i < timestamps.length; i++) {
        try {
            const timestamp = new Date(timestamps[i]);
            const temp = temperatures[i];
            
            // Skip invalid data
            if (isNaN(timestamp.getTime()) || temp === null || temp === undefined || isNaN(temp)) {
                continue;
            }
            
            // Only include data within the selected time range
            if (timestamp >= startTime && timestamp <= endTime) {
                const hour = timestamp.getHours();
                hourlyData[hour].push(temp);
            }
        } catch (err) {
            if (window.UI) {
                window.UI.logToConsole(`Error processing temperature data point: ${err.message}`, 'error');
            }
        }
    }
    
    // Calculate average temperature for each hour that has data
    const hourlyAverages = hourlyData.map(hourTemps => {
        if (hourTemps.length === 0) return null;
        return hourTemps.reduce((sum, temp) => sum + temp, 0) / hourTemps.length;
    });
    
    // Prepare labels
    const labels = Array(24).fill(0).map((_, i) => `${i}:00`);
    
    // Calculate overall statistics from the raw data
    const validTemps = temperatures.filter(t => t !== null && t !== undefined && !isNaN(t));
    const stats = validTemps.length > 0 ? {
        min: Math.min(...validTemps),
        max: Math.max(...validTemps),
        avg: validTemps.reduce((sum, t) => sum + t, 0) / validTemps.length
    } : {
        min: 'N/A',
        max: 'N/A',
        avg: 'N/A'
    };
    
    return {
        labels,
        data: hourlyAverages,
        stats
    };
}

function processFlowByHour(timestamps, flowValues, selectedDay) {
    if (!timestamps || !flowValues || timestamps.length === 0 || flowValues.length === 0) {
        if (window.UI) {
            window.UI.logToConsole('No data available for processFlowByHour', 'warning');
        }
        return {
            labels: Array(24).fill(0).map((_, i) => `${i}:00`),
            data: Array(24).fill(null),
            stats: {
                min: 'N/A',
                max: 'N/A',
                avg: 'N/A',
                total: 'N/A'
            }
        };
    }
    
    // Initialize with all hours
    const hourlyData = Array(24).fill(null).map(() => []);
    const now = new Date();
    
    // Calculate start and end times based on selected day
    let startTime, endTime;
    
    if (selectedDay === 1) { // Past 24 hours
        startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        endTime = now;
    } else if (selectedDay === 7) { // Past 7 days
        startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        endTime = now;
    } else if (selectedDay === 30) { // Past 30 days
        startTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        endTime = now;
    } else {
        if (window.UI) {
            window.UI.logToConsole(`Invalid selectedDay value: ${selectedDay}`, 'error');
        }
        return {
            labels: Array(24).fill(0).map((_, i) => `${i}:00`),
            data: Array(24).fill(null),
            stats: {
                min: 'N/A',
                max: 'N/A',
                avg: 'N/A',
                total: 'N/A'
            }
        };
    }
    
    // Group flow data by hour
    for (let i = 0; i < timestamps.length; i++) {
        try {
            const timestamp = new Date(timestamps[i]);
            const flow = flowValues[i];
            
            // Skip invalid data
            if (isNaN(timestamp.getTime()) || flow === null || flow === undefined || isNaN(flow)) {
                continue;
            }
            
            // Only include data within the selected time range
            if (timestamp >= startTime && timestamp <= endTime) {
                const hour = timestamp.getHours();
                hourlyData[hour].push(flow);
            }
        } catch (err) {
            if (window.UI) {
                window.UI.logToConsole(`Error processing flow data point: ${err.message}`, 'error');
            }
        }
    }
    
    // Calculate average flow for each hour that has data
    const hourlyAverages = hourlyData.map(hourFlows => {
        if (hourFlows.length === 0) return null;
        return hourFlows.reduce((sum, flow) => sum + flow, 0) / hourFlows.length;
    });
    
    // Prepare labels
    const labels = Array(24).fill(0).map((_, i) => `${i}:00`);
    
    // Calculate overall statistics from the raw data
    const validFlows = flowValues.filter(f => f !== null && f !== undefined && !isNaN(f));
    const stats = validFlows.length > 0 ? {
        min: Math.min(...validFlows),
        max: Math.max(...validFlows),
        avg: validFlows.reduce((sum, f) => sum + f, 0) / validFlows.length,
        total: validFlows.reduce((sum, f) => sum + f, 0)
    } : {
        min: 'N/A',
        max: 'N/A',
        avg: 'N/A',
        total: 'N/A'
    };
    
    return {
        labels,
        data: hourlyAverages,
        stats
    };
}

// Sorting and prioritization
function sortProperties(properties) {
    // Define priority properties
    const priorityProps = ['cloudtemp', 'cloudflowrate'];
    
    return [...properties].sort((a, b) => {
        // Get indices in priority array (-1 if not found)
        const aIndex = priorityProps.indexOf(a.name);
        const bIndex = priorityProps.indexOf(b.name);
        
        // If both are priority properties, sort by priority array order
        if (aIndex !== -1 && bIndex !== -1) {
            return aIndex - bIndex;
        }
        
        // If only a is priority property, it goes first
        if (aIndex !== -1) return -1;
        
        // If only b is priority property, it goes first
        if (bIndex !== -1) return 1;
        
        // For non-priority properties, maintain original order
        return 0;
    });
}

// Export utility functions
window.Utils = {
    celsiusToFahrenheit,
    fahrenheitToCelsius,
    isValidMaintenanceDate,
    validateEmail,
    parseTsArray,
    calculateStats,
    calculateStdDev,
    calculateMode,
    processTemperatureByHour,
    processFlowByHour,
    sortProperties
}; 