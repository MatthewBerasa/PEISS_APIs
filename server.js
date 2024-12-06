const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { MongoClient } = require('mongodb');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Environment Variables
require('dotenv').config();
const url = process.env.MONGODB_URI;

// Database Connection
let client;
(async () => {
    try {
        client = new MongoClient(url);
        await client.connect();
        console.log('Connected to MongoDB');
        const api = require('./api.js');
        api.setApp(app, client);
    } catch (e) {
        console.error('Database connection error:', e.message);
    }
})();

// Start Server
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));