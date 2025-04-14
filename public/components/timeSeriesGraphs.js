// Time Series Graph Logic for FreezeSense Dashboard

// Module-level variables
let timeSeriesDataCache = new Map();
let currentDeviceIndex; // Store the index of the device currently shown in the modal
let charts = {}; // Store chart instances { temperatureChart: null, flowChart: null }

// Add visibility state tracking
let graphVisibility = {
    temperature: true,
    iceLevel: true
};

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
            arr = arr.values;
        } else {
            window.logToConsole('parseTsArray received non-array input with unexpected structure.', arr, 'warning');
            return { times: [], values: [] };
        }
    } else if (arr !== null && arr !== undefined) {
        window.logToConsole('parseTsArray received unexpected non-array, non-object input:', arr, 'warning');
        return { times: [], values: [] };
    }
    
    if (!Array.isArray(arr)) {
        window.logToConsole('parseTsArray input is not a valid array after checks.', arr, 'warning');
        return { times: [], values: [] };
    }

    const result = {
        times: [],
        values: []
    };

    arr.forEach(obj => {
        if (obj && typeof obj === 'object') {
            const time = obj.time || obj.timestamp || obj.created_at || obj.date || null;
            const value = obj.hasOwnProperty('value') ? obj.value : 
                          obj.hasOwnProperty('data') ? obj.data : 
                          obj.hasOwnProperty('reading') ? obj.reading : null;
            
            result.times.push(time);
            result.values.push(value === undefined ? null : value);
        } else if (typeof obj === 'number') {
            result.times.push(null);
            result.values.push(obj);
        } else {
            window.logToConsole('parseTsArray found non-object element in array:', obj, 'warning');
            result.times.push(null);
            result.values.push(null);
        }
    });

    if (result.times.length !== result.values.length) {
        window.logToConsole('Array length mismatch in parseTsArray after processing', 'error');
    }

    window.logToConsole('parseTsArray Cleaned Result Sample:', result.times.slice(0, 3).map((t, i) => ({ time: t, value: result.values[i] })), 'info');

    return result;
}

async function fetchTimeSeriesData(deviceId, hours) {
    const cacheKey = `${deviceId}-${hours}`;
    
    if (timeSeriesDataCache.has(cacheKey)) {
        logToConsole('Using cached time series data', 'info');
        return timeSeriesDataCache.get(cacheKey);
    }

    logToConsole(`[DEBUG] Fetching new data for: ${cacheKey}`, 'info');
    
    try {
        const now = new Date();
        const from = new Date(now.getTime() - hours * 60 * 60 * 1000);

        const device = window.lastDevicesData.find(d => d.id === deviceId);
        const API_URL = window.API_URL; 
        if (!API_URL) {
             throw new Error("API URL is not available");
        }
        if (!device?.thing?.id) {
            throw new Error("Device or Thing not found");
        }
        const thingId = device.thing.id;
        const properties = device.thing.properties || [];

        let flowProperty = properties.find(p => p.name === 'cloudflowrate');
        let tempProperty = properties.find(p => p.name === 'cloudtemp');

        if (!flowProperty) {
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

        logToConsole(`Fetching time series data for thing ${thingId}:`, 'info');
        if (flowProperty) logToConsole(`Flow rate property ID: ${flowProperty.id} (${flowProperty.type})`, 'info');
        if (tempProperty) logToConsole(`Temperature property ID: ${tempProperty.id} (${tempProperty.type})`, 'info');

        const timeRangeSeconds = hours * 3600;
        const interval = Math.max(Math.ceil(timeRangeSeconds / 1000), 60);

        const fetchOptions = {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        };

        const queryParams = new URLSearchParams({
            interval: interval.toString(),
            from: from.toISOString(),
            to: now.toISOString(),
            desc: 'false'
        }).toString();

        logToConsole('Time series query parameters:', {
            interval,
            from: from.toLocaleString(),
            to: now.toLocaleString(),
            queryString: queryParams
        }, 'info');

        let flowData = { data: [] };
        let tempData = { data: [] };

        // Fetch flow data
        if (flowProperty) {
            const flowApiUrl = `${API_URL}/api/proxy/timeseries/${thingId}/${flowProperty.id}?${queryParams}`;
            logToConsole(`Attempting to fetch flow from: ${flowApiUrl}`, 'info');
            
            try {
                const flowResponse = await fetch(flowApiUrl, fetchOptions);
                
                if (!flowResponse.ok) {
                    const errorText = await flowResponse.text();
                    logToConsole(`Flow fetch failed: ${flowResponse.status} - ${errorText}`, 'warning');
                } else {
                    const responseText = await flowResponse.text();
                    logToConsole(`Flow response first 200 chars: ${responseText.substring(0, 200)}...`, 'info');
                    
                    try {
                        flowData = JSON.parse(responseText);
                    } catch (parseError) {
                        logToConsole(`Failed to parse flow JSON: ${parseError.message}`, 'error');
                    }
                }
                
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
            }
        }

        // Fetch temperature data
        if (tempProperty) {
            const tempApiUrl = `${API_URL}/api/proxy/timeseries/${thingId}/${tempProperty.id}?${queryParams}`;
            logToConsole(`Attempting to fetch temperature from: ${tempApiUrl}`, 'info');
            
            try {
                const tempResponse = await fetch(tempApiUrl, fetchOptions);
                
                if (!tempResponse.ok) {
                    const errorText = await tempResponse.text();
                    logToConsole(`Temperature fetch failed: ${tempResponse.status} - ${errorText}`, 'warning');
                } else {
                    const responseText = await tempResponse.text();
                    logToConsole(`Temperature response first 200 chars: ${responseText.substring(0, 200)}...`, 'info');
                    
                    try {
                        tempData = JSON.parse(responseText);
                    } catch (parseError) {
                        logToConsole(`Failed to parse temperature JSON: ${parseError.message}`, 'error');
                    }
                }
                
                if (!tempData.data && Array.isArray(tempData.timestamps) && Array.isArray(tempData.values)) {
                    logToConsole('Converting temperature timestamps/values format to data array format', 'info');
                    const length = Math.min(tempData.timestamps.length, tempData.values.length);
                    tempData.data = Array(length).fill().map((_, i) => ({
                        time: tempData.timestamps[i],
                        value: tempData.values[i]
                    }));
                }
                
                window.logToConsole('Raw temperature response:', tempData, 'info');
            } catch (error) {
                logToConsole(`Error during temperature fetch: ${error.message}`, 'error');
            }
        }
        
        const flowResult = parseTsArray(flowData.data || []);
        const tempResult = parseTsArray(tempData.data || []);

        const result = {
            flow: {
                timestamps: flowResult.times,
                values: flowResult.values
            },
            temperature: {
                timestamps: tempResult.times,
                values: tempResult.values
            }
        };

        timeSeriesDataCache.set(cacheKey, result);
        return result;
    } catch (error) {
        logToConsole(`Error fetching time series: ${error.message}`, 'error');
        return null;
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
    
    if (cacheKeysToRemove.length > 0) {
        cacheKeysToRemove.forEach(key => {
            logToConsole(`Clearing cache for device ${deviceId}: ${key}`, 'info');
            timeSeriesDataCache.delete(key);
        });
    }
}

/**
 * Handles time range button clicks for both temperature and flow graphs
 * @param {Event} event - The click event
 * @param {string} type - Either 'temperature' or 'flow'
 * @param {number} deviceIndex - The index of the device
 */
function handleTimeRangeClick(event, type, deviceIndex) {
    event.preventDefault();
    const button = event.target;
    
    // Toggle active state with Ctrl/Cmd key for multi-select
    if (event.ctrlKey || event.metaKey) {
        button.classList.toggle('active');
    } else {
        // Single select - deactivate all others
        const container = button.closest('.time-range-selector');
        container.querySelectorAll('.time-range-button').forEach(btn => {
            btn.classList.remove('active');
        });
        button.classList.add('active');
    }

    // Get all selected days
    const selectedDays = Array.from(
        button.closest('.time-range-selector').querySelectorAll('.time-range-button.active')
    ).map(btn => parseInt(btn.dataset.days));

    // If no days selected, select the clicked one
    if (selectedDays.length === 0) {
        button.classList.add('active');
        selectedDays.push(parseInt(button.dataset.days));
    }

    // Update the appropriate graph
    if (type === 'temperature') {
        updateTemperatureGraph(deviceIndex, selectedDays);
    } else if (type === 'flow') {
        updateFlowGraph(deviceIndex, selectedDays);
    }
}

function initializeGraphs(deviceIdx) {
    window.logToConsole(`Initializing graphs for device index: ${deviceIdx}`, 'info');
    currentDeviceIndex = deviceIdx;

    const device = window.lastDevicesData[deviceIdx];
    if (!device?.id) {
        logToConsole('No device found for index ' + deviceIdx, 'error');
        return;
    }

    clearDeviceCache(device.id);
    logToConsole('Cleared device cache for initialization', 'info');

    Object.values(charts).forEach(chart => chart?.destroy());
    charts = {};

    // Initialize with today selected
    document.querySelectorAll('#temperature-time-range .time-range-button[data-days="0"], #flow-time-range .time-range-button[data-days="0"]')
        .forEach(btn => btn.classList.add('active'));

    fetchTimeSeriesData(device.id, 72).then(data => {
        if (data) {
            updateTemperatureGraph(deviceIdx, [0], data);
            updateFlowGraph(deviceIdx, [0], data);
        }
    });

    // Reset visibility state
    graphVisibility = {
        temperature: true,
        iceLevel: true
    };

    // Reset checkbox states
    document.getElementById('showTemperature').checked = true;
    document.getElementById('showIceLevel').checked = true;
}

/**
 * Calculates the mode (most frequent value) from an array of numbers
 * @param {number[]} values - Array of numbers
 * @returns {number|null} The mode, or null if no mode exists
 */
function calculateMode(values) {
    if (!values || values.length === 0) return null;

    // Round values to 1 decimal place for more meaningful mode calculation
    const roundedValues = values.map(v => Math.round(v * 10) / 10);
    
    const frequency = {};
    let maxFreq = 0;
    let mode = null;

    roundedValues.forEach(value => {
        frequency[value] = (frequency[value] || 0) + 1;
        if (frequency[value] > maxFreq) {
            maxFreq = frequency[value];
            mode = value;
        }
    });

    // Only return mode if it occurs more than once
    return maxFreq > 1 ? mode : null;
}

/**
 * Calculates standard deviation for an array of numbers
 * @param {number[]} values - Array of numbers
 * @returns {number|null} The standard deviation, or null if insufficient data
 */
function calculateStdDev(values) {
    if (!values || values.length < 2) return null;

    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const squareDiffs = values.map(value => {
        const diff = value - mean;
        return diff * diff;
    });
    const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / squareDiffs.length;
    return Math.sqrt(avgSquareDiff);
}

/**
 * Calculates total flow volume for a given array of flow rates (L/min)
 * @param {number[]} flowRates - Array of flow rates in L/min
 * @param {number} intervalMinutes - Time interval between readings in minutes
 * @returns {number} Total flow volume in liters
 */
function calculateTotalFlow(flowRates, intervalMinutes) {
    if (!flowRates || flowRates.length === 0) return 0;
    // Each flow rate represents L/min, multiply by interval to get volume
    return flowRates.reduce((sum, rate) => sum + (rate * intervalMinutes), 0);
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

    // Calculate statistics for the day
    let stats = {
        min: null,
        max: null,
        total: null,
        stdDev: null
    };

    if (allFlowsForDay.length > 0) {
        // Basic statistics
        stats.min = Math.min(...allFlowsForDay);
        stats.max = Math.max(...allFlowsForDay);
        
        // Calculate total flow (assuming 1-minute intervals between readings)
        stats.total = calculateTotalFlow(allFlowsForDay, 1);
        
        // Calculate standard deviation
        stats.stdDev = calculateStdDev(allFlowsForDay);
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
        hourLabels,
        stats
    };
}

/**
 * Updates the flow rate chart with data for the selected days.
 * @param {number} deviceIdx - The index of the device.
 * @param {number} selectedDay - The day index (0=Today, 1=Yesterday, ...).
 */
async function updateFlowGraph(deviceIndex, selectedDays, timeSeriesData = null) {
    const device = window.lastDevicesData[deviceIndex];
    if (!device?.id) {
        logToConsole('No device found for index ' + deviceIndex, 'error');
        return;
    }

    updateTimeRangeButtons('flow-time-range', selectedDays);
    
    // Get the stats container
    const statsContainer = document.getElementById('flowStats');

    // Hide or show stats based on number of selected days
    if (selectedDays.length > 1) {
        statsContainer.classList.add('opacity-50', 'pointer-events-none');
        // Clear stats when multiple days are selected
        document.getElementById('flowRange').textContent = '-';
        document.getElementById('flowTotal').textContent = '-';
        document.getElementById('flowStdDev').textContent = '-';
    } else {
        statsContainer.classList.remove('opacity-50', 'pointer-events-none');
    }
    
    // If timeSeriesData is not provided, try to get from cache first
    if (!timeSeriesData) {
        const cacheKey = `${device.id}-72`;
        timeSeriesData = timeSeriesDataCache.get(cacheKey);
        
        // If not in cache, fetch it
        if (!timeSeriesData) {
            timeSeriesData = await fetchTimeSeriesData(device.id, 72);
        }
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
        const { datasets, noData, hourLabels: dayHourLabels, stats } = processFlowByHour(
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
                hourLabels = dayHourLabels;
            }

            // Update statistics display if single day selected
            if (selectedDays.length === 1 && stats) {
                // Daily Range
                document.getElementById('flowRange').textContent = 
                    stats.min !== null && stats.max !== null ? 
                    `${stats.min.toFixed(2)} - ${stats.max.toFixed(2)} L/min` : '-';

                // Total Flow
                document.getElementById('flowTotal').textContent = 
                    stats.total !== null ? 
                    `${stats.total.toFixed(1)} L` : '-';

                // Standard Deviation
                document.getElementById('flowStdDev').textContent = 
                    stats.stdDev !== null ? 
                    `±${stats.stdDev.toFixed(2)} L/min` : '-';
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
 * Processes temperature data for a specific day.
 * @param {string[]} timestamps - Array of ISO timestamp strings.
 * @param {number[]} tempValues - Array of temperature values (Celsius).
 * @param {number} selectedDay - 0 for Today, 1 for Yesterday, etc.
 * @returns {object} Object containing datasets for Chart.js and a noData flag.
 */
function processTemperatureByHour(timestamps, tempValues, selectedDay) {
    logToConsole('Processing temperature data:', 'info');
    logToConsole(`Timestamps received: ${timestamps.length}`, 'info');
    logToConsole(`Temperature values received: ${tempValues.length}`, 'info');
    logToConsole(`Selected day: ${selectedDay === 0 ? 'Today' : selectedDay === 1 ? 'Yesterday' : '2 Days Ago'}`, 'info');

    // Handle empty input case
    if (!timestamps || !tempValues || timestamps.length === 0 || tempValues.length === 0) {
        window.logToConsole('Empty input data for temperature processing', 'warning');
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
    let allTempsForDay = [];
    let dataPointsProcessed = 0;
    let dataPointsForDay = 0;

    for (let i = 0; i < timestamps.length; i++) {
        const timestampStr = timestamps[i];
        const temp = tempValues[i];
        dataPointsProcessed++;
        
        // Skip invalid data points
        if (temp === null || temp === undefined || !timestampStr) {
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
            window.logToConsole(`Temperature timestamp ${i}: UTC=${timestampStr}, Local=${localTimestamp.toLocaleString()}`, 'info');
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
        allTempsForDay.push(temp);

        if (!hourlyData[localHour]) {
            hourlyData[localHour] = {
                temps: [],
                hour: localHour,
                date: localTimestamp
            };
        }
        
        hourlyData[localHour].temps.push(temp);
    }

    window.logToConsole(`Processed ${dataPointsProcessed} data points, found ${dataPointsForDay} for day ${selectedDay}`, 'info');
    window.logToConsole(`Valid temperature readings for day ${selectedDay}: ${allTempsForDay.length}`, 'info');

    if (!hasDataForDay) {
        return { datasets: [], noData: true };
    }

    // Calculate statistics for the day
    let stats = {
        min: null,
        max: null,
        avg: null,
        stdDev: null,
        mode: null
    };

    if (allTempsForDay.length > 0) {
        // Convert all temperatures to Fahrenheit for statistics
        const tempsFahrenheit = allTempsForDay.map(temp => celsiusToFahrenheit(temp));
        
        stats.min = Math.min(...tempsFahrenheit);
        stats.max = Math.max(...tempsFahrenheit);
        stats.avg = tempsFahrenheit.reduce((a, b) => a + b, 0) / tempsFahrenheit.length;
        stats.stdDev = calculateStdDev(tempsFahrenheit);
        stats.mode = calculateMode(tempsFahrenheit);
    }

    // Create hourly averages
    const hourlyAverages = Array(24).fill(null);
    Object.values(hourlyData).forEach(hourData => {
        if (hourData.temps.length > 0) {
            const avgTemp = hourData.temps.reduce((a, b) => a + b, 0) / hourData.temps.length;
            hourlyAverages[hourData.hour] = avgTemp;
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
        label: `Temperature (${dayLabels[selectedDay]})`,
        data: hourlyAverages.map(temp => temp !== null ? celsiusToFahrenheit(temp) : null),
        borderColor: colors[selectedDay].border,
        backgroundColor: colors[selectedDay].background,
        tension: 0.1,
        fill: true,
        pointRadius: 3,
        pointHoverRadius: 5,
        yAxisID: 'y',
        hidden: !graphVisibility.temperature
    }];

    // Add ice level dataset
    const device = window.lastDevicesData[currentDeviceIndex];
    const sensorPlacement = device.thing?.properties?.find(p => p.name === 'sensorplacement')?.last_value;
    const tempThresholdMax = device.thing?.properties?.find(p => p.name === 'tempThresholdMax')?.last_value;

    if (sensorPlacement !== undefined && tempThresholdMax !== undefined) {
        const sensorPercentage = sensorPlacement * 100;
        const iceLevelData = hourlyAverages.map(temp => {
            if (temp === null) return null;
            return temp <= tempThresholdMax ? sensorPercentage + 10 : sensorPercentage - 10;
        });

        datasets.push({
            label: `Ice Level (${dayLabels[selectedDay]})`,
            data: iceLevelData,
            borderColor: 'rgba(59, 130, 246, 0.8)',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            borderDash: [5, 5],
            tension: 0.1,
            fill: false,
            pointRadius: 2,
            pointHoverRadius: 4,
            yAxisID: 'y1',
            hidden: !graphVisibility.iceLevel
        });
    }

    // Create hour labels with hour range format (e.g., "10:00-11:00 AM")
    const hourLabels = Array(24).fill().map((_, i) => {
        const startHour = i;
        const endHour = (i + 1) % 24;
        
        const formatHour = (hour) => {
            const h = hour % 12 || 12;
            const ampm = hour < 12 ? 'AM' : 'PM';
            return `${h.toString().padStart(2, '0')}:00 ${ampm}`;
        };
        
        return `${formatHour(startHour)}–${formatHour(endHour)}`;
    });

    return {
        datasets,
        noData: false,
        hourLabels,
        stats
    };
}

/**
 * Updates the temperature chart with data for the selected days.
 * @param {number} deviceIdx - The index of the device.
 * @param {number} selectedDay - The day index (0=Today, 1=Yesterday, ...).
 */
async function updateTemperatureGraph(deviceIndex, selectedDays, timeSeriesData = null) {
    const device = window.lastDevicesData[deviceIndex];
    if (!device?.id) {
        logToConsole('No device found for index ' + deviceIndex, 'error');
        return;
    }

    updateTimeRangeButtons('temperature-time-range', selectedDays);
    
    // Get the stats container
    const statsContainer = document.getElementById('temperatureStats');

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
    
    // If timeSeriesData is not provided, try to get from cache first
    if (!timeSeriesData) {
        const cacheKey = `${device.id}-72`;
        timeSeriesData = timeSeriesDataCache.get(cacheKey);
        
        // If not in cache, fetch it
        if (!timeSeriesData) {
            timeSeriesData = await fetchTimeSeriesData(device.id, 72);
        }
    }

    if (!timeSeriesData || !timeSeriesData.temperature || !timeSeriesData.temperature.values) {
        logToConsole('No data returned from fetchTimeSeriesData or temperature data missing', 'error');
        return;
    }

    // Process temperature data for each selected day
    const allDatasets = [];
    let hasAnyData = false;
    let hourLabels = null; // Store hour labels from first valid day

    for (const day of selectedDays) {
        // Pass temperature-specific timestamps and values
        const { datasets, noData, hourLabels: dayHourLabels, stats } = processTemperatureByHour(
            timeSeriesData.temperature.timestamps, 
            timeSeriesData.temperature.values, 
            day
        );
        
        if (noData) {
            const dayLabel = day === 0 ? 'Today' : day === 1 ? 'Yesterday' : '2 Days Ago';
            logToConsole(`No temperature data available for ${dayLabel}`, 'warning');
        } else {
            hasAnyData = true;
            allDatasets.push(...datasets);
            if (!hourLabels) {
                hourLabels = dayHourLabels;
            }
            
            // Update statistics display if single day selected
            if (selectedDays.length === 1) {
                if (stats) {
                    document.getElementById('tempRange').textContent = 
                        stats.min !== null && stats.max !== null ? 
                        `${stats.min.toFixed(1)}°F - ${stats.max.toFixed(1)}°F` : '-';
                    
                    document.getElementById('tempAvg').textContent = 
                        stats.avg !== null ? 
                        `${stats.avg.toFixed(1)}°F` : '-';
                    
                    document.getElementById('tempStdDev').textContent = 
                        stats.stdDev !== null ? 
                        `±${stats.stdDev.toFixed(1)}°F` : '-';
                    
                    document.getElementById('tempMode').textContent = 
                        stats.mode !== null ? 
                        `${stats.mode.toFixed(1)}°F` : 'No mode';
                } else {
                    document.getElementById('tempRange').textContent = '-';
                    document.getElementById('tempAvg').textContent = '-';
                    document.getElementById('tempStdDev').textContent = '-';
                    document.getElementById('tempMode').textContent = '-';
                }
            }
        }
    }

    // --- Chart Update/Creation ---
    const ctx = document.getElementById('temperatureChart').getContext('2d');
    const chartContainer = ctx.canvas.parentElement;

    // Remove any existing no-data message
    const existingMessage = chartContainer.querySelector('.no-data-message');
    if (existingMessage) {
        existingMessage.remove();
    }

    if (!hasAnyData) {
        logToConsole('No temperature data available for any selected days.', 'warning');
        const noDataMessage = document.createElement('div');
        noDataMessage.className = 'absolute inset-0 flex items-center justify-center no-data-message';
        noDataMessage.innerHTML = `
            <div class="text-gray-500 text-center">
                <p class="text-lg font-medium">No temperature data available</p>
                <p class="text-sm">for the selected time period${selectedDays.length > 1 ? 's' : ''}</p>
            </div>
        `;
        chartContainer.style.position = 'relative'; // Ensure container is positioned
        chartContainer.appendChild(noDataMessage);
        // If chart exists, clear its data
        if (charts.temperatureChart) {
            charts.temperatureChart.data.labels = [];
            charts.temperatureChart.data.datasets = [];
            charts.temperatureChart.update();
        }
        return; // Don't create or update the chart if no data
    }

    // If chart exists, update it; otherwise, create it
    if (charts.temperatureChart) {
        window.logToConsole('Updating existing temperature chart', 'info');
        charts.temperatureChart.data.labels = hourLabels;
        charts.temperatureChart.data.datasets = allDatasets;
        charts.temperatureChart.update();
    } else {
        window.logToConsole('Creating new temperature chart', 'info');
        
        // Get sensor placement for y-axis configuration
        const device = window.lastDevicesData[deviceIndex];
        const sensorPlacement = device.thing?.properties?.find(p => p.name === 'sensorplacement')?.last_value;
        const sensorPercentage = sensorPlacement ? sensorPlacement * 100 : 50; // Default to 50% if not set

        charts.temperatureChart = new Chart(ctx, {
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
                            title: (context) => {
                                const timeRange = context[0].label;
                                return `Time Range: ${timeRange}`;
                            },
                            label: (context) => {
                                const value = context.raw;
                                if (value === null) return `${context.dataset.label}: No data`;
                                
                                if (context.dataset.yAxisID === 'y') {
                                    return `Temperature: ${value?.toFixed(1) || 'No data'}°F`;
                                } else {
                                    // For ice level, show "more than X%" or "less than X%"
                                    const sensorPercentage = (sensorPlacement * 100).toFixed(0);
                                    return value > sensorPercentage ? 
                                        `Ice Level: More than ${sensorPercentage}%` : 
                                        `Ice Level: Less than ${sensorPercentage}%`;
                                }
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
                            padding: 15,
                            generateLabels: (chart) => {
                                const defaultLabels = Chart.defaults.plugins.legend.labels.generateLabels(chart);
                                
                                // Add custom label for hourly average explanation
                                defaultLabels.push({
                                    text: 'Each point shows the average temperature and estimated ice level relative to sensor placement',
                                    fillStyle: 'transparent',
                                    strokeStyle: 'transparent',
                                    lineWidth: 0,
                                    fontStyle: 'italic',
                                    fontColor: '#6B7280'
                                });
                                
                                return defaultLabels;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: 'Time Range (Hourly Intervals)',
                            font: { size: 12 }
                        },
                        grid: {
                            display: true,
                            drawOnChartArea: true
                        },
                        ticks: {
                            maxRotation: 45,
                            minRotation: 45,
                            callback: function(value, index) {
                                const fullLabel = this.getLabelForValue(value);
                                const [start] = fullLabel.split('–');
                                return start;
                            }
                        }
                    },
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        title: {
                            display: true,
                            text: 'Temperature (°F)',
                            font: { size: 12 }
                        },
                        grid: {
                            display: true,
                            drawOnChartArea: true
                        },
                        ticks: {
                            callback: value => `${value.toFixed(1)}°F`
                        }
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        title: {
                            display: true,
                            text: 'Ice Level',
                            font: { size: 12 }
                        },
                        min: Math.max(0, sensorPercentage - 20),  // Show range around sensor placement
                        max: Math.min(100, sensorPercentage + 20),
                        grid: {
                            display: false
                        },
                        ticks: {
                            // Custom ticks to show only "More than X%" and "Less than X%"
                            callback: function(value) {
                                if (value === sensorPercentage + 10) return `More than ${sensorPercentage.toFixed(0)}%`;
                                if (value === sensorPercentage - 10) return `Less than ${sensorPercentage.toFixed(0)}%`;
                                return '';  // Hide other tick labels
                            },
                            count: 2  // Only show two ticks
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

/**
 * Handles visibility toggle for temperature and ice level lines
 * @param {string} type - Either 'temperature' or 'iceLevel'
 * @param {number} deviceIndex - The index of the device
 */
function handleVisibilityToggle(type, deviceIndex) {
    const checkbox = document.getElementById(`show${type.charAt(0).toUpperCase() + type.slice(1)}`);
    graphVisibility[type] = checkbox.checked;

    // Update chart visibility
    if (charts.temperatureChart) {
        if (type === 'temperature') {
            // Temperature is always the first dataset
            charts.temperatureChart.data.datasets[0].hidden = !graphVisibility.temperature;
        } else {
            // Ice level is always the second dataset if it exists
            if (charts.temperatureChart.data.datasets.length > 1) {
                charts.temperatureChart.data.datasets[1].hidden = !graphVisibility.iceLevel;
            }
        }
        charts.temperatureChart.update();
    }

    // Update y-axis visibility
    if (charts.temperatureChart) {
        const options = charts.temperatureChart.options;
        if (type === 'temperature') {
            options.scales.y.display = graphVisibility.temperature;
        } else {
            options.scales.y1.display = graphVisibility.iceLevel;
        }
        charts.temperatureChart.update('none'); // Update without animation
    }
}

// Expose necessary functions to the global scope
window.initializeGraphs = initializeGraphs;
window.updateTemperatureGraph = updateTemperatureGraph;
window.updateFlowGraph = updateFlowGraph;
window.handleTimeRangeClick = handleTimeRangeClick;
window.handleVisibilityToggle = handleVisibilityToggle;

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

// Add global error handling
window.addEventListener('error', function(event) {
    window.logToConsole(`Unhandled Error: ${event.message} at ${event.filename}:${event.lineno}`, 'error');
});

window.addEventListener('unhandledrejection', function(event) {
    window.logToConsole(`Unhandled Promise Rejection: ${event.reason}`, 'error');
}); 