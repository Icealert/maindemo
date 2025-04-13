// Time Series Graph Logic for FreezeSense Dashboard

// Module-level variables
let timeSeriesDataCache = new Map();
let currentDeviceIndex; // Store the index of the device currently shown in the modal
let iceLevelVisible = true; // Default visibility state for ice level line
let tempLineVisible = true; // Default visibility state for temperature line
let charts = {}; // Store chart instances { tempChart: null, statusChart: null, flowChart: null }

/**
 * Parses the timestamp array from API response, handling potential inconsistencies.
 * @param {Array} arr - The raw array from the API.
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
        // Attempt to handle common nested structures like { data: [...] } or { values: [...] }
        if (Array.isArray(arr.data)) {
            window.logToConsole('parseTsArray trying arr.data', 'info');
            arr = arr.data;
        } else if (Array.isArray(arr.values)) {
             window.logToConsole('parseTsArray trying arr.values', 'info');
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
        const tempProperty = properties.find(p => p.name === 'cloudtemp');
        const flowProperty = properties.find(p => p.name === 'cloudflowrate');

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
            // interval: interval.toString(), // Let API determine default interval
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
            try {
                const tempResponse = await fetch(
                    `${API_URL}/api/proxy/timeseries/${thingId}/${tempProperty.id}?${queryParams}`,
                    fetchOptions
                );
                if (!tempResponse.ok) {
                    const errorText = await tempResponse.text();
                    throw new Error(`Temperature fetch failed: ${tempResponse.status} - ${errorText}`);
                }
                tempData = await tempResponse.json();
                window.logToConsole('Raw temperature response:', tempData, 'info');
            } catch (error) {
                logToConsole(`Error during temperature fetch: ${error.message}`, 'error');
                // Keep default empty tempData
            }
        }

        // 6) Fetch Flow Data Sequentially
        logToConsole('Fetching Flow Data...', 'info');
        let flowData = { data: [] }; // Default empty
        if (flowProperty) {
             try {
                const flowResponse = await fetch(
                    `${API_URL}/api/proxy/timeseries/${thingId}/${flowProperty.id}?${queryParams}`,
                    fetchOptions
                );
                if (!flowResponse.ok) {
                    const errorText = await flowResponse.text();
                    throw new Error(`Flow rate fetch failed: ${flowResponse.status} - ${errorText}`);
                }
                flowData = await flowResponse.json();
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
                    time: new Date(d.time).toLocaleString(),
                    value: d.value !== null ? `${d.value.toFixed(2)}°C (${((d.value * 9/5) + 32).toFixed(2)}°F)` : 'null'
                }))
            },
            flow: {
                total: flowData.data?.length || 0,
                sample: flowData.data?.slice(0, 5)?.map(d => ({
                    time: new Date(d.time).toLocaleString(),
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
                        time: new Date(tempResult.times[i]).toLocaleString(),
                        value: v !== null ? `${v.toFixed(2)}°C (${((v * 9/5) + 32).toFixed(2)}°F)` : 'null'
                    }))
                },
                flow: {
                    sample: flowResult.values.slice(0, 5).map((v, i) => ({
                        time: new Date(flowResult.times[i]).toLocaleString(),
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

    // --- Work with UTC dates for consistency --- 
    const now = new Date();
    const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    // Calculate the start of the target day in UTC
    const dayStartUtc = new Date(todayUtc);
    dayStartUtc.setUTCDate(todayUtc.getUTCDate() - selectedDay);
    // dayStartUtc is now 00:00:00 UTC of the target day

    // Calculate the end of the target day in UTC (start of the next day)
    const dayEndUtc = new Date(dayStartUtc);
    dayEndUtc.setUTCDate(dayStartUtc.getUTCDate() + 1);
    // dayEndUtc is now 00:00:00 UTC of the *next* day

    // Get current hour in UTC for filtering today's future hours
    const currentUtcHour = now.getUTCHours();
    // --- End UTC Date Setup ---

    const hourlyData = {};
    const device = window.lastDevicesData[currentDeviceIndex]; // Use module-level index
    const tempThresholdMaxC = device?.thing?.properties?.find(p => p.name === 'tempThresholdMax')?.last_value;
    const thresholdF = tempThresholdMaxC !== undefined ? celsiusToFahrenheit(tempThresholdMaxC) : 34; // Use global conversion
    const sensorPlacement = device?.thing?.properties?.find(p => p.name === 'sensorplacement')?.last_value || 0;
    const placementPercent = (sensorPlacement * 100).toFixed(0);

    let hasDataForDay = false;
    let allTempsForDayF = []; // Store temps in Fahrenheit for stats

    for (let i = 0; i < timestamps.length; i++) {
        const timestampStr = timestamps[i];
        const tempC = temperatures[i];

        // Skip invalid data points
        if (tempC === null || tempC === undefined || isNaN(tempC) || !timestampStr) continue;

        const timestamp = new Date(timestampStr); // Assume timestampStr is ISO/UTC

        // Compare timestamps directly with UTC boundaries
        if (timestamp.getTime() < dayStartUtc.getTime() || timestamp.getTime() >= dayEndUtc.getTime()) continue;

        const hourUtc = timestamp.getUTCHours(); // Get hour in UTC

        // For today (selectedDay === 0), only include hours up to the current UTC hour
        if (selectedDay === 0 && hourUtc > currentUtcHour) continue;

        hasDataForDay = true;
        const tempF = celsiusToFahrenheit(tempC); // Use global conversion
        allTempsForDayF.push(tempF);

        if (!hourlyData[hourUtc]) {
            hourlyData[hourUtc] = { tempsF: [], hour: hourUtc };
        }
        hourlyData[hourUtc].tempsF.push(tempF);
    }

    window.logToConsole(`Processed hourly temperature data for day ${selectedDay}:`, hourlyData);

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
         if (selectedDay === 0 && hour > currentUtcHour) continue; // Don't plot future hours for today

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


    return { datasets: finalDatasets, thresholdF, noData: false };
}

/**
 * Updates the temperature/ice level chart with data for the selected days.
 * @param {number} deviceIdx - The index of the device in window.lastDevicesData.
 * @param {number[]} selectedDays - Array of days to display (0=Today, 1=Yesterday, ...).
 */
async function updateTempGraph(deviceIdx, selectedDays) {
    currentDeviceIndex = deviceIdx; // Store index for helpers like formatTempValue

    if (!Array.isArray(selectedDays) || selectedDays.length === 0) {
        window.logToConsole('updateTempGraph called with invalid selectedDays', 'warning');
        selectedDays = [0]; // Default to today if invalid
    }
    selectedDays.sort((a,b) => a-b); // Ensure days are sorted

    // Manage stats display based on selection
    const statsContainer = document.getElementById('tempStats');
    if (statsContainer) {
        if (selectedDays.length > 1) {
            statsContainer.classList.add('opacity-50', 'pointer-events-none');
             // Clear stats when multiple days selected
             document.getElementById('tempRange').textContent = '-';
             document.getElementById('tempAvg').textContent = '-';
             document.getElementById('tempStdDev').textContent = '-';
             document.getElementById('tempMode').textContent = '-';
        } else {
            statsContainer.classList.remove('opacity-50', 'pointer-events-none');
            // Stats will be updated by processTemperatureByHour
        }
    }

    const device = window.lastDevicesData[deviceIdx];
    if (!device) {
        window.logToConsole('Device not found for temperature graph', 'error');
        return;
    }

    // Fetch data for the maximum required range (always 72 hours)
    const maxHours = 72; 
    window.logToConsole(`Fetching ${maxHours} hours of data for temperature graph.`, 'info');

    // --- Force fetch for debugging --- Remove cache clearing within updateTempGraph
    // const cacheKey = `${device.id}-${maxHours}`;
    // if (timeSeriesDataCache.has(cacheKey)) {
    //     window.logToConsole(`Clearing cache entry for key: ${cacheKey}`, 'info');
    //     timeSeriesDataCache.delete(cacheKey);
    // }
    // Fetching is now forced within fetchTimeSeriesData itself

    const timeSeriesData = await fetchTimeSeriesData(device.id, maxHours);

    // Use timeSeriesData.temperature
    if (!timeSeriesData || !timeSeriesData.temperature || !timeSeriesData.temperature.values) { 
        window.logToConsole('Failed to get time series data (or temperature data) for temp graph', 'error');
        // Optionally display an error on the chart canvas
        return;
    }

    // Process data for each selected day and accumulate datasets
    let combinedDatasets = [];
    let deviceThresholdF = 34; // Default
    let hasAnyData = false;
    let thresholdDatasetAdded = false; // Ensure threshold is added only once

    // Log the data just before processing loop
    window.logToConsole('Temp data before processing loop:', { 
        timestampsLength: timeSeriesData?.temperature?.timestamps?.length, 
        valuesLength: timeSeriesData?.temperature?.values?.length,
        selectedDays: selectedDays
    }, 'info');

    for (const day of selectedDays) {
         // Pass timeSeriesData.temperature.timestamps and .values
         const { datasets, thresholdF, noData } = processTemperatureByHour(
            timeSeriesData.temperature.timestamps, 
            timeSeriesData.temperature.values, 
            day
        );
         if (!noData) {
            hasAnyData = true;
            // Add threshold dataset only once
            const thresholdDs = datasets.find(ds => ds.label === 'Temperature Threshold');
            if (thresholdDs && !thresholdDatasetAdded) {
                combinedDatasets.push(thresholdDs);
                thresholdDatasetAdded = true;
            }
            // Add other datasets (temp, ice level)
            combinedDatasets.push(...datasets.filter(ds => ds.label !== 'Temperature Threshold'));
            deviceThresholdF = thresholdF; // Update threshold from processed data
         }
    }

     // Create hour labels (00:00 to 23:00)
    const hourLabels = Array.from({ length: 24 }, (_, i) => `${i.toString().padStart(2, '0')}:00`);

    const ctx = document.getElementById('tempChart').getContext('2d');
    const chartContainer = ctx.canvas.parentElement;

    // Remove previous 'no data' message if it exists
    const existingNoDataMsg = chartContainer.querySelector('.no-data-message');
    if (existingNoDataMsg) {
        existingNoDataMsg.remove();
    }


    if (!hasAnyData) {
         window.logToConsole('No temperature data available for selected days.', 'warning');
        // Display no data message centrally over the canvas area
        const noDataMessage = document.createElement('div');
        noDataMessage.className = 'absolute inset-0 flex items-center justify-center text-center text-gray-500 no-data-message';
        noDataMessage.innerHTML = `<p class="text-lg font-medium">No temperature data available</p><p class="text-sm">for the selected period</p>`;
        chartContainer.style.position = 'relative'; // Ensure container is positioned
        chartContainer.appendChild(noDataMessage);
        // If chart exists, clear its data
        if (charts.tempChart) {
            charts.tempChart.data.labels = [];
            charts.tempChart.data.datasets = [];
            charts.tempChart.update();
        }
         return; // Don't create or update the chart if no data
    }

    // If chart exists, update it; otherwise, create it
    if (charts.tempChart) {
        window.logToConsole('Updating existing temperature chart', 'info');
        charts.tempChart.data.labels = hourLabels;
        charts.tempChart.data.datasets = combinedDatasets;
        // Ensure axes visibility is updated based on current state
        charts.tempChart.options.scales['y-temp'].display = tempLineVisible;
        charts.tempChart.options.scales['y-ice'].display = iceLevelVisible;
        charts.tempChart.update();
    } else {
        window.logToConsole('Creating new temperature chart', 'info');
        charts.tempChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: hourLabels,
                datasets: combinedDatasets // Use the combined datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    tooltip: {
                        callbacks: {
                            title: (context) => `Hour: ${context[0].label}`,
                            label: (context) => {
                                const datasetLabel = context.dataset.label || '';
                                const value = context.raw;
                                if (value === null || value === undefined) return `${datasetLabel}: No data`;

                                 if (datasetLabel.includes('Ice Level')) {
                                    const device = window.lastDevicesData[currentDeviceIndex];
                                    const sensorPlacement = device?.thing?.properties?.find(p => p.name === 'sensorplacement')?.last_value || 0;
                                    const placementPercent = (sensorPlacement * 100).toFixed(0);
                                    return `Ice Level: ${value === 1 ? `> ${placementPercent}%` : `< ${placementPercent}%`} full`;
                                 } else if (datasetLabel === 'Temperature Threshold') {
                                    return `Threshold: ${value.toFixed(1)}°F`;
                                } else { // Must be Temperature
                                    return `Temp: ${value.toFixed(1)}°F`;
                                }
                            }
                        },
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        titleFont: { size: 13 }, bodyFont: { size: 12 }, padding: 10
                    },
                    legend: {
                        position: 'top',
                        labels: { usePointStyle: true, padding: 15, boxWidth: 10, font: { size: 11 } }
                    }
                },
                scales: {
                    x: {
                        title: { display: true, text: 'Hour of Day' },
                        grid: { drawOnChartArea: true, color: 'rgba(0,0,0,0.05)' }
                    },
                    'y-temp': {
                        type: 'linear',
                        display: tempLineVisible, // Conditionally display axis
                        position: 'left',
                        title: { display: true, text: 'Temperature (°F)' },
                        grid: { drawOnChartArea: true, color: 'rgba(0,0,0,0.05)' }, // Primary axis grid
                        ticks: { callback: value => `${value.toFixed(0)}°F` }
                    },
                    'y-ice': {
                        type: 'linear',
                        display: iceLevelVisible, // Conditionally display axis
                        position: 'right',
                        title: { display: true, text: 'Ice Level' },
                        min: -0.1, max: 1.1,
                        grid: { drawOnChartArea: false }, // No grid lines for secondary axis
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

    button.classList.toggle('active');

    // Get all newly active days
    const newActiveDays = Array.from(buttonContainer.querySelectorAll('button.active'))
        .map(btn => parseInt(btn.dataset.days));

    // Update the graph
    updateTempGraph(deviceIdx, newActiveDays);
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

    // --- Work with UTC dates for consistency --- 
    const now = new Date();
    const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    const dayStartUtc = new Date(todayUtc);
    dayStartUtc.setUTCDate(todayUtc.getUTCDate() - selectedDay);

    const dayEndUtc = new Date(dayStartUtc);
    dayEndUtc.setUTCDate(dayStartUtc.getUTCDate() + 1);

    const currentUtcHour = now.getUTCHours();
    // --- End UTC Date Setup ---

    const hourlyData = {};
    const device = window.lastDevicesData[currentDeviceIndex];
    const tempThresholdMaxC = device?.thing?.properties?.find(p => p.name === 'tempThresholdMax')?.last_value;
    const thresholdF = tempThresholdMaxC !== undefined ? celsiusToFahrenheit(tempThresholdMaxC) : 34; // Use global conversion
    const sensorPlacement = device?.thing?.properties?.find(p => p.name === 'sensorplacement')?.last_value || 0;
    const placementPercent = (sensorPlacement * 100).toFixed(0);

    let hasDataForDay = false;
    let allFlowsForDay = [];
    let lastFlowTime = null;

    // Process each flow reading
    for (let i = 0; i < timestamps.length; i++) {
        const timestampStr = timestamps[i];
        const flow = flowValues[i];
        
        // Skip invalid data points
        if (flow === null || flow === undefined || !timestampStr) continue;
        
        const timestamp = new Date(timestampStr); // Assume ISO/UTC

        // Compare timestamps directly with UTC boundaries
        if (timestamp.getTime() < dayStartUtc.getTime() || timestamp.getTime() >= dayEndUtc.getTime()) continue;
        
        const hourUtc = timestamp.getUTCHours(); // Get hour in UTC

        // For today (selectedDay === 0), only include hours up to the current UTC hour
        if (selectedDay === 0 && hourUtc > currentUtcHour) continue;
        
        hasDataForDay = true;
        allFlowsForDay.push(flow);
        if (flow > 0) { // Track time of last positive flow
            lastFlowTime = timestamp;
        }

        if (!hourlyData[hourUtc]) {
            hourlyData[hourUtc] = {
                flows: [],
                hour: hourUtc,
                date: timestamp // Store the actual Date object if needed later
            };
        }
        
        hourlyData[hourUtc].flows.push(flow);
    }

    // Update statistics if we have data
    const statsContainer = document.getElementById('flowStats');
    if (statsContainer && hasDataForDay) {
        // Calculate daily range
        const minFlow = Math.min(...allFlowsForDay);
        const maxFlow = Math.max(...allFlowsForDay);
        document.getElementById('flowRange').textContent = 
            `${minFlow.toFixed(3)} - ${maxFlow.toFixed(3)} L/min`;

        // Calculate total flow
        const totalFlow = allFlowsForDay.reduce((a, b) => a + b, 0);
        document.getElementById('flowTotal').textContent = 
            `${totalFlow.toFixed(3)} L/min`;

        // Calculate standard deviation
        const stdDev = calculateStdDev(allFlowsForDay);
        document.getElementById('flowStdDev').textContent = 
            `±${stdDev.toFixed(3)} L/min`;

        // Update frequency
        document.getElementById('flowFrequency').textContent = 
            `${allFlowsForDay.length} points`;

        // Update time since last flow if it's today
        if (selectedDay === 0 && allFlowsForDay.length > 0) {
            const timeSinceLastFlowEl = document.getElementById('timeSinceLastFlow');
            const timeSinceFlow = now - lastFlowTime;
            timeSinceLastFlowEl.textContent = formatTimeDuration(timeSinceFlow);
        } else if (statsContainer) {
            // Clear stats if no data
            document.getElementById('flowRange').textContent = '-';
            document.getElementById('flowTotal').textContent = '-';
            document.getElementById('flowStdDev').textContent = '-';
            document.getElementById('flowFrequency').textContent = '-';
            document.getElementById('timeSinceLastFlow').textContent = '-';
        }
    }

    // If no data for this day, return empty datasets
    if (!hasDataForDay) {
        return {
            datasets: [],
            noData: true
        };
    }

    // Create hourly averages
    const hourlyAverages = Array(24).fill(null);
    Object.values(hourlyData).forEach(hourData => {
        if (hourData.flows.length > 0) {
            const avgFlow = hourData.flows.reduce((a, b) => a + b, 0) / hourData.flows.length;
            hourlyAverages[hourData.hour] = avgFlow; // Use hourUtc stored in hourData.hour
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

    return {
        datasets,
        noData: false
    };
}


/**
 * Updates the flow rate chart with data for the selected days.
 * @param {number} deviceIdx - The index of the device.
 * @param {number} selectedDay - The day index (0=Today, 1=Yesterday, ...).
 */
async function updateFlowGraph(deviceIndex, selectedDay) {
            const device = window.lastDevicesData[deviceIndex];
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
            
            const timeSeriesData = await fetchTimeSeriesData(device.id, 72); // Fetch 72 hours for consistency

            if (!timeSeriesData || !timeSeriesData.flow || !timeSeriesData.flow.values) {
                logToConsole('No data returned from fetchTimeSeriesData or flow data missing', 'error');
                // Handle no data display (might need refinement based on overall structure)
                return;
            }

            // Process flow data for each selected day
            const allDatasets = [];
            let hasAnyData = false;

            for (const day of selectedDays) {
                // Pass flow-specific timestamps and values
                const { datasets, noData } = processFlowByHour(
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

            // Create hour labels (00:00 to 23:00)
            const hourLabels = Array.from({ length: 24 }, (_, i) => 
                `${i.toString().padStart(2, '0')}:00`
            );

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
                        interaction: {
                            mode: 'index',
                            intersect: false
                        },
                        plugins: {
                            tooltip: {
                                callbacks: {
                                    title: (context) => {
                                        const hour = parseInt(context[0].label);
                                        const nextHour = (hour + 1) % 24;
                                        return `Hour: ${hour}:00 - ${nextHour.toString().padStart(2, '0')}:00`;
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

/**
 * Initializes all graphs for a given device index, typically when the modal opens.
 * Defaults to showing 'Today's data.
 * @param {number} deviceIdx - The index of the device.
 */
function initializeGraphs(deviceIdx) {
     window.logToConsole(`Initializing graphs for device index: ${deviceIdx}`, 'info');
    currentDeviceIndex = deviceIdx; // Set the current device index

    // Clear the client-side cache
    timeSeriesDataCache.clear();
    window.logToConsole('Client-side time series cache cleared.', 'info');

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
    updateTimeRangeButtons('temp-time-range', 0); // For temp graph (multi-select handled separately)
    document.querySelectorAll('#temp-time-range button').forEach(btn => {
        if (parseInt(btn.dataset.days) === 0) btn.classList.add('active');
        else btn.classList.remove('active');
    });
    updateTimeRangeButtons('status-time-range', 0);
    updateTimeRangeButtons('flow-time-range', 0);

    // Initialize graphs with 'Today' data (day 0)
    updateTempGraph(deviceIdx, [0]); // Temp graph expects an array
    updateStatusGraph(deviceIdx, 0);
    updateFlowGraph(deviceIdx, 0);
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