// Function to render the device information section
function renderDeviceInformation(device, status) {
    return `
        <div class="bg-white rounded-lg shadow-lg border border-gray-100 p-4 mb-6">
            <div class="flex items-center space-x-2 mb-4">
                <svg class="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                </svg>
                <h3 class="text-xl font-semibold text-gray-900">Device Information</h3>
            </div>
            <div class="grid grid-cols-2 md:grid-cols-3 gap-4">
                <!-- Basic Info Column -->
                <div class="space-y-3">
                    <div>
                        <p class="text-xs font-medium text-gray-500">Device Name</p>
                        <p class="text-sm font-semibold text-gray-900">${device.thing?.properties?.find(p => p.name === 'devicename')?.last_value || `Device ${device.name.replace(/[^0-9]/g, '')}`}</p>
                    </div>
                    <div>
                        <p class="text-xs font-medium text-gray-500">Location</p>
                        <p class="text-sm font-semibold text-gray-900">${device.thing?.properties?.find(p => p.name === 'location')?.last_value || 'Location not set'}</p>
                    </div>
                    <div>
                        <p class="text-xs font-medium text-gray-500">Ice Machine PN/SN</p>
                        <p class="text-sm font-semibold text-gray-900">${device.thing?.properties?.find(p => p.name === 'Icemachine_PN_SN')?.last_value || 'N/A'}</p>
                        <p class="text-xs text-gray-500 mt-1 italic">Track which ice machine this FreezeSense device is currently installed in</p>
                    </div>
                </div>

                <!-- Status Column -->
                <div class="space-y-3">
                    <div>
                        <p class="text-xs font-medium text-gray-500">Connection Status</p>
                        <div class="flex items-center mt-1">
                            <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                status.isConnected ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                            }">
                                <span class="w-2 h-2 mr-1 rounded-full ${
                                    status.isConnected ? 'bg-green-400' : 'bg-red-400'
                                }"></span>
                                ${status.isConnected ? 'Connected' : 'Disconnected'}
                            </span>
                        </div>
                        ${!status.isConnected && status.lastConnectedTime ? `
                            <p class="text-xs text-red-600 mt-1">Last seen: ${new Date(status.lastConnectedTime).toLocaleString('en-US', {
                                dateStyle: 'medium',
                                timeStyle: 'short'
                            })}</p>
                        ` : ''}
                    </div>
                    <div>
                        <p class="text-xs font-medium text-gray-500">Device Status</p>
                        <span class="inline-flex items-center px-2 py-0.5 mt-1 rounded-full text-xs font-medium ${
                            status.isGreat ? 'bg-emerald-100 text-emerald-800' :
                            status.isWarning ? 'bg-yellow-100 text-yellow-800' :
                            'bg-red-100 text-red-800'
                        }">
                            ${status.isGreat ? 'Great' : status.isWarning ? 'Warning' : 'Critical'}
                        </span>
                    </div>
                    <div>
                        <p class="text-xs font-medium text-gray-500">Device ID</p>
                        <p class="text-xs font-mono bg-gray-50 px-2 py-1 rounded border border-gray-200 select-all">${device.id}</p>
                    </div>
                </div>

                <!-- Maintenance Column -->
                <div class="col-span-2 md:col-span-1 space-y-3">
                    <div class="bg-gray-50 p-3 rounded-lg">
                        <p class="text-xs font-medium text-gray-500">Last Maintenance</p>
                        <p class="text-sm font-semibold text-gray-900 mt-1">${device.thing?.properties?.find(p => p.name === 'Last_Maintenance')?.last_value || 'Not recorded'}</p>
                        ${(() => {
                            const lastMaintenance = device.thing?.properties?.find(p => p.name === 'Last_Maintenance')?.last_value;
                            if (lastMaintenance) {
                                const [month, day, year] = lastMaintenance.split('/').map(num => parseInt(num));
                                const maintenanceDate = new Date(year, month - 1, day); // month is 0-based in JS
                                const now = new Date();
                                
                                // Calculate total months difference
                                const monthsDiff = (now.getFullYear() - maintenanceDate.getFullYear()) * 12 + 
                                                 (now.getMonth() - maintenanceDate.getMonth());
                                
                                // Calculate remaining days
                                const tempDate = new Date(now.getFullYear(), now.getMonth(), maintenanceDate.getDate());
                                const daysDiff = Math.floor((now - tempDate) / (1000 * 60 * 60 * 24));
                                
                                return `
                                    <div class="flex items-center mt-2 ${monthsDiff >= 6 ? 'bg-red-50 text-red-700 p-1.5 rounded' : ''}">
                                        ${monthsDiff >= 6 ? '<svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>' : ''}
                                        <span class="text-xs ${monthsDiff >= 6 ? 'font-medium' : 'text-gray-600'}">
                                            ${monthsDiff > 0 ? `${monthsDiff} month${monthsDiff > 1 ? 's' : ''}` : ''}
                                            ${daysDiff > 0 ? `${monthsDiff > 0 ? ' and ' : ''}${daysDiff} day${daysDiff > 1 ? 's' : ''}` : ''}
                                            since last maintenance
                                            ${monthsDiff >= 6 ? ' (Overdue - Recommended every 6 months)' : ''}
                                        </span>
                                    </div>
                                    ${monthsDiff < 6 ? `
                                    <div class="text-xs text-gray-600 mt-1">
                                        <span class="italic">Recommended maintenance period: 6 months</span>
                                    </div>
                                    ` : ''}
                                `;
                            }
                            return `
                                <div class="text-xs text-gray-600 mt-1">
                                    <span class="italic">Recommended maintenance period: 6 months</span>
                                </div>
                            `;
                        })()}
                    </div>
                </div>
            </div>
        </div>
    `;
}

// Export the function
window.renderDeviceInformation = renderDeviceInformation; 