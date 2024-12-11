const {createAccessToken, isTokenExpired, createRefreshToken} = require('./createJWT');
const {hashPassword} = require ('./passwordHashing');
const {createCode} = require ('./createVerificationCode');
const bcrypt = require ('bcrypt');

let app; 
let client;

function setApp(application, dbClient){
    app = application;
    client = dbClient;

    //Login API

    //Incoming: Email, Password
    //Outgoing: JSON Token: UserID, isConnected

    app.post('/api/login', async (req, res) => {
        try{
            //Get Email and Password from Request
            const {email, password} = req.body;

            //Error handling for empty request
            if(!email || !password)
                return res.status(400).json({error: "Both email and password must be specified"});
            
            //Connect to Database in Cluster 
            const db = client.db('PEISS_DB');

            //Retrieve Result through Email
            const result = await db.collection('Users').find({Email: email}).toArray();


            if(result.length == 0)
                return res.status(401).json({error: "Email or Password is Incorrect!"});


            //Verify Correct Password
            const storedPassword = result[0].Password; //Hashed Password stored in DB
            //const passwordsMatch =  await bcrypt.compare(password, storedPassword); //Check if HashedPassword === Input Password

            if(storedPassword !== password)
                return res.status(401).json({error: "Email or Password is Incorrect!"});

            //Initialize Outgoing information
            let userID = result[0]._id;
            let isConnected = result[0].isConnected;

            let userInfo = {
                userID,
                isConnected
            };

            //Create JWT
            let accessToken = createAccessToken(userInfo);
            return res.status(200).json({accessToken});
        }
        catch(error){
           return res.status(500).json({error: "An unexpected error ocurred."});
        }
    });

    //VerificationCode API

    //Incoming: Email
    //Outgoing: Verification Code

    app.post('/api/verification', async (req, res) => {
        try{
            const {email} = req.body;

            //Check if field empty
            if(!email)
                return res.status(400).json({error: "All fields must be filled!"});

            //Check if Account with Email already exist

            const db = client.db('PEISS_DB'); //Connect to Database

            let result = await db.collection('Users').find({Email: email}).toArray();

            if(result.length !== 0)
                return res.status(401).json({error: "Account with this email already exists."});

            //Send Verification
            let verificationCode = createCode();

            const sgMail = require('@sendgrid/mail');
            sgMail.setApiKey(process.env.SENDGRID_API_KEY);

            const msg = {
                to: email,
                from: {
                    email: 'peiss2025@protonmail.com',
                    name: 'PEISS Verification'
                },
                subject: "PEISS Verification Code",
                text: `Your verification code is: ${verificationCode}`,
                html: `<p>Enter this verification code to the app: <strong>${verificationCode}</strong></p>`
            };

            await sgMail.send(msg);
            
            return res.status(200).json({verificationCode});
        }
        catch(error){
            return res.status(500).json({error: "An unexpected error ocurred."});
        }
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