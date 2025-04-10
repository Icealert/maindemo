// public/components/recommendations.js

function generateRecommendationsHTML(status, device) {
    // Ensure status and device are valid objects
    if (!status || typeof status !== 'object' || !device || typeof device !== 'object') {
        console.error('generateRecommendationsHTML: Invalid status or device object provided.');
        return '<p class="text-red-500 text-sm">Error generating recommendations: Invalid data.</p>';
    }
    // Ensure device.thing and device.thing.properties exist
     if (!device.thing || !device.thing.properties || !Array.isArray(device.thing.properties)) {
        console.warn('generateRecommendationsHTML: device.thing or device.thing.properties is missing or invalid.', device);
        // Initialize properties to avoid errors later
        device.thing = device.thing || {};
        device.thing.properties = [];
    }

    const recommendations = [];

    // --- Start of logic copied from recommendations.html ---
    // Connection Status Recommendations
    if (!status.isConnected) {
        recommendations.push({
            type: 'error',
            title: 'Connection Lost',
            message: 'Device is currently offline. Click below to view troubleshooting steps:',
            action: `<div class="space-y-2 mt-1">
                <details class="group bg-red-50 rounded-lg">
                    <summary class="flex items-center justify-between p-2 font-medium cursor-pointer list-none hover:bg-red-100 rounded-lg transition-colors">
                        <div class="flex items-center space-x-2">
                            <span class="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-100 text-red-800 text-xs font-bold">1</span>
                            <span>Verify Ice Machine Operation</span>
                        </div>
                        <svg class="w-5 h-5 text-red-700 transform group-open:rotate-180 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                        </svg>
                    </summary>
                    <div class="p-2 pt-0 text-red-700">
                        <ul class="mt-0.5 ml-4 list-disc text-sm space-y-0.5">
                            <li>Check if the ice machine is powered on and running</li>
                            <li>If the machine is off, turn it on and wait for it to start</li>
                        </ul>
                    </div>
                </details>
                <details class="group bg-red-50 rounded-lg">
                    <summary class="flex items-center justify-between p-2 font-medium cursor-pointer list-none hover:bg-red-100 rounded-lg transition-colors">
                        <div class="flex items-center space-x-2">
                            <span class="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-100 text-red-800 text-xs font-bold">2</span>
                            <span>Check Power Supply</span>
                        </div>
                        <svg class="w-5 h-5 text-red-700 transform group-open:rotate-180 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                        </svg>
                    </summary>
                    <div class="p-2 pt-0 text-red-700">
                        <ul class="mt-0.5 ml-4 list-disc text-sm space-y-0.5">
                            <li>Ensure the FreezeSense device is receiving power:
                                <ul class="ml-4 mt-0.5 list-circle space-y-0.5">
                                    <li>Inspect the power cable to confirm it is securely connected</li>
                                    <li>Check the wall socket where the power adapter is plugged in</li>
                                    <li>Look for the LED indicator on the power supply—it should be lit</li>
                                    <li>Try plugging the power supply into a different socket if needed</li>
                                </ul>
                            </li>
                        </ul>
                    </div>
                </details>
                <details class="group bg-red-50 rounded-lg">
                     <summary class="flex items-center justify-between p-2 font-medium cursor-pointer list-none hover:bg-red-100 rounded-lg transition-colors">
                        <div class="flex items-center space-x-2">
                            <span class="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-100 text-red-800 text-xs font-bold">3</span>
                            <span>Verify WiFi Connection</span>
                        </div>
                        <svg class="w-5 h-5 text-red-700 transform group-open:rotate-180 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                        </svg>
                    </summary>
                    <div class="p-2 pt-0 text-red-700">
                        <ul class="mt-0.5 ml-4 list-disc text-sm space-y-0.5">
                            <li>Confirm network connectivity:
                                <ul class="ml-4 mt-0.5 list-circle space-y-0.5">
                                    <li>Check if other devices on the same WiFi network are working</li>
                                    <li>If WiFi is down, restart the router and wait for network recovery</li>
                                    <li>Ensure the device is within range of the WiFi router</li>
                                </ul>
                            </li>
                        </ul>
                    </div>
                </details>
                <details class="group bg-red-50 rounded-lg">
                    <summary class="flex items-center justify-between p-2 font-medium cursor-pointer list-none hover:bg-red-100 rounded-lg transition-colors">
                        <div class="flex items-center space-x-2">
                            <span class="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-100 text-red-800 text-xs font-bold">4</span>
                            <span>Restart Device</span>
                        </div>
                        <svg class="w-5 h-5 text-red-700 transform group-open:rotate-180 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                        </svg>
                    </summary>
                    <div class="p-2 pt-0 text-red-700">
                        <ul class="mt-0.5 ml-4 list-disc text-sm space-y-0.5">
                            <li>Perform a manual reboot:
                                <ul class="ml-4 mt-0.5 list-circle space-y-0.5">
                                    <li>Unplug the power supply from the wall socket</li>
                                    <li>Wait for 10 seconds</li>
                                    <li>Plug the power supply back in</li>
                                    <li>Allow the device to restart and monitor reconnection</li>
                                </ul>
                            </li>
                        </ul>
                    </div>
                </details>
                 <details class="group bg-red-50 rounded-lg">
                    <summary class="flex items-center justify-between p-2 font-medium cursor-pointer list-none hover:bg-red-100 rounded-lg transition-colors">
                        <div class="flex items-center space-x-2">
                            <span class="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-100 text-red-800 text-xs font-bold">5</span>
                            <span>Contact Support</span>
                        </div>
                        <svg class="w-5 h-5 text-red-700 transform group-open:rotate-180 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                        </svg>
                    </summary>
                    <div class="p-2 pt-0 text-red-700">
                        <ul class="mt-0.5 ml-4 list-disc text-sm space-y-0.5">
                            <li>If all previous steps fail:
                                <ul class="ml-4 mt-0.5 list-circle space-y-0.5">
                                    <li>Support is for FreezeSense device issues only</li>
                                    <li>For ice machine issues, refer to machine troubleshooting guide</li>
                                </ul>
                            </li>
                            <li class="mt-0.5">Contact your maintenance team</li>
                        </ul>
                    </div>
                </details>
            </div>`
        });
    }

    // Temperature Recommendations
    if (status.cloudTemp !== undefined && status.tempThresholdMax !== undefined && status.cloudTemp > status.tempThresholdMax) {
        recommendations.push({
            type: 'warning',
            title: 'High Temperature Detected',
            message: 'High temperature likely means there is no ice at the sensor level. Follow these steps in order:',
            action: `<div class="space-y-2 mt-1">
                <details class="group bg-yellow-50 rounded-lg">
                    <summary class="flex items-center justify-between p-2 font-medium cursor-pointer list-none hover:bg-yellow-100 rounded-lg transition-colors">
                        <div class="flex items-center space-x-2">
                            <span class="inline-flex items-center justify-center w-5 h-5 rounded-full bg-yellow-100 text-yellow-800 text-xs font-bold">1</span>
                            <span>Check Ice Usage</span>
                        </div>
                        <svg class="w-5 h-5 text-yellow-700 transform group-open:rotate-180 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                        </svg>
                    </summary>
                    <div class="p-2 pt-0 text-yellow-700">
                        <div class="space-y-2">
                            <p class="text-sm">Has ice been used at a higher rate than usual?</p>
                            <ul class="mt-0.5 ml-4 list-disc text-sm space-y-0.5">
                                <li>If yes, the machine may not have had enough time to produce and replenish ice at the sensor level</li>
                                <li>Allow the ice machine to continue running and monitor if the ice level recovers</li>
                                <li>Check usage patterns to determine if demand has recently increased beyond the machine's capacity</li>
                            </ul>
                        </div>
                    </div>
                </details>
                <details class="group bg-yellow-50 rounded-lg">
                    <summary class="flex items-center justify-between p-2 font-medium cursor-pointer list-none hover:bg-yellow-100 rounded-lg transition-colors">
                        <div class="flex items-center space-x-2">
                            <span class="inline-flex items-center justify-center w-5 h-5 rounded-full bg-yellow-100 text-yellow-800 text-xs font-bold">2</span>
                            <span>Inspect Ice Levels Manually</span>
                        </div>
                        <svg class="w-5 h-5 text-yellow-700 transform group-open:rotate-180 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                        </svg>
                    </summary>
                    <div class="p-2 pt-0 text-yellow-700">
                        <ul class="mt-0.5 ml-4 list-disc text-sm space-y-0.5">
                            <li>Open the ice machine bin and check if there is ice at the sensor level</li>
                            <li>If there is no ice at the sensor level, proceed to Step 3</li>
                            <li>If there is ice at the sensor level, but the system still detects high temperature, proceed to Step 4</li>
                        </ul>
                    </div>
                </details>
                <details class="group bg-yellow-50 rounded-lg">
                    <summary class="flex items-center justify-between p-2 font-medium cursor-pointer list-none hover:bg-yellow-100 rounded-lg transition-colors">
                        <div class="flex items-center space-x-2">
                            <span class="inline-flex items-center justify-center w-5 h-5 rounded-full bg-yellow-100 text-yellow-800 text-xs font-bold">3</span>
                            <span>If No Ice is Present</span>
                        </div>
                        <svg class="w-5 h-5 text-yellow-700 transform group-open:rotate-180 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                        </svg>
                    </summary>
                    <div class="p-2 pt-0 text-yellow-700">
                        <div class="space-y-2">
                            <div>
                                <p class="font-medium">🔹 Machine Operation:</p>
                                <ul class="mt-0.5 ml-4 list-disc text-sm space-y-0.5">
                                    <li>Verify the ice machine is powered on and operating</li>
                                    <li>If the machine is off, turn it on and allow it to cycle</li>
                                    <li>Check if the ice machine is producing ice</li>
                                    <li>Listen for the sound of water filling and freezing</li>
                                </ul>
                            </div>
                            <div>
                                <p class="font-medium">🔹 Environmental Checks:</p>
                                <ul class="mt-0.5 ml-4 list-disc text-sm space-y-0.5">
                                    <li>Ensure proper airflow and ventilation</li>
                                    <li>Check for blocked vents that could cause overheating</li>
                                    <li>Inspect the water supply and pressure</li>
                                    <li>Look for clogged filters that might restrict water flow</li>
                                </ul>
                            </div>
                            <div>
                                <p class="font-medium">🔹 Monitor Progress:</p>
                                <ul class="mt-0.5 ml-4 list-disc text-sm space-y-0.5">
                                    <li>Watch the next production cycle</li>
                                    <li>If ice production resumes, the issue may have been temporary</li>
                                    <li>If ice is still not being produced, maintenance may be required</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </details>
                <details class="group bg-yellow-50 rounded-lg">
                    <summary class="flex items-center justify-between p-2 font-medium cursor-pointer list-none hover:bg-yellow-100 rounded-lg transition-colors">
                        <div class="flex items-center space-x-2">
                            <span class="inline-flex items-center justify-center w-5 h-5 rounded-full bg-yellow-100 text-yellow-800 text-xs font-bold">4</span>
                            <span>If Ice is Present but Temperature High</span>
                        </div>
                        <svg class="w-5 h-5 text-yellow-700 transform group-open:rotate-180 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                        </svg>
                    </summary>
                    <div class="p-2 pt-0 text-yellow-700">
                        <div class="space-y-2">
                            <p class="text-sm">This suggests a false high-temperature reading due to an incorrect threshold setting.</p>
                            <div>
                                <p class="font-medium">🔹 Adjust Temperature Threshold:</p>
                                <ul class="mt-0.5 ml-4 list-disc text-sm space-y-0.5">
                                    <li>Navigate to the FreezeSense Properties Section in the system settings</li>
                                    <li>Locate the Temperature Threshold setting</li>
                                    <li>Increase the threshold slightly to reduce false alerts</li>
                                    <li>Save the settings and monitor to ensure proper functionality</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </details>
                <details class="group bg-yellow-50 rounded-lg">
                    <summary class="flex items-center justify-between p-2 font-medium cursor-pointer list-none hover:bg-yellow-100 rounded-lg transition-colors">
                        <div class="flex items-center space-x-2">
                            <span class="inline-flex items-center justify-center w-5 h-5 rounded-full bg-yellow-100 text-yellow-800 text-xs font-bold">5</span>
                            <span>If Issue Persists</span>
                        </div>
                        <svg class="w-5 h-5 text-yellow-700 transform group-open:rotate-180 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                        </svg>
                    </summary>
                    <div class="p-2 pt-0 text-yellow-700">
                        <div class="space-y-2">
                            <div>
                                <p class="font-medium">🔹 Full Machine Inspection:</p>
                                <ul class="mt-0.5 ml-4 list-disc text-sm space-y-0.5">
                                    <li>Clean the machine thoroughly, including:</li>
                                    <ul class="ml-4 list-circle">
                                        <li>Sensors and vents</li>
                                        <li>Ice bin and production area</li>
                                        <li>Ultrasonic sensor position and clearance</li>
                                    </ul>
                                </ul>
                            </div>
                            <div>
                                <p class="font-medium">🔹 Check for Mechanical Issues:</p>
                                <ul class="mt-0.5 ml-4 list-disc text-sm space-y-0.5">
                                    <li>Inspect for problems with:</li>
                                    <ul class="ml-4 list-circle">
                                        <li>Compressor operation</li>
                                        <li>Thermostat function</li>
                                        <li>Internal components</li>
                                    </ul>
                                </ul>
                            </div>
                            <div>
                                <p class="font-medium">🔹 Next Steps:</p>
                                <ul class="mt-0.5 ml-4 list-disc text-sm space-y-0.5">
                                    <li>If troubleshooting doesn't resolve the issue:</li>
                                    <ul class="ml-4 list-circle">
                                        <li>Schedule a maintenance inspection</li>
                                        <li>Contact your maintenance team</li>
                                    </ul>
                                </ul>
                            </div>
                        </div>
                    </div>
                </details>
            </div>`
        });
    }

    // Maintenance Recommendations
    const lastMaintenance = device.thing?.properties?.find(p => p.name === 'Last_Maintenance')?.last_value;
    if (lastMaintenance && /^\d{2}\/\d{2}\/\d{4}$/.test(lastMaintenance)) { // Validate date format
        try {
            // Attempt to parse the date string safely
            const parts = lastMaintenance.split('/');
            const maintenanceDate = new Date(parseInt(parts[2]), parseInt(parts[0]) - 1, parseInt(parts[1]));

            // Check if the date is valid after parsing
            if (!isNaN(maintenanceDate.getTime())) {
                const now = new Date();
                // Ensure we compare dates only, ignore time
                const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                const maintDay = new Date(maintenanceDate.getFullYear(), maintenanceDate.getMonth(), maintenanceDate.getDate());

                const diffTime = today - maintDay; // Difference in milliseconds
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); // Difference in days

                if (diffDays > 180) { // 180 days = 6 months
                    recommendations.push({
                        type: 'warning',
                        title: 'Maintenance Overdue',
                        message: `Regular maintenance (recommended every 6 months) is overdue by ${(diffDays - 180)} days.`,
                        action: 'Schedule maintenance service as soon as possible to ensure optimal performance.'
                    });
                } else if (diffDays > 150) { // Start warning 30 days before 6-month mark
                    recommendations.push({
                        type: 'info',
                        title: 'Maintenance Due Soon',
                        message: `Regular 6-month maintenance will be due in ${(180 - diffDays)} days.`,
                        action: 'Plan to schedule maintenance service in the coming weeks.'
                    });
                }
            } else {
                console.warn('generateRecommendationsHTML: Invalid date parsed from lastMaintenance:', lastMaintenance);
                recommendations.push({
                    type: 'info',
                    title: 'Maintenance Status Unknown',
                    message: 'Invalid maintenance date recorded. Regular maintenance is recommended every 6 months.',
                    action: 'Please correct the maintenance date or schedule initial maintenance service.'
                });
            }
        } catch (e) {
            console.error('generateRecommendationsHTML: Error processing lastMaintenance date:', e, lastMaintenance);
            recommendations.push({
                type: 'info',
                title: 'Maintenance Status Error',
                message: 'Error reading maintenance date. Regular maintenance is recommended every 6 months.',
                action: 'Please check the maintenance date format or schedule initial maintenance service.'
            });
        }
    } else {
        recommendations.push({
            type: 'info',
            title: 'Maintenance Status Unknown',
            message: 'No maintenance history found or invalid format. Regular maintenance is recommended every 6 months.',
            action: 'Please schedule initial maintenance service.'
        });
    }

    // No Flow Recommendations
    if (status.timeSinceFlowHours !== undefined && status.noFlowCriticalTime !== undefined && status.timeSinceFlowHours >= status.noFlowCriticalTime) {
        recommendations.push({
            type: 'warning',
            title: 'No Flow Detected',
            message: 'No water flow has been detected for an extended period. Follow these steps to troubleshoot:',
            action: `<div class="space-y-2 mt-1">
                <details class="group bg-yellow-50 rounded-lg">
                     <summary class="flex items-center justify-between p-2 font-medium cursor-pointer list-none hover:bg-yellow-100 rounded-lg transition-colors">
                        <div class="flex items-center space-x-2">
                            <span class="inline-flex items-center justify-center w-5 h-5 rounded-full bg-yellow-100 text-yellow-800 text-xs font-bold">1</span>
                            <span>Check Water Supply</span>
                        </div>
                        <svg class="w-5 h-5 text-yellow-700 transform group-open:rotate-180 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                        </svg>
                    </summary>
                    <div class="p-2 pt-0 text-yellow-700">
                        <div class="space-y-2">
                            <div>
                                <p class="font-medium">🔹 Verify Water Source:</p>
                                <ul class="mt-0.5 ml-4 list-disc text-sm space-y-0.5">
                                    <li>Check if the main water supply valve is open</li>
                                    <li>Verify water pressure is adequate</li>
                                    <li>Look for any visible leaks in supply lines</li>
                                    <li>Ensure no maintenance work is affecting water supply</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </details>
                <details class="group bg-yellow-50 rounded-lg">
                    <summary class="flex items-center justify-between p-2 font-medium cursor-pointer list-none hover:bg-yellow-100 rounded-lg transition-colors">
                        <div class="flex items-center space-x-2">
                            <span class="inline-flex items-center justify-center w-5 h-5 rounded-full bg-yellow-100 text-yellow-800 text-xs font-bold">2</span>
                            <span>Inspect for Blockages</span>
                        </div>
                        <svg class="w-5 h-5 text-yellow-700 transform group-open:rotate-180 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                        </svg>
                    </summary>
                    <div class="p-2 pt-0 text-yellow-700">
                        <div class="space-y-2">
                            <div>
                                <p class="font-medium">🔹 Check Common Blockage Points:</p>
                                <ul class="mt-0.5 ml-4 list-disc text-sm space-y-0.5">
                                    <li>Inspect and clean the water filter if necessary</li>
                                    <li>Check for kinked or bent water lines</li>
                                    <li>Look for mineral buildup in water lines</li>
                                    <li>Verify the water inlet valve is functioning</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </details>
                <details class="group bg-yellow-50 rounded-lg">
                    <summary class="flex items-center justify-between p-2 font-medium cursor-pointer list-none hover:bg-yellow-100 rounded-lg transition-colors">
                        <div class="flex items-center space-x-2">
                            <span class="inline-flex items-center justify-center w-5 h-5 rounded-full bg-yellow-100 text-yellow-800 text-xs font-bold">3</span>
                            <span>Test Water Flow</span>
                        </div>
                        <svg class="w-5 h-5 text-yellow-700 transform group-open:rotate-180 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                        </svg>
                    </summary>
                    <div class="p-2 pt-0 text-yellow-700">
                        <div class="space-y-2">
                            <div>
                                <p class="font-medium">🔹 Flow Testing Steps:</p>
                                <ul class="mt-0.5 ml-4 list-disc text-sm space-y-0.5">
                                    <li>Initiate a manual water fill cycle if possible</li>
                                    <li>Listen for water flow sounds</li>
                                    <li>Check if water is reaching the ice making unit</li>
                                    <li>Measure water pressure if a gauge is available</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </details>
                <details class="group bg-yellow-50 rounded-lg">
                     <summary class="flex items-center justify-between p-2 font-medium cursor-pointer list-none hover:bg-yellow-100 rounded-lg transition-colors">
                        <div class="flex items-center space-x-2">
                            <span class="inline-flex items-center justify-center w-5 h-5 rounded-full bg-yellow-100 text-yellow-800 text-xs font-bold">4</span>
                            <span>Reset and Monitor</span>
                        </div>
                        <svg class="w-5 h-5 text-yellow-700 transform group-open:rotate-180 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                        </svg>
                    </summary>
                    <div class="p-2 pt-0 text-yellow-700">
                        <div class="space-y-2">
                            <div>
                                <p class="font-medium">🔹 Reset Procedure:</p>
                                <ul class="mt-0.5 ml-4 list-disc text-sm space-y-0.5">
                                    <li>Power cycle the ice machine:</li>
                                    <ul class="ml-4 list-circle">
                                        <li>Turn off the machine</li>
                                        <li>Wait for 5 minutes</li>
                                        <li>Turn the machine back on</li>
                                    </ul>
                                    <li>Monitor for normal operation</li>
                                    <li>Check if water flow resumes</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </details>
                 <details class="group bg-yellow-50 rounded-lg">
                    <summary class="flex items-center justify-between p-2 font-medium cursor-pointer list-none hover:bg-yellow-100 rounded-lg transition-colors">
                        <div class="flex items-center space-x-2">
                            <span class="inline-flex items-center justify-center w-5 h-5 rounded-full bg-yellow-100 text-yellow-800 text-xs font-bold">5</span>
                            <span>If Issue Persists</span>
                        </div>
                        <svg class="w-5 h-5 text-yellow-700 transform group-open:rotate-180 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                        </svg>
                    </summary>
                    <div class="p-2 pt-0 text-yellow-700">
                        <div class="space-y-2">
                            <div>
                                <p class="font-medium">🔹 Next Steps:</p>
                                <ul class="mt-0.5 ml-4 list-disc text-sm space-y-0.5">
                                    <li>If all troubleshooting steps fail:</li>
                                    <ul class="ml-4 list-circle">
                                        <li>Contact your maintenance team</li>
                                        <li>Schedule a professional inspection</li>
                                        <li>Document all steps taken for maintenance reference</li>
                                    </ul>
                                </ul>
                            </div>
                        </div>
                    </div>
                </details>
            </div>`
        });
    }

    // Add "System Operating Normally" if no other recommendations and status is great
    if (recommendations.length === 0 && status.isGreat) {
        recommendations.push({
            type: 'success',
            title: 'System Operating Normally',
            message: 'All parameters are within normal ranges.',
            action: 'Continue regular monitoring and maintenance schedule.'
        });
    }
    // --- End of logic copied from recommendations.html ---

    // Generate the final HTML structure
    const recommendationsHTML = recommendations.length > 0 ? recommendations.map(rec => `
        <div class="flex items-start p-3 rounded-lg ${
            rec.type === 'error' ? 'bg-red-50 border border-red-200' :
            rec.type === 'warning' ? 'bg-yellow-50 border border-yellow-200' :
            rec.type === 'info' ? 'bg-blue-50 border border-blue-200' :
            'bg-emerald-50 border border-emerald-200'
        }">
            <div class="flex-shrink-0">
                <svg class="w-5 h-5 ${
                    rec.type === 'error' ? 'text-red-600' :
                    rec.type === 'warning' ? 'text-yellow-600' :
                    rec.type === 'info' ? 'text-blue-600' :
                    'text-emerald-600'
                }" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    ${rec.type === 'error' ?
                        '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />' :
                        rec.type === 'warning' ?
                        '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />' :
                        rec.type === 'info' ?
                        '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />' :
                        '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />'
                    }
                </svg>
            </div>
            <div class="ml-3 flex-1">
                <h5 class="text-sm font-medium ${
                    rec.type === 'error' ? 'text-red-800' :
                    rec.type === 'warning' ? 'text-yellow-800' :
                    rec.type === 'info' ? 'text-blue-800' :
                    'text-emerald-800'
                }">${rec.title}</h5>
                <p class="mt-1 text-xs ${
                    rec.type === 'error' ? 'text-red-700' :
                    rec.type === 'warning' ? 'text-yellow-700' :
                    rec.type === 'info' ? 'text-blue-700' :
                    'text-emerald-700'
                }">${rec.message}</p>
                <p class="mt-1 text-xs font-medium ${
                    rec.type === 'error' ? 'text-red-900' :
                    rec.type === 'warning' ? 'text-yellow-900' :
                    rec.type === 'info' ? 'text-blue-900' :
                    'text-emerald-900'
                }">Recommended Action:</p> <!-- Removed colon -->
                 <div class="mt-1 text-xs ${ /* Action content styling */
                    rec.type === 'error' ? 'text-red-700' :
                    rec.type === 'warning' ? 'text-yellow-700' :
                    rec.type === 'info' ? 'text-blue-700' :
                    'text-emerald-700'
                }">${rec.action}</div> <!-- Render action HTML or text -->
            </div>
        </div>
    `).join('') : '<p class="text-gray-500 text-sm">No recommendations at this time.</p>';

    // Wrap the recommendations in the original container structure
    return `
        <!-- Recommendations Section -->
        <div class="bg-white rounded-lg shadow-lg border border-gray-100 p-4 mb-6">
            <div class="flex items-center space-x-2 mb-4">
                <svg class="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                <h3 class="text-xl font-semibold text-gray-900">Recommendations</h3>
            </div>
            <div class="space-y-3">
                ${recommendationsHTML}
            </div>
        </div>
    `;
} 