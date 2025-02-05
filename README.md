# IceAlert - Ice Machine Monitoring System

A real-time web dashboard for monitoring and controlling Arduino IoT devices, specifically designed for ice machine monitoring. Built with Node.js and vanilla JavaScript, featuring a clean and responsive UI using TailwindCSS.

**Note: This application is being developed for a specific undisclosed client and is currently in BETA.**

## Features

- Real-time device monitoring
- Interactive property controls
- Support for multiple data types (Boolean, Integer, Float, String)
- Debug console for monitoring updates and errors
- Responsive design that works on desktop and mobile
- Automatic refresh every 30 seconds
- Color-coded property cards based on property type

## Contact & Support

For questions, support, or feedback please contact:

**Kunj Tapiawala**  
Email: icealertdevice@gmail.com

## Technical Details

### Prerequisites

- Node.js (v14 or higher)
- Arduino IoT Cloud account and API credentials
- Arduino devices connected to Arduino IoT Cloud

### Setup

1. Clone the repository:
```bash
git clone [your-repo-url]
cd [your-repo-name]
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the root directory and add your Arduino IoT Cloud credentials:
```env
CLIENT_ID=your_client_id
CLIENT_SECRET=your_client_secret
```

4. Start the server:
```bash
node server.js
```

5. Open your browser and navigate to:
```
http://localhost:3000
```

## Project Structure

```
├── public/
│   └── index.html     # Main dashboard UI
├── server.js          # Express server and API endpoints
├── main.js           # Arduino IoT Cloud client setup
├── package.json      # Project dependencies
└── .env             # Environment variables (not in repo)
```

## Beta Status

This application is currently in beta. Users should be aware that:
- Features may be incomplete or subject to change
- Data accuracy and system reliability are being continuously improved
- The interface and functionality may be updated without prior notice
- Critical alerts should be verified through physical inspection

## License

This project is proprietary software developed for a specific client. All rights reserved.

© 2024 IceAlert 