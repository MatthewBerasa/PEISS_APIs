let app;  // Reference to the Express app
let client;  // Reference to the MongoDB client

// Set up the app and database client
function setApp(application, dbClient) {
    app = application;
    client = dbClient;

    // Define your API routes here
    app.get('/api/test', async (req, res) => {
        res.json({ message: 'API is working!' });
    });

    app.get('/', (req, res) => {
        res.send('API is working!');
    });

    app.get('/api/collections', async (req, res) => {
        try {
            const db = client.db();  // Use default database from connection URI
            const collections = await db.listCollections().toArray();
            res.json(collections.map(col => col.name));
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });
}

// Export the function
module.exports = { setApp };