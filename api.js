let app; 
let client;

function setApp(application, dbClient){
    app = application;
    client = dbClient;

    //Write APIs

    app.post('/api/login', async (req, res) => {
        //Get Email and Password from Request
        const {email, password} = req.body;

        //Error handling for empty request
        if(!email || !password)
            return res.status(400).json({error: "Both email and password must be specifed"});
        
        //Connect to Database in Cluster 
        const db = client.db('PEISS_DB');

        //Retrieve Result
        const result = await db.collection('Users').find({Email: email}).toArray();


    });

    app.post('/api/refresh_token', async (req, res) => {
        const { refreshToken } = req.body;
        if (!refreshToken) return res.status(401).send("Refresh token required");
    
        // Verify refresh token and generate new access token
        try {
            const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
            const newAccessToken = createAccessToken(decoded.userInfo);
            res.json({ accessToken: newAccessToken });
        } catch (err) {
            return res.status(403).send("Invalid or expired refresh token");
        }
    });

}

//Export Function 
module.exports = {setApp};