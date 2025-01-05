# Arduino IoT Dashboard

A real-time web dashboard for monitoring and controlling Arduino IoT devices. Built with Node.js and vanilla JavaScript, featuring a clean and responsive UI using TailwindCSS.

## Features

- Real-time device monitoring
- Interactive property controls
- Support for multiple data types (Boolean, Integer, Float, String)
- Debug console for monitoring updates and errors
- Responsive design that works on desktop and mobile
- Automatic refresh every 30 seconds
- Color-coded property cards based on property type

## Prerequisites

- Node.js (v14 or higher)
- Arduino IoT Cloud account and API credentials
- Arduino devices connected to Arduino IoT Cloud

## Setup

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

## Usage

- The dashboard automatically loads and displays all your Arduino IoT devices
- For writable properties:
  - Toggle switches for boolean values
  - Input fields with update buttons for numeric and text values
- Use the debug console to monitor updates and troubleshoot issues
- The dashboard automatically refreshes every 30 seconds

## Project Structure

```
├── public/
│   └── index.html     # Main dashboard UI
├── server.js          # Express server and API endpoints
├── main.js           # Arduino IoT Cloud client setup
├── package.json      # Project dependencies
└── .env             # Environment variables (not in repo)
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details. 