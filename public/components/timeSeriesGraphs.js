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
    window.logToConsole('parseTsArray raw input:', {
        isArray: Array.isArray(arr),
        length: arr?.length || 0,
        sample: arr?.slice(0, 3),
        type: typeof arr
    }, 'info');

    if (!Array.isArray(arr)) {
        window.logToConsole('parseTsArray received non-array input:', arr, 'warning');
        return { times: [], values: [] };
    }

    const result = {
        times: arr.map(obj => obj.time || obj.timestamp || obj.created_at || obj.date),
        values: arr.map(obj => obj.hasOwnProperty('value') ? obj.value : obj.hasOwnProperty('data') ? obj.data : obj.hasOwnProperty('reading') ? obj.reading : null)
    };

    if (result.times.length !== result.values.length) {
        window.logToConsole('Array length mismatch in parseTsArray', 'error');
    }

    // Remove entries where time or value is missing
    const validIndices = result.times.map((time, i) =>
        time && result.values[i] !== undefined && result.values[i] !== null ? i : -1
    ).filter(i => i !== -1);

    const cleanResult = {
        times: validIndices.map(i => result.times[i]),
        values: validIndices.map(i => result.values[i])
    };

     window.logToConsole('parseTsArray processed result:', {
        originalLength: arr.length,
        validLength: cleanResult.times.length,
        sample: validIndices.slice(0, 3).map(i => ({
            time: new Date(cleanResult.times[i]).toLocaleString(),
            value: cleanResult.values[i]
        }))
    }, 'info');


    return cleanResult;
}

/**
 * Fetches time series data for temperature and flow rate for a specific device.
 * Caches results to avoid redundant API calls.
 * @param {string} deviceId - The ID of the device.
 * @param {number} hours - The number of hours of data to fetch.
 * @returns {Promise<object|null>} A promise resolving to an object containing timestamps and corresponding data arrays, or null on error.
 */
async function fetchTimeSeriesData(deviceId, hours) {
    const cacheKey = `${deviceId}-${hours}`;
    if (timeSeriesDataCache.has(cacheKey)) {
        window.logToConsole('Using cached time series data', 'info');
        return timeSeriesDataCache.get(cacheKey);
    }

    try {
        const now = new Date();
        const from = new Date(now - hours * 60 * 60 * 1000);
        const device = window.lastDevicesData.find(d => d.id === deviceId);
        if (!device?.thing?.id) {
            throw new Error("Device or Thing not found");
        }
        const thingId = device.thing.id;
        const properties = device.thing.properties || [];

        const tempProperty = properties.find(p => p.name === 'cloudtemp');
        const flowProperty = properties.find(p => p.name === 'cloudflowrate');
        const warningProperty = properties.find(p => p.name === 'warning');
        const criticalProperty = properties.find(p => p.name === 'critical');


        window.logToConsole(`Fetching time series data for thing ${thingId} (${hours} hours):`, 'info');

        const timeRangeSeconds = hours * 3600;
        const interval = Math.max(Math.ceil(timeRangeSeconds / 1000), 60); // Min interval 60s

        const fetchOptions = {
            method: 'GET',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' }
        };

        const queryParams = new URLSearchParams({
            interval: interval.toString(),
            from: from.toISOString(),
            to: now.toISOString(),
            aggregation: 'AVG', // Use AVG for numerical data
            desc: 'false'
        }).toString();

        // Use LAST aggregation for status properties
        const statusQueryParams = new URLSearchParams({
            interval: interval.toString(),
            from: from.toISOString(),
            to: now.toISOString(),
            aggregation: 'LAST', // Use LAST for status changes
            desc: 'false'
        }).toString();

        // Fetch numerical data (temp, flow)
         const fetchData = async (property) => {
            if (!property) return Promise.resolve({ data: [] });
            const url = `${window.API_URL}/api/proxy/timeseries/${thingId}/${property.id}?${queryParams}`;
            window.logToConsole(`Fetching ${property.name} data from: ${url}`);
            return fetch(url, fetchOptions).then(async res => {
                if (!res.ok) {
                    const errorText = await res.text();
                    throw new Error(`${property.name} fetch failed: ${res.status} - ${errorText}`);
                }
                return res.json();
            });
        };

        // Fetch status data (warning, critical) - needs different aggregation
        const fetchStatusData = async (property) => {
            if (!property) return Promise.resolve({ data: [] });
            const url = `${window.API_URL}/api/proxy/timeseries/${thingId}/${property.id}?${statusQueryParams}`;
             window.logToConsole(`Fetching ${property.name} status data from: ${url}`);
            return fetch(url, fetchOptions).then(async res => {
                if (!res.ok) {
                    const errorText = await res.text();
                    throw new Error(`${property.name} status fetch failed: ${res.status} - ${errorText}`);
                }
                return res.json();
            });
        };


        const [tempData, flowData, warningData, criticalData] = await Promise.all([
            fetchData(tempProperty),
            fetchData(flowProperty),
            fetchStatusData(warningProperty),
            fetchStatusData(criticalProperty)
        ]);

         window.logToConsole('Raw API Responses:', { tempData, flowData, warningData, criticalData }, 'info');

        // Process numerical data
        const tempResult = parseTsArray(tempData.data || []);
        const flowResult = parseTsArray(flowData.data || []);

        // Process status data - Convert 'true'/'false' strings or booleans to 1/0
        const processStatus = (statusRawData) => {
            const parsed = parseTsArray(statusRawData.data || []);
            parsed.values = parsed.values.map(val => (val === true || String(val).toLowerCase() === 'true') ? 1 : 0);
            return parsed;
        };
        const warningResult = processStatus(warningData);
        const criticalResult = processStatus(criticalData);


        // Align data - Find common timestamps or the most frequent source
        // For simplicity, we'll use temperature timestamps as the primary source if available
        const primaryTimestamps = tempResult.times.length ? tempResult.times : flowResult.times.length ? flowResult.times : warningResult.times.length ? warningResult.times : criticalResult.times;

        // Function to get value at a specific time (or nearest within tolerance)
        const getValueAtTime = (time, dataResult) => {
            const tolerance = interval * 1000 / 2; // +/- half interval
            const targetTime = new Date(time).getTime();
            let closestValue = null;
            let minDiff = Infinity;

            for (let i = 0; i < dataResult.times.length; i++) {
                 const dataTime = new Date(dataResult.times[i]).getTime();
                 const diff = Math.abs(targetTime - dataTime);
                 if (diff <= tolerance && diff < minDiff) {
                     minDiff = diff;
                     closestValue = dataResult.values[i];
                 }
            }
            return closestValue;
        };


        // Build aligned result
        const alignedResult = {
            timestamps: primaryTimestamps,
            temperature: primaryTimestamps.map(t => getValueAtTime(t, tempResult)),
            flowRate: primaryTimestamps.map(t => getValueAtTime(t, flowResult)),
            warningStatus: primaryTimestamps.map(t => getValueAtTime(t, warningResult)),
            criticalStatus: primaryTimestamps.map(t => getValueAtTime(t, criticalResult)),
        };

        window.logToConsole('Processed & Aligned Time Series Data:', {
            points: alignedResult.timestamps.length,
            sample: alignedResult.timestamps.slice(0, 5).map((t, i) => ({
                time: new Date(t).toLocaleString(),
                temp: alignedResult.temperature[i],
                flow: alignedResult.flowRate[i],
                warning: alignedResult.warningStatus[i],
                critical: alignedResult.criticalStatus[i]
            }))
        });

        // Cache the result
        timeSeriesDataCache.set(cacheKey, alignedResult);
        return alignedResult;

    } catch (error) {
        window.logToConsole(`Error fetching time series: ${error.message}`, 'error');
        window.showError(`Failed to load graph data: ${error.message}`);
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


    const hourlyData = {};
    const now = new Date();
    const currentHour = now.getHours();

    const dayStart = new Date(now);
    dayStart.setDate(dayStart.getDate() - selectedDay);
    dayStart.setHours(0, 0, 0, 0);

    const dayEnd = new Date(dayStart);
    dayEnd.setHours(23, 59, 59, 999);

    const device = window.lastDevicesData[currentDeviceIndex]; // Use module-level index
    const tempThresholdMaxC = device?.thing?.properties?.find(p => p.name === 'tempThresholdMax')?.last_value;
    const thresholdF = tempThresholdMaxC !== undefined ? celsiusToFahrenheit(tempThresholdMaxC) : 34; // Use global conversion
    const sensorPlacement = device?.thing?.properties?.find(p => p.name === 'sensorplacement')?.last_value || 0;
    const placementPercent = (sensorPlacement * 100).toFixed(0);


    let hasDataForDay = false;
    let allTempsForDayF = []; // Store temps in Fahrenheit for stats

    for (let i = 0; i < timestamps.length; i++) {
        const timestamp = new Date(timestamps[i]);
        const tempC = temperatures[i];

        if (tempC === null || tempC === undefined || isNaN(tempC)) continue;
        if (timestamp < dayStart || timestamp > dayEnd) continue;

        const hour = timestamp.getHours();
        // For today, only include hours up to the current hour
        if (selectedDay === 0 && hour > currentHour) continue;

        hasDataForDay = true;
        const tempF = celsiusToFahrenheit(tempC); // Use global conversion
        allTempsForDayF.push(tempF);


        if (!hourlyData[hour]) {
            hourlyData[hour] = { tempsF: [], hour };
        }
        hourlyData[hour].tempsF.push(tempF);
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

    // Fetch data for the maximum required range (e.g., 72 hours if max day is 2)
    const maxHours = (Math.max(...selectedDays) + 1) * 24;
    const timeSeriesData = await fetchTimeSeriesData(device.id, maxHours);

    if (!timeSeriesData) {
        window.logToConsole('Failed to get time series data for temp graph', 'error');
        // Optionally display an error on the chart canvas
        return;
    }

    // Destroy existing chart
    if (charts.tempChart) {
        charts.tempChart.destroy();
        charts.tempChart = null;
    }

    // Process data for each selected day and accumulate datasets
    let combinedDatasets = [];
    let deviceThresholdF = 34; // Default
    let hasAnyData = false;
    let thresholdDatasetAdded = false; // Ensure threshold is added only once


    for (const day of selectedDays) {
         const { datasets, thresholdF, noData } = processTemperatureByHour(timeSeriesData.timestamps, timeSeriesData.temperature, day);
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
         return; // Don't create the chart if no data
    }

    // --- Create Chart ---
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

    const maxHours = (selectedDay + 1) * 24;
    const timeSeriesData = await fetchTimeSeriesData(device.id, maxHours);

    if (!timeSeriesData) {
        window.logToConsole('Failed to get time series data for status graph', 'error');
        return;
    }

    // Destroy existing chart
    if (charts.statusChart) {
        charts.statusChart.destroy();
        charts.statusChart = null;
    }

    const now = new Date();
    const dayStart = new Date(now);
    dayStart.setDate(dayStart.getDate() - selectedDay);
    dayStart.setHours(0, 0, 0, 0);

    const dayEnd = new Date(dayStart);
    dayEnd.setHours(23, 59, 59, 999);
    const displayEndTime = selectedDay === 0 ? now : dayEnd; // Use current time for today's end


    // Filter data for the selected day
    const dayDataPoints = [];
    for (let i = 0; i < timeSeriesData.timestamps.length; i++) {
        const timestamp = new Date(timeSeriesData.timestamps[i]);
         if (timestamp >= dayStart && timestamp <= displayEndTime) {
            dayDataPoints.push({
                timestamp: timestamp,
                // Ensure values are 0 or 1, handle nulls
                warning: timeSeriesData.warningStatus[i] === 1 ? 1 : 0,
                critical: timeSeriesData.criticalStatus[i] === 1 ? 1 : 0,
            });
        }
    }

    // Sort just in case API/processing order wasn't perfect
    dayDataPoints.sort((a, b) => a.timestamp - b.timestamp);

    // Ensure first point is at dayStart and last is at displayEndTime
    if (dayDataPoints.length > 0) {
        // Add start point if needed
        if (dayDataPoints[0].timestamp > dayStart) {
            // Find the status just before the first point or assume 'great'
             let initialWarning = 0;
             let initialCritical = 0;
             const idxBefore = timeSeriesData.timestamps.findIndex(t => new Date(t) >= dayStart);
             if (idxBefore > 0) {
                initialWarning = timeSeriesData.warningStatus[idxBefore - 1] === 1 ? 1 : 0;
                initialCritical = timeSeriesData.criticalStatus[idxBefore - 1] === 1 ? 1 : 0;
             }
            dayDataPoints.unshift({ timestamp: dayStart, warning: initialWarning, critical: initialCritical });
        }
        // Add end point if needed
        if (dayDataPoints[dayDataPoints.length - 1].timestamp < displayEndTime) {
            dayDataPoints.push({
                timestamp: displayEndTime,
                warning: dayDataPoints[dayDataPoints.length - 1].warning,
                critical: dayDataPoints[dayDataPoints.length - 1].critical
            });
        }
    } else {
        // If no data points for the day, create a single 'great' state for the whole period
         // Need to determine status at start of day
         let initialWarning = 0;
         let initialCritical = 0;
         const idxBefore = timeSeriesData.timestamps.findIndex(t => new Date(t) >= dayStart);
         if (idxBefore > 0) {
            initialWarning = timeSeriesData.warningStatus[idxBefore - 1] === 1 ? 1 : 0;
            initialCritical = timeSeriesData.criticalStatus[idxBefore - 1] === 1 ? 1 : 0;
         } else if (timeSeriesData.timestamps.length > 0) {
             // If no point before, use the very first status available if any
             initialWarning = timeSeriesData.warningStatus[0] === 1 ? 1 : 0;
             initialCritical = timeSeriesData.criticalStatus[0] === 1 ? 1 : 0;
         }
        dayDataPoints.push({ timestamp: dayStart, warning: initialWarning, critical: initialCritical });
        dayDataPoints.push({ timestamp: displayEndTime, warning: initialWarning, critical: initialCritical });
    }


     window.logToConsole(`Processed ${dayDataPoints.length} status points for day ${selectedDay}`, 'info');

    const labels = dayDataPoints.map(d => d.timestamp); // Use actual timestamps for labels

    const datasets = [
        {
            label: 'Critical', // Order: Critical > Warning > Great
            data: dayDataPoints.map(d => ({ x: d.timestamp, y: d.critical })),
            borderColor: 'rgb(239, 68, 68)',
            backgroundColor: 'rgba(239, 68, 68, 0.3)',
            fill: true, // Fill down to zero
            stepped: 'before', // Show state duration correctly
            pointRadius: 0,
            order: 1
        },
        {
            label: 'Warning',
             // Only show warning if not critical
            data: dayDataPoints.map(d => ({ x: d.timestamp, y: d.critical ? 0 : d.warning })),
            borderColor: 'rgb(234, 179, 8)',
            backgroundColor: 'rgba(234, 179, 8, 0.3)',
            fill: true,
            stepped: 'before',
            pointRadius: 0,
            order: 2
        },
        {
            label: 'Great',
            // Show great only if not critical or warning
            data: dayDataPoints.map(d => ({ x: d.timestamp, y: (d.critical || d.warning) ? 0 : 1 })),
            borderColor: 'rgb(16, 185, 129)',
            backgroundColor: 'rgba(16, 185, 129, 0.3)',
            fill: true,
            stepped: 'before',
            pointRadius: 0,
            order: 3
        }
    ];

    const ctx = document.getElementById('statusChart').getContext('2d');
    charts.statusChart = new Chart(ctx, {
        type: 'line',
        data: {
            // Labels are not directly used with time scale, but can be useful
            // labels: labels.map(t => t.toLocaleTimeString()),
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'nearest', axis: 'x', intersect: false },
            plugins: {
                tooltip: {
                    callbacks: {
                        title: (context) => {
                             // Get time from the first dataset's point
                            const point = context[0].element;
                            if (point && point.x) {
                                return new Date(point.x).toLocaleString();
                            }
                            return '';
                        },
                        label: (context) => {
                             // Determine the status based on which dataset has y=1 at this point
                            const time = context.chart.scales.x.getValueForPixel(context.chart.tooltip.x);
                            let status = 'Great'; // Default
                             // Check datasets in order: Critical, Warning
                             const critData = context.chart.data.datasets[0].data;
                             const warnData = context.chart.data.datasets[1].data;

                            // Find the data point at or just before the tooltip time
                            let pointCrit = null, pointWarn = null;
                             for(let i = critData.length - 1; i >= 0; i--) {
                                 if(critData[i].x <= time) { pointCrit = critData[i]; break; }
                             }
                             for(let i = warnData.length - 1; i >= 0; i--) {
                                 if(warnData[i].x <= time) { pointWarn = warnData[i]; break; }
                             }

                             if(pointCrit && pointCrit.y === 1) status = 'Critical';
                             else if(pointWarn && pointWarn.y === 1) status = 'Warning';

                            return `Status: ${status}`;
                        }
                    },
                    backgroundColor: 'rgba(0, 0, 0, 0.8)', padding: 10
                },
                legend: {
                    position: 'top',
                    labels: { usePointStyle: true, padding: 15, boxWidth: 10, font: { size: 11 } }
                }
            },
            scales: {
                x: {
                    type: 'time',
                    time: {
                        unit: 'hour',
                         tooltipFormat: 'MMM d, HH:mm', // Format for tooltips
                         displayFormats: {
                             hour: 'HH:mm' // Format for axis labels
                         }
                    },
                    min: dayStart.valueOf(), // Use epoch ms for min/max
                    max: displayEndTime.valueOf(),
                    title: { display: true, text: 'Time' },
                    grid: { color: 'rgba(0,0,0,0.05)' },
                    ticks: { source: 'auto', maxRotation: 45, font: { size: 10 } }
                },
                y: {
                    min: -0.1, max: 1.1,
                    title: { display: true, text: 'State' },
                    grid: { drawOnChartArea: false }, // Cleaner look
                    ticks: {
                        stepSize: 1,
                        callback: value => value === 1 ? 'Active' : value === 0 ? '' : '' // Simplified Y-axis
                    }
                }
            }
        }
    });

     // --- Calculate and Display Time in States ---
     const timeInStates = { great: 0, warning: 0, critical: 0 };
     for (let i = 0; i < dayDataPoints.length - 1; i++) {
         const duration = dayDataPoints[i + 1].timestamp.getTime() - dayDataPoints[i].timestamp.getTime();
         if (dayDataPoints[i].critical) {
             timeInStates.critical += duration;
         } else if (dayDataPoints[i].warning) {
             timeInStates.warning += duration;
         } else {
             timeInStates.great += duration;
         }
     }

    const totalDurationMs = displayEndTime.getTime() - dayStart.getTime();

    // Update the summary divs
    const summaryContainer = ctx.canvas.parentElement.nextElementSibling; // Assumes summary div is immediately after chart container
    if (summaryContainer && summaryContainer.classList.contains('grid')) {
        summaryContainer.innerHTML = `
            <div class="p-3 bg-emerald-50 rounded-lg">
                <h5 class="text-sm font-medium text-emerald-800">Great State</h5>
                <p class="text-xs text-emerald-600 mt-1">Duration: ${formatDuration(timeInStates.great)}</p>
                <p class="text-xs text-emerald-600">${totalDurationMs ? Math.round((timeInStates.great / totalDurationMs) * 100) : 0}% of time</p>
            </div>
            <div class="p-3 bg-yellow-50 rounded-lg">
                <h5 class="text-sm font-medium text-yellow-800">Warning State</h5>
                <p class="text-xs text-yellow-600 mt-1">Duration: ${formatDuration(timeInStates.warning)}</p>
                <p class="text-xs text-yellow-600">${totalDurationMs ? Math.round((timeInStates.warning / totalDurationMs) * 100) : 0}% of time</p>
            </div>
            <div class="p-3 bg-red-50 rounded-lg">
                <h5 class="text-sm font-medium text-red-800">Critical State</h5>
                <p class="text-xs text-red-600 mt-1">Duration: ${formatDuration(timeInStates.critical)}</p>
                <p class="text-xs text-red-600">${totalDurationMs ? Math.round((timeInStates.critical / totalDurationMs) * 100) : 0}% of time</p>
            </div>
        `;
    } else {
        window.logToConsole('Status summary container not found or invalid', 'warning');
    }

}

/**
 * Processes flow rate data for a specific day.
 * @param {string[]} timestamps - Array of ISO timestamp strings.
 * @param {number[]} flowValues - Array of flow rate values (L/min).
 * @param {number} selectedDay - 0 for Today, 1 for Yesterday, etc.
 * @returns {object} Object containing datasets for Chart.js and a noData flag.
 */
function processFlowByHour(timestamps, flowValues, selectedDay) {
     window.logToConsole(`Processing flow data for day ${selectedDay}`, 'info');

    const hourlyData = {};
    const now = new Date();
    const currentHour = now.getHours();

    const dayStart = new Date(now);
    dayStart.setDate(dayStart.getDate() - selectedDay);
    dayStart.setHours(0, 0, 0, 0);

    const dayEnd = new Date(dayStart);
    dayEnd.setHours(23, 59, 59, 999);

    let hasDataForDay = false;
    let allFlowsForDay = [];
    let lastFlowTime = null;


    for (let i = 0; i < timestamps.length; i++) {
        const timestamp = new Date(timestamps[i]);
        const flow = flowValues[i];

        if (flow === null || flow === undefined || isNaN(flow)) continue;
        if (timestamp < dayStart || timestamp > dayEnd) continue;

        const hour = timestamp.getHours();
        if (selectedDay === 0 && hour > currentHour) continue;

        hasDataForDay = true;
        allFlowsForDay.push(flow);
         if (flow > 0) { // Track time of last positive flow
             lastFlowTime = timestamp;
         }


        if (!hourlyData[hour]) {
            hourlyData[hour] = { flows: [], hour };
        }
        hourlyData[hour].flows.push(flow);
    }

    // Update statistics if data exists for the day
    const statsContainer = document.getElementById('flowStats');
    if (statsContainer && hasDataForDay) {
        const minFlow = Math.min(...allFlowsForDay);
        const maxFlow = Math.max(...allFlowsForDay);
        document.getElementById('flowRange').textContent = `${minFlow.toFixed(2)} - ${maxFlow.toFixed(2)} L/min`;

        // Calculate total flow *duration* (approximation assuming interval represents duration)
        // This requires knowing the interval, which isn't directly passed here.
        // Let's calculate average flow rate instead.
         const avgFlow = allFlowsForDay.reduce((a, b) => a + b, 0) / allFlowsForDay.length;
         // Total Flow might be misleading, perhaps Average Rate is better
         document.getElementById('flowTotal').textContent = `${avgFlow.toFixed(2)} L/min (Avg)`;


        const stdDev = calculateStdDev(allFlowsForDay);
        document.getElementById('flowStdDev').textContent = `±${stdDev.toFixed(2)} L/min`;

        // Frequency (number of data points with flow > 0)
        const flowPointsCount = allFlowsForDay.filter(f => f > 0).length;
        document.getElementById('flowFrequency').textContent = `${flowPointsCount} points > 0`;

        // Time Since Last Flow
         const timeSinceLastFlowEl = document.getElementById('timeSinceLastFlow');
         if (lastFlowTime) {
            timeSinceLastFlowEl.textContent = formatTimeDuration(now - lastFlowTime);
         } else {
             // If no flow recorded today, calculate from start of day or last known flow
             timeSinceLastFlowEl.textContent = 'N/A'; // Or calculate based on full dataset if needed
         }

         statsContainer.classList.remove('opacity-50', 'pointer-events-none');

    } else if (statsContainer) {
         // Clear stats if no data
         document.getElementById('flowRange').textContent = '-';
         document.getElementById('flowTotal').textContent = '-';
         document.getElementById('flowStdDev').textContent = '-';
         document.getElementById('flowFrequency').textContent = '-';
         document.getElementById('timeSinceLastFlow').textContent = '-';
         // Optionally add opacity
         // statsContainer.classList.add('opacity-50', 'pointer-events-none');
    }


    if (!hasDataForDay) {
        return { datasets: [], noData: true };
    }

    // Calculate hourly averages
    const hourlyAvgFlows = Array(24).fill(null);
    Object.values(hourlyData).forEach(data => {
        if (data.flows.length > 0) {
            hourlyAvgFlows[data.hour] = data.flows.reduce((a, b) => a + b, 0) / data.flows.length;
        }
    });

    // --- Create Datasets ---
    const dayLabels = ['Today', 'Yesterday', '2 Days Ago'];
    const colors = [
        { border: 'rgb(34, 197, 94)', background: 'rgba(34, 197, 94, 0.1)' },
        { border: 'rgb(59, 130, 246)', background: 'rgba(59, 130, 246, 0.1)' },
        { border: 'rgb(168, 85, 247)', background: 'rgba(168, 85, 247, 0.1)' }
    ];
    const dayColor = colors[selectedDay % colors.length];


    const datasets = [{
        label: `Flow Rate (${dayLabels[selectedDay]})`,
        data: hourlyAvgFlows,
        borderColor: dayColor.border,
        backgroundColor: dayColor.background,
        tension: 0.1,
        fill: true,
        pointRadius: 3,
        pointHoverRadius: 5
    }];

    return { datasets, noData: false };
}


/**
 * Updates the flow rate chart with data for the selected days.
 * @param {number} deviceIdx - The index of the device.
 * @param {number} selectedDay - The day index (0=Today, 1=Yesterday, ...).
 */
async function updateFlowGraph(deviceIdx, selectedDay) {
    currentDeviceIndex = deviceIdx; // Store index
    const device = window.lastDevicesData[deviceIdx];
    updateTimeRangeButtons('flow-time-range', selectedDay);

    // Manage stats display based on selection (only single day supported for now)
    const statsContainer = document.getElementById('flowStats');
    if (statsContainer) {
        // Flow graph currently only shows one day at a time
        statsContainer.classList.remove('opacity-50', 'pointer-events-none');
        // Stats will be updated by processFlowByHour
    }

    // Fetch data
    const maxHours = (selectedDay + 1) * 24;
    const timeSeriesData = await fetchTimeSeriesData(device.id, maxHours);

    if (!timeSeriesData) {
        window.logToConsole('Failed to get time series data for flow graph', 'error');
        return;
    }

    // Destroy existing chart
    if (charts.flowChart) {
        charts.flowChart.destroy();
        charts.flowChart = null;
    }

    // Process data for the selected day
    const { datasets, noData } = processFlowByHour(timeSeriesData.timestamps, timeSeriesData.flowRate, selectedDay); // Use flowRate


    const ctx = document.getElementById('flowChart').getContext('2d');
    const chartContainer = ctx.canvas.parentElement;

    // Remove previous 'no data' message if it exists
    const existingNoDataMsg = chartContainer.querySelector('.no-data-message');
    if (existingNoDataMsg) {
        existingNoDataMsg.remove();
    }

    if (noData) {
        window.logToConsole(`No flow data available for day ${selectedDay}.`, 'warning');
        // Display no data message
        const noDataMessage = document.createElement('div');
        noDataMessage.className = 'absolute inset-0 flex items-center justify-center text-center text-gray-500 no-data-message';
        noDataMessage.innerHTML = `<p class="text-lg font-medium">No flow rate data available</p><p class="text-sm">for the selected period</p>`;
        chartContainer.style.position = 'relative'; // Ensure container is positioned
        chartContainer.appendChild(noDataMessage);
        return; // Don't create the chart
    }


    // Create hour labels
    const hourLabels = Array.from({ length: 24 }, (_, i) => `${i.toString().padStart(2, '0')}:00`);

    // Create the chart
    charts.flowChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: hourLabels,
            datasets: datasets
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
                            const value = context.raw;
                            return `Flow: ${value !== null ? value.toFixed(2) + ' L/min' : 'No data'}`;
                        }
                    },
                     backgroundColor: 'rgba(0, 0, 0, 0.8)', padding: 10
                },
                legend: {
                    position: 'top',
                    labels: { usePointStyle: true, padding: 15, boxWidth: 10, font: { size: 11 } }
                }
            },
            scales: {
                x: {
                    title: { display: true, text: 'Hour of Day' },
                     grid: { color: 'rgba(0,0,0,0.05)' }
                },
                y: {
                    beginAtZero: true,
                    title: { display: true, text: 'Flow Rate (L/min)' },
                     grid: { color: 'rgba(0,0,0,0.05)' },
                    ticks: { callback: value => `${value.toFixed(1)}` }
                }
            }
        }
    });
}


/**
 * Updates the active state of time range buttons within a specific container.
 * @param {string} containerId - The ID of the container div holding the buttons.
 * @param {number} selectedDay - The day index that should be marked active.
 */
function updateTimeRangeButtons(containerId, selectedDay) {
    const container = document.getElementById(containerId);
    if (!container) {
        window.logToConsole(`Button container not found: ${containerId}`, 'error');
        return;
    }
    container.querySelectorAll('.time-range-button').forEach(button => {
        const days = parseInt(button.dataset.days);
        if (days === selectedDay) {
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
        const endTime = new Date();
        const startTime = new Date(endTime);
        startTime.setHours(startTime.getHours() - hours);
        const device = window.lastDevicesData.find(d => d.id === deviceId);
        const property = device?.thing?.properties?.find(p => p.name === propertyName);
        if (!property) throw new Error(`Property ${propertyName} not found`);

        const interval = Math.max(Math.ceil(hours * 3600 / 1000), 60);
        const queryParams = new URLSearchParams({ interval: interval.toString(), from: startTime.toISOString(), to: endTime.toISOString(), aggregation: 'AVG', desc: 'false' }).toString();
        const apiUrl = `${window.API_URL}/api/proxy/timeseries/${device.thing.id}/${property.id}?${queryParams}`; // Use thing ID
        
        const response = await fetch(apiUrl, { headers: { 'Accept': 'application/json' } });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const data = await response.json();
        return parseTsArray(data.data || []); // Use helper

    } catch (error) {
        window.logToConsole(`Error fetching property timeseries (${propertyName}): ${error.message}`, 'error');
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