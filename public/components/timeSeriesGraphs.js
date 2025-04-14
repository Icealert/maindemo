// Time Series Graph Logic for FreezeSense Dashboard

// Module-level variables
let timeSeriesDataCache = new Map();
let currentDeviceIndex; // Store the index of the device currently shown in the modal
let iceLevelVisible = true; // Default visibility state for ice level line
let tempLineVisible = true; // Default visibility state for temperature line
let charts = {}; // Store chart instances { tempChart: null, statusChart: null, flowChart: null }

/**
 * Local utility function to convert Celsius to Fahrenheit with validation
 * @param {number} celsius - Temperature in Celsius
 * @returns {number} Temperature in Fahrenheit, or null if invalid input
 */
function celsiusToFahrenheit(celsius) {
    // Check if input is a valid number
    if (celsius === null || celsius === undefined || isNaN(celsius)) {
        window.logToConsole('celsiusToFahrenheit received invalid input:', celsius, 'warning');
        return null;
    }
    // Convert to number in case it's a string
    const celsiusNum = Number(celsius);
    // The conversion formula
    return (celsiusNum * 9/5) + 32;
}

/**
 * Parses the timestamp array from API response, handling potential inconsistencies.
 * @param {Array|Object} arr - The raw array or object from the API.
 * @returns {object} An object with 'times' and 'values' arrays.
 */
function parseTsArray(arr) {
    // Log the entire raw input object/array for deep inspection
    window.logToConsole('parseTsArray full raw input:', arr, 'info'); 

    window.logToConsole('parseTsArray raw input type:', {
        isArray: Array.isArray(arr),
        length: arr?.length,
        type: typeof arr
    }, 'info');

    // Log first few raw input elements if it's an array
    if (Array.isArray(arr)) {
        window.logToConsole('parseTsArray Raw Input Sample (if array):', arr.slice(0, 3), 'info');
    } else if (arr && typeof arr === 'object') {
        // If not an array, but an object, log its keys
        window.logToConsole('parseTsArray received non-array object with keys:', Object.keys(arr), 'warning');
        
        // Handle different API response formats
        if (Array.isArray(arr.data)) {
            window.logToConsole('parseTsArray using arr.data array', 'info');
            arr = arr.data;
        } else if (Array.isArray(arr.values) && Array.isArray(arr.timestamps)) {
            // Direct timestamps + values format
            window.logToConsole('parseTsArray found timestamps/values arrays format', 'info');
            const length = Math.min(arr.timestamps.length, arr.values.length);
            window.logToConsole(`Converting ${length} timestamp/value pairs to array format`, 'info');
            
            const result = {
                times: arr.timestamps || [],
                values: arr.values || []
            };
            window.logToConsole('Returning direct timestamps/values result:', {
                timesLength: result.times.length,
                valuesLength: result.values.length,
                sample: result.times.slice(0, 3).map((t, i) => ({ time: t, value: result.values[i] }))
            }, 'info');
            return result;
        } else if (Array.isArray(arr.values)) {
            window.logToConsole('parseTsArray using arr.values', 'info');
            arr = arr.values; // Assuming structure { values: [{ time: ..., value: ...}, ...] }
        } else {
            window.logToConsole('parseTsArray received non-array input with unexpected structure.', arr, 'warning');
            return { times: [], values: [] }; // Return empty if structure is unknown
        }
    } else if (arr !== null && arr !== undefined) {
        window.logToConsole('parseTsArray received unexpected non-array, non-object input:', arr, 'warning');
        return { times: [], values: [] };
    }
    
    // If input was null/undefined or became non-array after checks
    if (!Array.isArray(arr)) {
        window.logToConsole('parseTsArray input is not a valid array after checks.', arr, 'warning');
        return { times: [], values: [] };
    }

    const result = {
        times: [],
        values: []
    };

    // Safely map values, checking each object
    arr.forEach(obj => {
        if (obj && typeof obj === 'object') {
            const time = obj.time || obj.timestamp || obj.created_at || obj.date || null;
            const value = obj.hasOwnProperty('value') ? obj.value : 
                          obj.hasOwnProperty('data') ? obj.data : 
                          obj.hasOwnProperty('reading') ? obj.reading : null;
            
            result.times.push(time);
            // Ensure nulls are explicitly pushed if value is missing or undefined
            result.values.push(value === undefined ? null : value);
        } else if (typeof obj === 'number') {
            // Special case: array of direct values without timestamps
            result.times.push(null); // No timestamp available
            result.values.push(obj);
        } else {
            // Handle cases where array elements are not objects
            window.logToConsole('parseTsArray found non-object element in array:', obj, 'warning');
            result.times.push(null);
            result.values.push(null);
        }
    });

    if (result.times.length !== result.values.length) {
        window.logToConsole('Array length mismatch in parseTsArray after processing', 'error');
        // Consider how to handle mismatch - potentially return empty or try to reconcile
    }

    // Log first few cleaned elements
    window.logToConsole('parseTsArray Cleaned Result Sample:', result.times.slice(0, 3).map((t, i) => ({ time: t, value: result.values[i] })), 'info');

    return result;
}

// Replace the entire function with the user-provided version
async function fetchTimeSeriesData(deviceId, hours) {
    // Check cache first
    // const cacheKey = `${deviceId}-${hours}`;
    // if (timeSeriesDataCache.has(cacheKey)) {
    //     logToConsole('Using cached time series data', 'info');
    //     return timeSeriesDataCache.get(cacheKey);
    // }
    // --- Force fetch for debugging --- 
    const cacheKey = `${deviceId}-${hours}`; // Still need cacheKey for storing result
    logToConsole(`[DEBUG] Bypassing cache check, forcing fetch for: ${cacheKey}`, 'warning');
    // --------------------------------

    try {
        const now = new Date();
        // Correct date subtraction
        const from = new Date(now.getTime() - hours * 60 * 60 * 1000);

        // 1) Identify the device & its properties
        const device = window.lastDevicesData.find(d => d.id === deviceId);
        // Use window.API_URL defined in index.html
        const API_URL = window.API_URL; 
        if (!API_URL) {
             throw new Error("API URL is not available");
        }
        if (!device?.thing?.id) {
            throw new Error("Device or Thing not found");
        }
        const thingId = device.thing.id;
        const properties = device.thing.properties || [];

        // Find relevant properties
        let tempProperty = properties.find(p => p.name === 'cloudtemp');
        let flowProperty = properties.find(p => p.name === 'cloudflowrate');

        // ENHANCED DEBUGGING: Check if properties were found or use fallbacks
        if (!tempProperty) {
            // Fallback to check for other common temperature property names
            const fallbackTempProperty = properties.find(p => 
                p.type === 'TEMPERATURE' || 
                p.name.toLowerCase().includes('temp')
            );
            
            if (fallbackTempProperty) {
                logToConsole(`No 'cloudtemp' property found, using fallback temperature property: ${fallbackTempProperty.name} (${fallbackTempProperty.id})`, 'warning');
                tempProperty = fallbackTempProperty;
            } else {
                logToConsole(`WARNING: No temperature property found for device ${deviceId}`, 'error');
            }
        }

        // Add fallback for flow property too
        if (!flowProperty) {
            // Fallback to check for other common flow property names
            const fallbackFlowProperty = properties.find(p => 
                p.type === 'FLOW_RATE' || 
                p.type === 'FLOAT' || 
                p.name.toLowerCase().includes('flow')
            );
            
            if (fallbackFlowProperty) {
                logToConsole(`No 'cloudflowrate' property found, using fallback flow property: ${fallbackFlowProperty.name} (${fallbackFlowProperty.id})`, 'warning');
                flowProperty = fallbackFlowProperty;
            } else {
                logToConsole(`WARNING: No flow property found for device ${deviceId}`, 'error');
            }
        }

        // Log request details for debugging
        logToConsole(`Fetching time series data for thing ${thingId}:`, 'info');
        if (tempProperty) logToConsole(`Temperature property ID: ${tempProperty.id} (${tempProperty.type})`, 'info');
        if (flowProperty) logToConsole(`Flow rate property ID: ${flowProperty.id} (${flowProperty.type})`, 'info');

        // Log property details for debugging
        logToConsole('Property details:', {
            temperature: tempProperty ? {
                id: tempProperty.id,
                type: tempProperty.type,
                name: tempProperty.name,
                last_value: tempProperty.last_value
            } : null,
            flow: flowProperty ? {
                id: flowProperty.id,
                type: flowProperty.type,
                name: flowProperty.name,
                last_value: flowProperty.last_value
            } : null
        }, 'info');

        // 2) Compute interval to stay under 1000 points
        const timeRangeSeconds = hours * 3600;
        const interval = Math.max(Math.ceil(timeRangeSeconds / 1000), 60);

        // 3) Basic fetch options
        const fetchOptions = {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        };

        // 4) Build query string
        const queryParams = new URLSearchParams({
            interval: interval.toString(), // Let API determine default interval
            from: from.toISOString(),
            to: now.toISOString(),
            // aggregation: 'AVG', // Remove aggregation for now
            desc: 'false'
        }).toString();

        // Log query details
        logToConsole('Time series query parameters:', {
            interval,
            from: from.toLocaleString(),
            to: now.toLocaleString(),
            queryString: queryParams
        }, 'info');

        // 5) Fetch Temperature Data Sequentially
        logToConsole('Fetching Temperature Data...', 'info');
        let tempData = { data: [] }; // Default empty
        if (tempProperty) {
            const tempApiUrl = `${API_URL}/api/proxy/timeseries/${thingId}/${tempProperty.id}?${queryParams}`;
            logToConsole(`Attempting to fetch temperature from: ${tempApiUrl}`, 'info'); // Log URL
            
            try {
                // Fetch using the standard endpoint
                const tempResponse = await fetch(tempApiUrl, fetchOptions);
                
                if (!tempResponse.ok) {
                    const errorText = await tempResponse.text();
                    logToConsole(`Temperature fetch failed: ${tempResponse.status} - ${errorText}`, 'warning');
                    // Don't throw, continue with empty data
                } else {
                    // Enhanced logging to see exactly what's returned
                    const responseText = await tempResponse.text();
                    
                    // Log deviceId and first part of response for debugging
                    logToConsole(`Temperature response for device ${deviceId} (${thingId}):`, 'info');
                    logToConsole(`First 200 chars: ${responseText.substring(0, 200)}...`, 'info');
                    
                    // For the specific problematic device, log more details
                    if (deviceId === '9b849c2d-0ccc-4fe3-bb66-a619c946b3dd') {
                        logToConsole(`FULL TEMP RESPONSE for problematic device:`, 'info');
                        logToConsole(responseText, 'info');
                    }
                    
                    // Try to parse the JSON
                    try {
                        tempData = JSON.parse(responseText);
                    } catch (parseError) {
                        logToConsole(`Failed to parse temperature JSON: ${parseError.message}`, 'error');
                        // Don't throw, continue with empty data
                    }
                }
                
                // Log different JSON structures we might expect
                logToConsole('Temperature response structure:', {
                    hasDataArray: Array.isArray(tempData?.data),
                    dataLength: tempData?.data?.length || 0,
                    hasTimestamps: Array.isArray(tempData?.timestamps),
                    timestampsLength: tempData?.timestamps?.length || 0,
                    hasValues: Array.isArray(tempData?.values),
                    valuesLength: tempData?.values?.length || 0,
                    topLevelKeys: Object.keys(tempData || {})
                }, 'info');
                
                // If we have timestamps/values array but no data array, convert format
                if (!tempData.data && Array.isArray(tempData.timestamps) && Array.isArray(tempData.values)) {
                    logToConsole('Converting timestamps/values format to data array format', 'info');
                    const length = Math.min(tempData.timestamps.length, tempData.values.length);
                    tempData.data = Array(length).fill().map((_, i) => ({
                        time: tempData.timestamps[i],
                        value: tempData.values[i]
                    }));
                }
                
                window.logToConsole('Processed temperature response:', {
                    dataLength: tempData?.data?.length || 0,
                    sample: tempData?.data?.slice(0, 3) || []
                }, 'info');
            } catch (error) {
                // Log the error message from the fetch attempt or the re-thrown error
                logToConsole(`Error during temperature fetch operation: ${error.message}`, 'error'); 
                // Keep default empty tempData
            }
        }

        // 6) Fetch Flow Data Sequentially
        logToConsole('Fetching Flow Data...', 'info');
        let flowData = { data: [] }; // Default empty
        if (flowProperty) {
            const flowApiUrl = `${API_URL}/api/proxy/timeseries/${thingId}/${flowProperty.id}?${queryParams}`;
            logToConsole(`Attempting to fetch flow from: ${flowApiUrl}`, 'info');
            
            try {
                // Fetch using the standard endpoint
                const flowResponse = await fetch(flowApiUrl, fetchOptions);
                
                if (!flowResponse.ok) {
                    const errorText = await flowResponse.text();
                    logToConsole(`Flow fetch failed: ${flowResponse.status} - ${errorText}`, 'warning');
                    // Don't throw, continue with empty data
                } else {
                    // Get response as text first for logging
                    const responseText = await flowResponse.text();
                    logToConsole(`Flow response first 200 chars: ${responseText.substring(0, 200)}...`, 'info');
                    
                    // Parse JSON
                    try {
                        flowData = JSON.parse(responseText);
                    } catch (parseError) {
                        logToConsole(`Failed to parse flow JSON: ${parseError.message}`, 'error');
                        // Don't throw, continue with empty data
                    }
                }
                
                // Log the structure for debugging
                logToConsole('Flow response structure:', {
                    hasDataArray: Array.isArray(flowData?.data),
                    dataLength: flowData?.data?.length || 0,
                    hasTimestamps: Array.isArray(flowData?.timestamps),
                    timestampsLength: flowData?.timestamps?.length || 0,
                    hasValues: Array.isArray(flowData?.values),
                    valuesLength: flowData?.values?.length || 0,
                    topLevelKeys: Object.keys(flowData || {})
                }, 'info');
                
                // If we have timestamps/values array but no data array, convert format
                if (!flowData.data && Array.isArray(flowData.timestamps) && Array.isArray(flowData.values)) {
                    logToConsole('Converting flow timestamps/values format to data array format', 'info');
                    const length = Math.min(flowData.timestamps.length, flowData.values.length);
                    flowData.data = Array(length).fill().map((_, i) => ({
                        time: flowData.timestamps[i],
                        value: flowData.values[i]
                    }));
                }
                
                window.logToConsole('Raw flow rate response:', flowData, 'info');
            } catch (error) {
                logToConsole(`Error during flow fetch: ${error.message}`, 'error');
                // Keep default empty flowData
            }
        }

        // 7) Process the responses (moved logging here)
        window.logToConsole('Before parsing temperature:', { 
            tempDataExists: !!tempData, 
            tempDataKeys: tempData ? Object.keys(tempData) : null,
            tempDataDataIsArray: Array.isArray(tempData?.data),
            tempDataDataLength: tempData?.data?.length 
        }, 'info');
        const tempResult = parseTsArray(tempData.data || []);
        
        window.logToConsole('Before parsing flow:', { 
            flowDataExists: !!flowData, 
            flowDataKeys: flowData ? Object.keys(flowData) : null,
            flowDataDataIsArray: Array.isArray(flowData?.data),
            flowDataDataLength: flowData?.data?.length 
        }, 'info');
        const flowResult = parseTsArray(flowData.data || []);

        // Log the raw API responses with sample data
        logToConsole('Raw API Response Data:', {
            temperature: {
                total: tempData.data?.length || 0,
                sample: tempData.data?.slice(0, 5)?.map(d => ({
                    time: d.time ? new Date(d.time).toLocaleString() : 'null',
                    value: d.value !== null ? `${d.value.toFixed(2)}°C (${((d.value * 9/5) + 32).toFixed(2)}°F)` : 'null'
                }))
            },
            flow: {
                total: flowData.data?.length || 0,
                sample: flowData.data?.slice(0, 5)?.map(d => ({
                    time: d.time ? new Date(d.time).toLocaleString() : 'null',
                    value: d.value !== null ? `${d.value.toFixed(3)} L/min` : 'null'
                }))
            }
        }, 'info');

        // Log the processed results
        logToConsole('Time series data fetched:', {
            temperaturePoints: tempResult.times.length,
            flowPoints: flowResult.times.length,
            processedData: {
                temperature: {
                    sample: tempResult.values.slice(0, 5).map((v, i) => ({
                        time: tempResult.times[i] ? new Date(tempResult.times[i]).toLocaleString() : 'null',
                        value: v !== null ? `${v.toFixed(2)}°C (${((v * 9/5) + 32).toFixed(2)}°F)` : 'null'
                    }))
                },
                flow: {
                    sample: flowResult.values.slice(0, 5).map((v, i) => ({
                        time: flowResult.times[i] ? new Date(flowResult.times[i]).toLocaleString() : 'null',
                        value: v !== null ? `${v.toFixed(3)} L/min` : 'null'
                    }))
                }
            }
        });

        // 8) Return formatted data
        const result = {
            temperature: {
                timestamps: tempResult.times,
                values: tempResult.values
            },
            flow: {
                timestamps: flowResult.times,
                values: flowResult.values
            },
            // Keep status placeholders if needed elsewhere
            warningStatus: [],
            criticalStatus: []
        };

        // Cache the result before returning
        timeSeriesDataCache.set(cacheKey, result);

        return result;
    } catch (error) {
        logToConsole(`Error fetching time series: ${error.message}`, 'error');
        return null;
    }
}

/**
 * Calculates the standard deviation of an array of numbers.
 * @param {number[]} values - Array of numbers.
 * @returns {number} The standard deviation.
 */
function calculateStdDev(values) {
    if (!values || values.length === 0) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const squareDiffs = values.map(value => {
        const diff = value - mean;
        return diff * diff;
    });
    const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / values.length;
    return Math.sqrt(avgSquareDiff);
}

/**
 * Calculates the mode (most frequent value) of an array of numbers.
 * Rounds values to one decimal place before finding the mode.
 * @param {number[]} values - Array of numbers.
 * @returns {number} The mode.
 */
function calculateMode(values) {
    if (!values || values.length === 0) return NaN;
    const rounded = values.map(v => Math.round(v * 10) / 10); // Round to 1 decimal place
    const frequency = {};
    let maxFreq = 0;
    let mode = rounded[0]; // Default to first element

    rounded.forEach(value => {
        frequency[value] = (frequency[value] || 0) + 1;
        if (frequency[value] > maxFreq) {
            maxFreq = frequency[value];
            mode = value;
        }
    });
    return mode;
}

/**
 * Formats a temperature value (Fahrenheit) for display, adding °F suffix
 * and applying red color if above the threshold.
 * @param {number} value - The temperature value in Fahrenheit.
 * @returns {string} HTML string for the formatted value.
 */
function formatTempValue(value) {
     if (value === undefined || value === null || isNaN(value)) return '-';
    const device = window.lastDevicesData[currentDeviceIndex]; // Assumes currentDeviceIndex is set
    const tempThresholdMaxC = device?.thing?.properties?.find(p => p.name === 'tempThresholdMax')?.last_value;
    const thresholdF = tempThresholdMaxC !== undefined ? celsiusToFahrenheit(tempThresholdMaxC) : 34; // Use global converter

    const displayValue = value.toFixed(1); // Format to one decimal place

    return parseFloat(value) > thresholdF ?
        `<span class="text-red-600">${displayValue}°F</span>` :
        `${displayValue}°F`;
}

/**
 * Processes temperature and ice level data for a specific day to be plotted.
 * @param {string[]} timestamps - Array of ISO timestamp strings.
 * @param {number[]} temperatures - Array of temperature values (Celsius).
 * @param {number} selectedDay - 0 for Today, 1 for Yesterday, etc.
 * @returns {object} Object containing datasets for Chart.js, the threshold in Fahrenheit, and a noData flag.
 */
function processTemperatureByHour(timestamps, temperatures, selectedDay) {
    window.logToConsole(`Processing temperature data for day ${selectedDay}`, 'info');
    window.logToConsole(`Inputs: ${timestamps?.length} timestamps, ${temperatures?.length} temps`, 'info');

    // Handle empty input case
    if (!timestamps || !temperatures || timestamps.length === 0 || temperatures.length === 0) {
        window.logToConsole('Empty input data for temperature processing', 'warning');
        return { datasets: [], thresholdF: 34, noData: true };
    }

    // --- Work with local dates for display --- 
    const now = new Date();
    // Get the start of today in local time zone
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    window.logToConsole(`Today in local time: ${todayStart.toLocaleString()}`, 'info');

    // Calculate the start of the target day in local time
    const dayStart = new Date(todayStart);
    dayStart.setDate(todayStart.getDate() - selectedDay);
    
    // Calculate the end of the target day in local time
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayStart.getDate() + 1);

    window.logToConsole(`Day ${selectedDay} boundaries (local): ${dayStart.toLocaleString()} to ${dayEnd.toLocaleString()}`, 'info');
    
    // Get current hour in local time for filtering today's future hours
    const currentHour = now.getHours();

    const hourlyData = {};
    const device = window.lastDevicesData[currentDeviceIndex];
    const tempThresholdMaxC = device?.thing?.properties?.find(p => p.name === 'tempThresholdMax')?.last_value;
    const thresholdF = tempThresholdMaxC !== undefined ? celsiusToFahrenheit(tempThresholdMaxC) : 34;
    const sensorPlacement = device?.thing?.properties?.find(p => p.name === 'sensorplacement')?.last_value || 0;
    const placementPercent = (sensorPlacement * 100).toFixed(0);

    let hasDataForDay = false;
    let allTempsForDayF = []; // Store temps in Fahrenheit for stats
    let dataPointsProcessed = 0;
    let dataPointsForDay = 0;

    for (let i = 0; i < timestamps.length; i++) {
        const timestampStr = timestamps[i];
        const tempC = temperatures[i];
        dataPointsProcessed++;

        // Skip invalid data points
        if (tempC === null || tempC === undefined || isNaN(tempC) || !timestampStr) {
            continue;
        }

        // Parse UTC timestamp and convert to local time
        const utcTimestamp = new Date(timestampStr);
        if (isNaN(utcTimestamp.getTime())) {
            window.logToConsole(`Invalid timestamp at index ${i}: ${timestampStr}`, 'warning');
            continue;
        }

        // Convert UTC to local time by adjusting for timezone offset
        const localTimestamp = new Date(utcTimestamp.getTime() + (utcTimestamp.getTimezoneOffset() * 60000));

        // Debug timestamp conversion
        if (i < 5 || i % 100 === 0) { // Log first 5 and every 100th
            window.logToConsole(`Timestamp ${i}: UTC=${timestampStr}, Local=${localTimestamp.toLocaleString()}`, 'info');
        }

        // Compare with local time boundaries using local timestamp
        const timestampMs = localTimestamp.getTime();
        const startMs = dayStart.getTime();
        const endMs = dayEnd.getTime();
        
        if (timestampMs < startMs || timestampMs >= endMs) {
            continue; // Skip if outside day boundaries
        }

        dataPointsForDay++;
        const localHour = localTimestamp.getHours();

        // For today (selectedDay === 0), only include hours up to current local hour
        if (selectedDay === 0 && localHour > currentHour) {
            continue;
        }

        hasDataForDay = true;
        const tempF = celsiusToFahrenheit(tempC);
        
        // Skip invalid temperature values
        if (tempF === null || tempF === undefined || isNaN(tempF)) {
            window.logToConsole(`Invalid temperature conversion at index ${i}: ${tempC}°C`, 'warning');
            continue;
        }
        
        allTempsForDayF.push(tempF);

        if (!hourlyData[localHour]) {
            hourlyData[localHour] = { tempsF: [], hour: localHour };
        }
        hourlyData[localHour].tempsF.push(tempF);
    }

    window.logToConsole(`Processed ${dataPointsProcessed} data points, found ${dataPointsForDay} for day ${selectedDay}`, 'info');
    window.logToConsole(`Valid temperature readings for day ${selectedDay}: ${allTempsForDayF.length}`, 'info');
    
    if (hasDataForDay) {
        window.logToConsole(`Hourly breakdown for day ${selectedDay}:`, 
            Object.entries(hourlyData).map(([hour, data]) => 
                `Hour ${hour}: ${data.tempsF.length} readings (avg: ${data.tempsF.reduce((a,b) => a+b, 0) / data.tempsF.length}°F)`
            ),
        'info');
    }

    // Update statistics display if it's a single day view and data exists
    const statsContainer = document.getElementById('tempStats');
    if (statsContainer && hasDataForDay) {
        const minTemp = Math.min(...allTempsForDayF);
        const maxTemp = Math.max(...allTempsForDayF);
        document.getElementById('tempRange').innerHTML = `${minTemp.toFixed(1)}°F - ${maxTemp.toFixed(1)}°F`;

        const avgTemp = allTempsForDayF.reduce((a, b) => a + b, 0) / allTempsForDayF.length;
        document.getElementById('tempAvg').innerHTML = formatTempValue(avgTemp); // Use helper

        const stdDev = calculateStdDev(allTempsForDayF);
        document.getElementById('tempStdDev').innerHTML = `±${stdDev.toFixed(1)}°F`;

        const mode = calculateMode(allTempsForDayF);
        document.getElementById('tempMode').innerHTML = formatTempValue(mode); // Use helper
         statsContainer.classList.remove('opacity-50', 'pointer-events-none');
    } else if (statsContainer) {
         // Clear or disable stats if no data or multi-day view
         document.getElementById('tempRange').textContent = '-';
         document.getElementById('tempAvg').textContent = '-';
         document.getElementById('tempStdDev').textContent = '-';
         document.getElementById('tempMode').textContent = '-';
         // Optionally add opacity if it wasn't handled by the caller (updateTempGraph)
         // statsContainer.classList.add('opacity-50', 'pointer-events-none');
    }

    if (!hasDataForDay) {
        return { datasets: [], thresholdF, noData: true };
    }

    // --- Create Datasets ---
    const dayLabels = ['Today', 'Yesterday', '2 Days Ago'];
    const colors = [
        { border: 'rgb(34, 197, 94)', background: 'rgba(34, 197, 94, 0.1)' }, // Green
        { border: 'rgb(59, 130, 246)', background: 'rgba(59, 130, 246, 0.1)' }, // Blue
        { border: 'rgb(168, 85, 247)', background: 'rgba(168, 85, 247, 0.1)' }  // Purple
    ];
    const dayColor = colors[selectedDay % colors.length];

    const hourlyAvgTempsF = Array(24).fill(null);
    const hourlyIceLevel = Array(24).fill(null); // 1 = Above Sensor, 0 = Below Sensor

    for (let hour = 0; hour < 24; hour++) {
         if (selectedDay === 0 && hour > currentHour) continue; // Don't plot future hours for today

        const data = hourlyData[hour];
        if (data && data.tempsF.length > 0) {
            const avgTempF = data.tempsF.reduce((a, b) => a + b, 0) / data.tempsF.length;
            hourlyAvgTempsF[hour] = avgTempF;
            hourlyIceLevel[hour] = avgTempF <= thresholdF ? 1 : 0;
        }
    }

    const tempData = {
        label: `${dayLabels[selectedDay]} (Temperature)`,
        data: hourlyAvgTempsF,
        yAxisID: 'y-temp',
        borderColor: dayColor.border, // Use color based on day
        backgroundColor: dayColor.background, // Use color based on day
        tension: 0.1,
        fill: false, // Keep line distinct
        pointRadius: 3,
        pointHoverRadius: 5,
        order: 1 // Draw temp lines first
    };

     // Ice Level Dataset (Only create if iceLevelVisible is true)
     let iceLevelData = null;
     // Always calculate hourlyIceLevel, but only create dataset if visible
     if (iceLevelVisible) {
        iceLevelData = {
            label: `Ice Level (${dayLabels[selectedDay]})`,
            data: hourlyIceLevel,
            yAxisID: 'y-ice',
            borderColor: function(context) { // Color based on value
                const value = context.raw;
                return value === 0 ? 'rgba(239, 68, 68, 0.6)' : 'rgba(147, 197, 253, 0.6)'; // Red below, Light blue above
            },
            backgroundColor: function(context) {
                const value = context.raw;
                return value === 0 ? 'rgba(239, 68, 68, 0.1)' : 'rgba(147, 197, 253, 0.1)';
            },
            stepped: true,
            fill: true,
            pointRadius: 0, // No points for stepped line
            pointHoverRadius: 0,
            order: 2 // Draw ice level area behind temp line
        };
     }

    // Threshold Dataset (Only create once, maybe outside this function or check if exists)
    const thresholdData = {
        label: 'Temperature Threshold',
        data: Array(24).fill(thresholdF),
        yAxisID: 'y-temp',
        borderColor: 'rgba(100, 100, 100, 0.6)', // Darker grey
        borderDash: [5, 5],
        pointRadius: 0,
        fill: false,
        order: 0 // Draw threshold line behind everything
    };

    // Combine datasets, conditionally including ice level and temp line
    let finalDatasets = [thresholdData];
    if (tempLineVisible) {
        finalDatasets.push(tempData);
    }
     if (iceLevelVisible && iceLevelData) { // Check if iceLevelData was created
         finalDatasets.push(iceLevelData);
     }

    // Create hour labels with AM/PM format
    const hourLabels = Array(24).fill().map((_, i) => {
        const hour = i % 12 || 12;
        const ampm = i < 12 ? 'AM' : 'PM';
        return `${hour}${ampm}`;
    });

    // Return with updated hour labels
    return { 
        datasets: finalDatasets, 
        thresholdF, 
        noData: false,
        hourLabels // Add hourLabels to the return object
    };
}

/**
 * Updates the temperature/ice level chart with data for the selected days.
 * @param {number} deviceIdx - The index of the device.
 * @param {number[]} selectedDays - Array of days to display (0=Today, 1=Yesterday, ...).
 */
async function updateTempGraph(deviceIdx, selectedDays, timeSeriesData = null) {
    const device = window.lastDevicesData[deviceIdx];
    if (!device?.id) {
        logToConsole('No device found for index ' + deviceIdx, 'error');
        return;
    }

    // Clear device cache before updating
    clearDeviceCache(device.id);
    logToConsole('Cleared device cache for temperature graph update', 'info');

    // Ensure selectedDays is an array and sorted
    selectedDays = Array.isArray(selectedDays) ? selectedDays.sort((a, b) => a - b) : [selectedDays];
    
    // Get the stats container
    const statsContainer = document.getElementById('tempStats');

    // Hide or show stats based on number of selected days
    if (selectedDays.length > 1) {
        statsContainer.classList.add('opacity-50', 'pointer-events-none');
        // Clear stats when multiple days are selected
        document.getElementById('tempRange').textContent = '-';
        document.getElementById('tempAvg').textContent = '-';
        document.getElementById('tempStdDev').textContent = '-';
        document.getElementById('tempMode').textContent = '-';
    } else {
        statsContainer.classList.remove('opacity-50', 'pointer-events-none');
    }

    // If timeSeriesData is not provided, fetch it
    if (!timeSeriesData) {
        timeSeriesData = await fetchTimeSeriesData(device.id, 72); // Fetch 72 hours for consistency
    }

    if (!timeSeriesData || !timeSeriesData.temperature || !timeSeriesData.temperature.values) {
        logToConsole('No data returned from fetchTimeSeriesData or temperature data missing', 'error');
        // Handle no data display
        const ctx = document.getElementById('tempChart').getContext('2d');
        const chartContainer = ctx.canvas.parentElement;
        
        // Remove any existing no-data message
        const existingMessage = chartContainer.querySelector('.no-data-message');
        if (existingMessage) {
            existingMessage.remove();
        }

        const noDataMessage = document.createElement('div');
        noDataMessage.className = 'absolute inset-0 flex items-center justify-center text-center text-gray-500 no-data-message';
        noDataMessage.innerHTML = `<p class="text-lg font-medium">No temperature data available</p><p class="text-sm">for the selected period</p>`;
        chartContainer.style.position = 'relative';
        chartContainer.appendChild(noDataMessage);

        // Clear existing chart if it exists
        if (charts.tempChart) {
            charts.tempChart.data.labels = [];
            charts.tempChart.data.datasets = [];
            charts.tempChart.update();
        }
        return;
    }

    // Process data for each selected day
    const allDatasets = [];
    let hasAnyData = false;
    let hourLabels = null;
    let thresholdDatasetAdded = false;

    for (const day of selectedDays) {
        const { datasets, thresholdF, noData, hourLabels: dayHourLabels } = processTemperatureByHour(
            timeSeriesData.temperature.timestamps,
            timeSeriesData.temperature.values,
            day
        );

        if (noData) {
            const dayLabel = day === 0 ? 'Today' : day === 1 ? 'Yesterday' : '2 Days Ago';
            logToConsole(`No temperature data available for ${dayLabel}`, 'warning');
        } else {
            hasAnyData = true;
            // Add threshold dataset only once
            const thresholdDs = datasets.find(ds => ds.label === 'Temperature Threshold');
            if (thresholdDs && !thresholdDatasetAdded) {
                allDatasets.push(thresholdDs);
                thresholdDatasetAdded = true;
            }
            // Add other datasets (temp, ice level)
            allDatasets.push(...datasets.filter(ds => ds.label !== 'Temperature Threshold'));
            if (!hourLabels) {
                hourLabels = dayHourLabels;
            }
        }
    }

    // Chart Update/Creation
    const ctx = document.getElementById('tempChart').getContext('2d');
    const chartContainer = ctx.canvas.parentElement;

    // Remove any existing no-data message
    const existingMessage = chartContainer.querySelector('.no-data-message');
    if (existingMessage) {
        existingMessage.remove();
    }

    if (!hasAnyData) {
        logToConsole('No temperature data available for any selected days.', 'warning');
        const noDataMessage = document.createElement('div');
        noDataMessage.className = 'absolute inset-0 flex items-center justify-center text-center text-gray-500 no-data-message';
        noDataMessage.innerHTML = `<p class="text-lg font-medium">No temperature data available</p><p class="text-sm">for the selected period${selectedDays.length > 1 ? 's' : ''}</p>`;
        chartContainer.style.position = 'relative';
        chartContainer.appendChild(noDataMessage);
        
        if (charts.tempChart) {
            charts.tempChart.data.labels = [];
            charts.tempChart.data.datasets = [];
            charts.tempChart.update();
        }
        return;
    }

    // If chart exists, update it; otherwise, create it
    if (charts.tempChart) {
        window.logToConsole('Updating existing temperature chart', 'info');
        charts.tempChart.data.labels = hourLabels;
        charts.tempChart.data.datasets = allDatasets;
        charts.tempChart.options.scales['y-temp'].display = tempLineVisible;
        charts.tempChart.options.scales['y-ice'].display = iceLevelVisible;
        charts.tempChart.update();
    } else {
        window.logToConsole('Creating new temperature chart', 'info');
        charts.tempChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: hourLabels,
                datasets: allDatasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: {
                    duration: 300
                },
                interaction: {
                    mode: 'index',
                    intersect: false
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            title: (context) => `Hour: ${context[0].label}`,
                            label: (context) => {
                                const datasetLabel = context.dataset.label || '';
                                const value = context.raw;
                                if (value === null || value === undefined) return `${datasetLabel}: No data`;

                                if (datasetLabel.includes('Ice Level')) {
                                    const device = window.lastDevicesData[deviceIdx];
                                    const sensorPlacement = device?.thing?.properties?.find(p => p.name === 'sensorplacement')?.last_value || 0;
                                    const placementPercent = (sensorPlacement * 100).toFixed(0);
                                    return `Ice Level: ${value === 1 ? `> ${placementPercent}%` : `< ${placementPercent}%`} full`;
                                } else if (datasetLabel === 'Temperature Threshold') {
                                    return `Threshold: ${value.toFixed(1)}°F`;
                                } else {
                                    return `Temp: ${value.toFixed(1)}°F`;
                                }
                            }
                        },
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        titleFont: { size: 13 },
                        bodyFont: { size: 12 },
                        padding: 10
                    },
                    legend: {
                        position: 'top',
                        labels: {
                            usePointStyle: true,
                            padding: 15,
                            boxWidth: 10,
                            font: { size: 11 }
                        }
                    }
                },
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: 'Hour of Day'
                        },
                        grid: {
                            display: true,
                            drawOnChartArea: true,
                            color: 'rgba(0,0,0,0.05)'
                        }
                    },
                    'y-temp': {
                        type: 'linear',
                        display: tempLineVisible,
                        position: 'left',
                        title: {
                            display: true,
                            text: 'Temperature (°F)',
                            font: { size: 12 }
                        },
                        grid: {
                            display: true,
                            drawOnChartArea: true,
                            color: 'rgba(0,0,0,0.05)'
                        },
                        ticks: {
                            callback: value => `${value.toFixed(0)}°F`
                        }
                    },
                    'y-ice': {
                        type: 'linear',
                        display: iceLevelVisible,
                        position: 'right',
                        title: {
                            display: true,
                            text: 'Ice Level',
                            font: { size: 12 }
                        },
                        min: -0.1,
                        max: 1.1,
                        grid: {
                            display: false
                        },
                        ticks: {
                            stepSize: 1,
                            callback: value => value === 1 ? 'Above' : value === 0 ? 'Below' : ''
                        }
                    }
                }
            }
        });
    }
}

/**
 * Clears cache for a specific device
 * @param {string} deviceId - The ID of the device to clear cache for
 */
function clearDeviceCache(deviceId) {
    if (!deviceId) return;
    
    const cacheKeysToRemove = [];
    for (const key of timeSeriesDataCache.keys()) {
        if (key.startsWith(deviceId)) {
            cacheKeysToRemove.push(key);
        }
    }
    cacheKeysToRemove.forEach(key => {
        logToConsole(`Clearing cache for device ${deviceId}: ${key}`, 'info');
        timeSeriesDataCache.delete(key);
    });
}

/**
 * Initializes all graphs for a given device index, typically when the modal opens.
 * Defaults to showing 'Today's data.
 * @param {number} deviceIdx - The index of the device.
 */
function initializeGraphs(deviceIdx) {
    window.logToConsole(`Initializing graphs for device index: ${deviceIdx}`, 'info');
    currentDeviceIndex = deviceIdx; // Set the current device index

    const device = window.lastDevicesData[deviceIdx];
    if (!device?.id) {
        logToConsole('No device found for index ' + deviceIdx, 'error');
        return;
    }

    // Clear only this device's cache
    clearDeviceCache(device.id);
    logToConsole('Cleared device cache for initialization', 'info');

    // Reset visibility toggles to default
    iceLevelVisible = true;
    tempLineVisible = true;
    const tempToggle = document.getElementById('temp-line-toggle');
    const iceToggle = document.getElementById('ice-level-toggle');
    if (tempToggle) tempToggle.checked = true;
    if (iceToggle) iceToggle.checked = true;

    // Clear any existing chart instances
    Object.values(charts).forEach(chart => chart?.destroy());
    charts = {};

    // Update time range buttons to show 'Today' as active
    updateTimeRangeButtons('temp-time-range', 0);
    document.querySelectorAll('#temp-time-range button').forEach(btn => {
        if (parseInt(btn.dataset.days) === 0) btn.classList.add('active');
        else btn.classList.remove('active');
    });
    updateTimeRangeButtons('status-time-range', 0);
    updateTimeRangeButtons('flow-time-range', 0);

    // Fetch 72 hours of data once and cache it
    fetchTimeSeriesData(device.id, 72).then(data => {
        if (data) {
            // Initialize graphs with 'Today' data (day 0)
            updateTempGraph(deviceIdx, [0], data); // Pass the fetched data
            updateStatusGraph(deviceIdx, 0);
            updateFlowGraph(deviceIdx, 0, data); // Pass the fetched data
        }
    });
}

/**
 * Toggles the active state of a temperature graph time range button and updates the graph.
 * Ensures at least one button remains active.
 * @param {number} deviceIdx - The index of the device.
 * @param {number} day - The day index (0=Today, 1=Yesterday, ...).
 */
function toggleTempGraph(deviceIdx, day) {
    const buttonContainer = document.getElementById('temp-time-range');
    const button = buttonContainer.querySelector(`button[data-days="${day}"]`);
    if (!button) return;

    const activeButtons = buttonContainer.querySelectorAll('button.active');

    // If clicking an active button and it's the only one active, do nothing
    if (button.classList.contains('active') && activeButtons.length === 1) {
        return;
    }

    // Get device and validate
    const device = window.lastDevicesData[deviceIdx];
    if (!device?.id) {
        logToConsole('No device found for index ' + deviceIdx, 'error');
        return;
    }

    button.classList.toggle('active');

    // Get all newly active days
    const newActiveDays = Array.from(buttonContainer.querySelectorAll('button.active'))
        .map(btn => parseInt(btn.dataset.days))
        .sort((a, b) => a - b); // Sort days to maintain consistent order
        
    logToConsole(`Temperature graph toggled to days: ${newActiveDays.join(', ')}`, 'info');

    // Check if we have cached data
    const cacheKey = `${device.id}-72`;
    let timeSeriesData = timeSeriesDataCache.get(cacheKey);

    // If we have cached data, use it directly
    if (timeSeriesData) {
        logToConsole('Using cached time series data for toggle', 'info');
        updateTempGraph(deviceIdx, newActiveDays, timeSeriesData);
        updateStatusGraph(deviceIdx, newActiveDays[0]);
        updateFlowGraph(deviceIdx, newActiveDays[0], timeSeriesData);
    } else {
        // If no cached data, fetch it once and use it
        logToConsole('No cached data found, fetching new data', 'info');
        fetchTimeSeriesData(device.id, 72).then(data => {
            if (data) {
                updateTempGraph(deviceIdx, newActiveDays, data);
                updateStatusGraph(deviceIdx, newActiveDays[0]);
                updateFlowGraph(deviceIdx, newActiveDays[0], data);
            }
        });
    }
}

/**
 * Toggles the visibility of the Ice Level line on the temperature chart.
 */
 function toggleIceLevel() {
    iceLevelVisible = document.getElementById('ice-level-toggle').checked;
     window.logToConsole(`Ice Level visibility toggled: ${iceLevelVisible}`);
    // Re-render the temperature graph with current settings
    if (currentDeviceIndex !== undefined) {
        const activeDays = Array.from(document.querySelectorAll('#temp-time-range button.active'))
            .map(btn => parseInt(btn.dataset.days));
        updateTempGraph(currentDeviceIndex, activeDays);
    }
}

/**
 * Toggles the visibility of the Temperature line on the temperature chart.
 */
 function toggleTempLine() {
    tempLineVisible = document.getElementById('temp-line-toggle').checked;
     window.logToConsole(`Temperature Line visibility toggled: ${tempLineVisible}`);

    // Re-render the temperature graph with current settings
    if (currentDeviceIndex !== undefined) {
        const activeDays = Array.from(document.querySelectorAll('#temp-time-range button.active'))
            .map(btn => parseInt(btn.dataset.days));
        updateTempGraph(currentDeviceIndex, activeDays);
    }
}


/**
 * Updates the device status timeline graph for a selected day.
 * @param {number} deviceIdx - The index of the device.
 * @param {number} selectedDay - The day index (0=Today, 1=Yesterday, ...).
 */
async function updateStatusGraph(deviceIdx, selectedDay) {
    currentDeviceIndex = deviceIdx; // Store index
    const device = window.lastDevicesData[deviceIdx];
    updateTimeRangeButtons('status-time-range', selectedDay);

    window.logToConsole(`Updating status graph for day ${selectedDay}`, 'info');

    // Display unavailable message as status data is not fetched by the current fetchTimeSeriesData
    window.logToConsole('Status data not available with current fetchTimeSeriesData version.', 'warning');
    const noDataMessage = document.createElement('div');
    noDataMessage.className = 'absolute inset-0 flex items-center justify-center text-center text-gray-500 no-data-message';
    noDataMessage.innerHTML = `<p class="text-lg font-medium">Status history not available</p>`;
    const ctx = document.getElementById('statusChart').getContext('2d');
    const chartContainer = ctx.canvas.parentElement;
    chartContainer.style.position = 'relative'; 
    chartContainer.appendChild(noDataMessage);
    return; // Exit
}

/**
 * Processes flow rate data for a specific day.
 * @param {string[]} timestamps - Array of ISO timestamp strings.
 * @param {number[]} flowValues - Array of flow rate values (L/min).
 * @param {number} selectedDay - 0 for Today, 1 for Yesterday, etc.
 * @returns {object} Object containing datasets for Chart.js and a noData flag.
 */
function processFlowByHour(timestamps, flowValues, selectedDay) {
    logToConsole('Processing flow data:', 'info');
    logToConsole(`Timestamps received: ${timestamps.length}`, 'info');
    logToConsole(`Flow values received: ${flowValues.length}`, 'info');
    logToConsole(`Selected day: ${selectedDay === 0 ? 'Today' : selectedDay === 1 ? 'Yesterday' : '2 Days Ago'}`, 'info');

    // Handle empty input case
    if (!timestamps || !flowValues || timestamps.length === 0 || flowValues.length === 0) {
        window.logToConsole('Empty input data for flow processing', 'warning');
        return { datasets: [], noData: true };
    }

    // --- Work with local dates for display --- 
    const now = new Date();
    // Get the start of today in local time zone
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    window.logToConsole(`Today in local time: ${todayStart.toLocaleString()}`, 'info');

    // Calculate the start of the target day in local time
    const dayStart = new Date(todayStart);
    dayStart.setDate(todayStart.getDate() - selectedDay);
    
    // Calculate the end of the target day in local time
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayStart.getDate() + 1);

    window.logToConsole(`Day ${selectedDay} boundaries (local): ${dayStart.toLocaleString()} to ${dayEnd.toLocaleString()}`, 'info');
    
    // Get current hour in local time for filtering today's future hours
    const currentHour = now.getHours();

    const hourlyData = {};
    let hasDataForDay = false;
    let allFlowsForDay = [];
    let lastFlowTime = null;
    let dataPointsProcessed = 0;
    let dataPointsForDay = 0;

    for (let i = 0; i < timestamps.length; i++) {
        const timestampStr = timestamps[i];
        const flow = flowValues[i];
        dataPointsProcessed++;
        
        // Skip invalid data points
        if (flow === null || flow === undefined || !timestampStr) {
            continue;
        }
        
        // Parse UTC timestamp and convert to local time
        const utcTimestamp = new Date(timestampStr);
        if (isNaN(utcTimestamp.getTime())) {
            window.logToConsole(`Invalid timestamp at index ${i}: ${timestampStr}`, 'warning');
            continue;
        }

        // Convert UTC to local time by adjusting for timezone offset
        const localTimestamp = new Date(utcTimestamp.getTime() + (utcTimestamp.getTimezoneOffset() * 60000));

        // Debug timestamp conversion
        if (i < 5 || i % 100 === 0) { // Log first 5 and every 100th
            window.logToConsole(`Flow timestamp ${i}: UTC=${timestampStr}, Local=${localTimestamp.toLocaleString()}`, 'info');
        }

        // Compare with local time boundaries using local timestamp
        const timestampMs = localTimestamp.getTime();
        const startMs = dayStart.getTime();
        const endMs = dayEnd.getTime();
        
        if (timestampMs < startMs || timestampMs >= endMs) {
            continue; // Skip if outside day boundaries
        }

        dataPointsForDay++;
        const localHour = localTimestamp.getHours();

        // For today (selectedDay === 0), only include hours up to current local hour
        if (selectedDay === 0 && localHour > currentHour) {
            continue;
        }
        
        hasDataForDay = true;
        allFlowsForDay.push(flow);
        if (flow > 0) { // Track time of last positive flow
            lastFlowTime = localTimestamp;
        }

        if (!hourlyData[localHour]) {
            hourlyData[localHour] = {
                flows: [],
                hour: localHour,
                date: localTimestamp
            };
        }
        
        hourlyData[localHour].flows.push(flow);
    }

    window.logToConsole(`Processed ${dataPointsProcessed} data points, found ${dataPointsForDay} for day ${selectedDay}`, 'info');
    window.logToConsole(`Valid flow readings for day ${selectedDay}: ${allFlowsForDay.length}`, 'info');

    if (!hasDataForDay) {
        return { datasets: [], noData: true };
    }

    // Create hourly averages
    const hourlyAverages = Array(24).fill(null);
    Object.values(hourlyData).forEach(hourData => {
        if (hourData.flows.length > 0) {
            const avgFlow = hourData.flows.reduce((a, b) => a + b, 0) / hourData.flows.length;
            hourlyAverages[hourData.hour] = avgFlow;
        }
    });

    // Create dataset
    const dayLabels = ['Today', 'Yesterday', '2 Days Ago'];
    const colors = [
        { border: 'rgb(34, 197, 94)', background: 'rgba(34, 197, 94, 0.1)' },
        { border: 'rgb(59, 130, 246)', background: 'rgba(59, 130, 246, 0.1)' },
        { border: 'rgb(168, 85, 247)', background: 'rgba(168, 85, 247, 0.1)' }
    ];

    const datasets = [{
        label: `Flow Rate (${dayLabels[selectedDay]})`,
        data: hourlyAverages,
        borderColor: colors[selectedDay].border,
        backgroundColor: colors[selectedDay].background,
        tension: 0.1,
        fill: true,
        pointRadius: 3,
        pointHoverRadius: 5
    }];

    // Create hour labels with AM/PM format
    const hourLabels = Array(24).fill().map((_, i) => {
        const hour = i % 12 || 12;
        const ampm = i < 12 ? 'AM' : 'PM';
        return `${hour}${ampm}`;
    });

    return {
        datasets,
        noData: false,
        hourLabels
    };
}


/**
 * Updates the flow rate chart with data for the selected days.
 * @param {number} deviceIdx - The index of the device.
 * @param {number} selectedDay - The day index (0=Today, 1=Yesterday, ...).
 */
async function updateFlowGraph(deviceIndex, selectedDay, timeSeriesData = null) {
    const device = window.lastDevicesData[deviceIndex];
    if (!device?.id) {
        logToConsole('No device found for index ' + deviceIndex, 'error');
        return;
    }

    // Clear device cache before updating
    clearDeviceCache(device.id);
    logToConsole('Cleared device cache for flow graph update', 'info');
    
    updateTimeRangeButtons('flow-time-range', selectedDay);
    
    // Get the stats container
    const statsContainer = document.getElementById('flowStats');

    // Hide or show stats based on number of selected days
    const selectedDays = Array.from(document.querySelectorAll('#flow-time-range button.active'))
        .map(btn => parseInt(btn.dataset.days));
    
    if (selectedDays.length > 1) {
        statsContainer.classList.add('opacity-50', 'pointer-events-none');
        // Clear stats when multiple days are selected
        document.getElementById('flowRange').textContent = '-';
        document.getElementById('flowTotal').textContent = '-';
        document.getElementById('flowStdDev').textContent = '-';
        document.getElementById('flowFrequency').textContent = '-';
    } else {
        statsContainer.classList.remove('opacity-50', 'pointer-events-none');
    }
    
    // If timeSeriesData is not provided, fetch it
    if (!timeSeriesData) {
        timeSeriesData = await fetchTimeSeriesData(device.id, 72); // Fetch 72 hours for consistency
    }

    if (!timeSeriesData || !timeSeriesData.flow || !timeSeriesData.flow.values) {
        logToConsole('No data returned from fetchTimeSeriesData or flow data missing', 'error');
        // Handle no data display (might need refinement based on overall structure)
        return;
    }

    // Process flow data for each selected day
    const allDatasets = [];
    let hasAnyData = false;
    let hourLabels = null; // Store hour labels from first valid day

    for (const day of selectedDays) {
        // Pass flow-specific timestamps and values
        const { datasets, noData, hourLabels: dayHourLabels } = processFlowByHour(
            timeSeriesData.flow.timestamps, 
            timeSeriesData.flow.values, 
            day
        );
        
        if (noData) {
            const dayLabel = day === 0 ? 'Today' : day === 1 ? 'Yesterday' : '2 Days Ago';
            logToConsole(`No flow data available for ${dayLabel}`, 'warning');
        } else {
            hasAnyData = true;
            allDatasets.push(...datasets);
            if (!hourLabels) {
                hourLabels = dayHourLabels; // Use hour labels from first valid day
            }
        }
    }

    // --- Chart Update/Creation ---
    const ctx = document.getElementById('flowChart').getContext('2d');
    const chartContainer = ctx.canvas.parentElement;

    // Remove any existing no-data message
    const existingMessage = chartContainer.querySelector('.no-data-message');
    if (existingMessage) {
        existingMessage.remove();
    }

    if (!hasAnyData) {
        logToConsole('No flow data available for any selected days.', 'warning');
        const noDataMessage = document.createElement('div');
        noDataMessage.className = 'absolute inset-0 flex items-center justify-center no-data-message';
        noDataMessage.innerHTML = `
            <div class="text-gray-500 text-center">
                <p class="text-lg font-medium">No flow rate data available</p>
                <p class="text-sm">for the selected time period${selectedDays.length > 1 ? 's' : ''}</p>
            </div>
        `;
        chartContainer.style.position = 'relative'; // Ensure container is positioned
        chartContainer.appendChild(noDataMessage);
        // If chart exists, clear its data
        if (charts.flowChart) {
            charts.flowChart.data.labels = [];
            charts.flowChart.data.datasets = [];
            charts.flowChart.update();
        }
        return; // Don't create or update the chart if no data
    }

    // If chart exists, update it; otherwise, create it
    if (charts.flowChart) {
        window.logToConsole('Updating existing flow chart', 'info');
        charts.flowChart.data.labels = hourLabels;
        charts.flowChart.data.datasets = allDatasets;
        charts.flowChart.update();
    } else {
        window.logToConsole('Creating new flow chart', 'info');
        charts.flowChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: hourLabels,
                datasets: allDatasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: {
                    duration: 300 // Faster animation for better responsiveness
                },
                interaction: {
                    mode: 'index',
                    intersect: false
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            title: (context) => {
                                const hour = context[0].label;
                                return `Time: ${hour}`;
                            },
                            label: (context) => {
                                const value = context.raw;
                                if (value === null) return `${context.dataset.label}: No data`;
                                return `Flow Rate: ${value?.toFixed(3) || 'No data'} L/min`;
                            }
                        },
                        titleAlign: 'center',
                        bodyAlign: 'left',
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        titleFont: { size: 13, weight: 'bold' },
                        bodyFont: { size: 12 },
                        padding: 12
                    },
                    legend: {
                        position: 'top',
                        labels: {
                            usePointStyle: true,
                            padding: 15
                        }
                    }
                },
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: 'Hour of Day'
                        },
                        grid: {
                            display: true,
                            drawOnChartArea: true
                        }
                    },
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Flow Rate (L/min)',
                            font: { size: 12 }
                        },
                        grid: {
                            display: true,
                            drawOnChartArea: true
                        },
                        ticks: {
                            callback: value => `${value.toFixed(1)} L/min`
                        }
                    }
                }
            }
        });
    }
}

/**
 * Updates the active state of time range buttons within a specific container.
 * @param {string} containerId - The ID of the container div holding the buttons.
 * @param {number|number[]} selectedValue - The currently selected day(s) (0, 1, or 2).
 */
function updateTimeRangeButtons(containerId, selectedValue) {
    const container = document.getElementById(containerId);
    if (!container) {
        window.logToConsole(`Button container not found: ${containerId}`, 'error');
        return;
    }
    const buttons = container.querySelectorAll('.time-range-button');
    const selectedValues = Array.isArray(selectedValue) ? selectedValue : [selectedValue]; // Ensure it's an array

    buttons.forEach(button => {
        const buttonValue = parseInt(button.dataset.days);
        if (selectedValues.includes(buttonValue)) {
            button.classList.add('active');
        } else {
            button.classList.remove('active');
        }
    });
}

// Expose necessary functions to the global scope
window.initializeGraphs = initializeGraphs;
window.toggleTempGraph = toggleTempGraph; // Also needed by button onclick
window.toggleIceLevel = toggleIceLevel;   // Also needed by checkbox onclick
window.toggleTempLine = toggleTempLine;     // Also needed by checkbox onclick
window.updateStatusGraph = updateStatusGraph; // Needed by button onclick
window.updateFlowGraph = updateFlowGraph;     // Needed by button onclick

// Note: processTemperatureByHour, processFlowByHour, fetchTimeSeriesData, etc.
// are internal helpers and don't need to be exposed on `window`.
// `updateTimeRangeButtons` is also internal. 

// Helper function to format milliseconds into h/m/s string
function formatDuration(ms) {
    if (ms === undefined || ms === null || isNaN(ms) || ms < 0) return '0s';
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    let result = '';
    if (hours > 0) result += `${hours}h `;
    if (minutes > 0 || hours > 0) result += `${minutes}m `;
    result += `${seconds}s`;
    return result.trim() || '0s';
}

// Helper function to fetch time series for a specific property (e.g., for future use)
async function fetchPropertyTimeSeries(deviceId, propertyName, hours) {
    try {
        // Use window.API_URL directly
        if (!window.API_URL) {
            throw new Error("API URL could not be retrieved for property fetch.");
        }
        const API_URL = window.API_URL;

        const now = new Date();
        const from = new Date(now.getTime() - hours * 60 * 60 * 1000);

        const device = window.lastDevicesData.find(d => d.id === deviceId);
        // Use deviceId directly
        if (!device || !device.thing) { 
            throw new Error("Device or Thing data not found");
        }

        const property = device.thing.properties.find(p => p.name === propertyName);
        if (!property || !property.id) {
             throw new Error(`Property '${propertyName}' not found or missing ID`);
        }

        // Use only from and to parameters
        const queryParams = new URLSearchParams({
            from: from.toISOString(),
            to: now.toISOString()
        }).toString();

        // Use the /api/iot/v2/devices/${deviceId}/properties/... endpoint structure
        const url = `${API_URL}/api/iot/v2/devices/${deviceId}/properties/${property.id}/timeseries?${queryParams}`;
        window.logToConsole(`Fetching raw time series for ${propertyName} from: ${url}`);

        const response = await fetch(url, {
            method: 'GET',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' }
        });

        if (!response.ok) {
            const errorText = await response.text().catch(() => `Status: ${response.status}`);
            throw new Error(`Fetch failed for ${propertyName}: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        // Expect {timestamps: [...], values: [...]} directly
        return { 
            timestamps: data.timestamps || [], 
            values: data.values || [] 
        }; 

    } catch (error) {
        window.logToConsole(`Error fetching raw time series for ${propertyName}: ${error.message}`, 'error');
        return { timestamps: [], values: [] }; 
    }
}

// Add global error handling? (Optional)
window.addEventListener('error', function(event) {
    window.logToConsole(`Unhandled Error: ${event.message} at ${event.filename}:${event.lineno}`, 'error');
});

window.addEventListener('unhandledrejection', function(event) {
    window.logToConsole(`Unhandled Promise Rejection: ${event.reason}`, 'error');
}); 