const { createAccessToken, isTokenExpired, refreshToken } = require('./createJWT');
const {hashPassword} = require ('./passwordHashing');
const {createCode} = require ('./createVerificationCode');
const bcrypt = require ('bcrypt');
const req = require('express/lib/request');
const { ObjectId } = require('mongodb');

const multer = require('multer');
const multerS3 = require('multer-s3');
const path = require('path');
const { S3Client } = require('@aws-sdk/client-s3'); // Import the S3Client
const { json } = require('stream/consumers');

// Configure DigitalOcean Spaces with AWS SDK v3
const s3Client = new S3Client({
    forcePathStyle: false,
    region: 'nyc3',
    endpoint: 'https://nyc3.digitaloceanspaces.com',
    credentials: {
        accessKeyId: process.env.DO_SPACES_ACCESS_KEY,
        secretAccessKey: process.env.DO_SPACES_SECRET_KEY
    }
  });

// Configure Multer to Upload Directly to Spaces
const upload = multer({
  storage: multerS3({
    s3: s3Client,
    bucket: process.env.DO_SPACES_BUCKET,
    acl: 'public-read', // Adjust permissions as necessary
    key: (req, file, cb) => {
      const fileName = `${Date.now()}-${file.originalname}`;
      cb(null, fileName);
    },
  }),
  fileFilter: (req, file, cb) => {
    const fileTypes = /jpeg|jpg|png/;
    const extname = fileTypes.test(path.extname(file.originalname).toLowerCase());
    const mimeType = fileTypes.test(file.mimetype);

    if (extname && mimeType) {
      return cb(null, true);
    } else {
      cb(new Error('Only .jpeg, .jpg, and .png files are allowed.'));
    }
  },
});


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
            const passwordsMatch =  await bcrypt.compare(password, storedPassword); //Check if HashedPassword === Input Password

            if(!passwordsMatch)
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


    //Register API

    //Incoming: Email Password

    //Outgoing: JSON Token 

    app.post('/api/register', async (req, res) => {
        try{
            const {email, password} = req.body;
            let isConnected = false;

            //Check if both fields filled
            if(!email || !password)
                return res.status(400).json({error: "All fields must be filled!"});

    
            hashedPassword = await hashPassword(password); //Hash Password
        
            const db = dbClient.db('PEISS_DB'); //Connect to database

            let newUser = { 
                Email: email,
                Password: hashedPassword,
                isConnected: isConnected
            };

            //Insert to Database
            let ret = await db.collection('Users').insertOne(newUser);

            let userInfo = {
                userID: ret.insertedId,
                isConnected: false
            };

            let accessToken = createAccessToken(userInfo);
            return res.status(200).json({accessToken});
        }
        catch(error){
            return res.status(500).json({error: "An unexpected error ocurred."});
        }
    });
    
    app.get('/api/provideSettings', async (req, res) => {
        try{
            const {deviceID} = req.query;
            if(!deviceID)
                return res.status(400).json({error: "Device ID not specified"});

            //Convert to ObjectID
            const objectDeviceID = new ObjectId(deviceID);

            const db = dbClient.db('PEISS_DB'); //Connect to Database

            let system = await db.collection('System').find({_id: objectDeviceID}).toArray(); //Retrieve Data of System

            if(system.length == 0)
                return res.status(401).json({error: "System does not exist!"});

            let result = {
                alarmSetting: system[0].Alarm,
                notificationSetting: system[0].Notifications
            };

            return res.status(200).json(result);    
        }
        catch(error){
            return res.status(500).json({error: "An unexpected error ocurred."});
        }
    });

    app.post('/api/updateSettings', async (req, res) => {
        try{
            const {alarmSetting, notificationSetting, deviceID} = req.body;

            if(alarmSetting === null || notificationSetting === null)
                return res.status(400).json({error: "Settings not specified!"});

            if(!deviceID)
                return res.status(400).json({error: "Device ID not specified."});
            
            let objectDeviceID = new ObjectId(deviceID);

            //Connect to Database 
            const db = dbClient.db('PEISS_DB');
            let system = db.collection('System').find({_id: objectDeviceID}).toArray();

            if(system.length == 0)
                return res.status(401).json({error: "System does not exist!"});

            let updateSettings = {
                Alarm: alarmSetting,
                Notifications: notificationSetting
            };

            await db.collection('System').updateOne(
                {_id: objectDeviceID}, 
                {$set: updateSettings}
            );

            return res.status(200).json({message: "Settings Updated Successfully!"});
        }
        catch(error){
            return res.status(500).json({error: "An unexpected error occurred."});
        }
    });

    app.get('/api/getLogs', async (req, res) => {
        try{
            const {deviceID} = req.query;

            if(!deviceID)
                return res.status(400).json({error: "System not specified."});

            let objectDeviceID = new ObjectId(deviceID); //Convert to Object ID

            //Conect to Database
            let db = dbClient.db('PEISS_DB');

            //Reterieve all data entries with System ID from Request Body
            let logs = await db.collection('ActivityLogs').find({SystemID: objectDeviceID}).toArray();

            if(logs.length === 0)
                return res.status(404).json({error: "No activity logs found."});

            return res.status(200).json({logs});
        }catch(error){
            return res.status(500).json({error: "An error has occured."});
        }
    });

    
    app.post('/api/addActivityLog', upload.single('image'), async (req, res) => {
        try {
            const { deviceID } = req.body;

            if (!deviceID) 
                return res.status(400).json({error: 'deviceID must be specified.'});
        
            // Convert deviceID to ObjectId
            const objectDeviceID = new ObjectId(deviceID);
    
            // Image upload URL
            let imageUrl = null;
            if (req.file) 
                imageUrl = req.file.location; // DigitalOcean Spaces file URL
            
            // Create the timestamp on the server-side (current time)
            const timestamp = new Date();
    
            // Connect to database
            const db = client.db('PEISS_DB');
    
            // Check if system exists
            const systemExists = await db.collection('System').findOne({ _id: objectDeviceID });
            if (!systemExists) 
                return res.status(404).json({ error: 'System does not exist.' });
            
            // Create activity log entry
            const newLog = {
                SystemID: objectDeviceID,
                Timestamp: timestamp,
                ImageURL: imageUrl // Use Spaces file URL
            };
    
            // Insert activity log into the database
            await db.collection('ActivityLogs').insertOne(newLog);
    
            return res.status(200).json({message: 'Activity log added successfully!'});
    
        } catch (error) {    
            return res.status(500).json({error: 'An unexpected error occurred.'});
        }
    });

    app.get('/api/connectSystem', async (req, res) => {
        try{
            const {deviceID, userID} = req.query;

            if(!deviceID)
                return res.status(400).json({error: "System not specified."});

            if(!userID)
                return res.status(400).json({error: "User not specified"});

            let objectDeviceID = new ObjectId(deviceID);
            let objectUserID = new ObjectId(userID);

            //Connect to database
            let db = dbClient.db('PEISS_DB');

            let system = await db.collection('System').findOne({_id: objectDeviceID});

            if(!system)
                return res.status(404).json({error: "System not found."});

            let user = await db.collection('Users').findOne({_id: objectUserID});

            if(!user)
                return res.status(404).json({error: "User not found."});

            //Update and Connect
            let update = {
                isConnected: true
            };

            let res1 = await db.collection('Users').updateOne(
                {_id: objectUserID},
                {$set: update}
            );
            let res2 = await db.collection('System').updateOne(
                {_id: objectDeviceID},
                {$push: {Users: objectUserID}},
            );
            
            if(res1.modifiedCount === 0 || res2.modifiedCount === 0)
                return res.status(400).json({message: "Update Unsuccesfull"});

            return res.status(200).json({message: "System connected."});
        }catch(error){
            return res.status(500).json({error: "An error has occurred"});
        }   
    });

    app.get('/api/getAlarmState', async (req, res) => {
        try{
            const {deviceID} = req.query;

            if(!deviceID)
                return res.status(400).json({error: "System not specified."});

            let objectDeviceID = new ObjectId(deviceID);

            //Connect to database
            let db = dbClient.db('PEISS_DB');
            let system = await db.collection('System').findOne({_id: objectDeviceID});
            
            if(!system)
                return res.status(404).json({error: "System not found."});

            let alarmState = {
                alarmSounding: system.alarmSounding,
                alarmEnabled: system.Alarm
            };

            return res.status(200).json({alarmState});
        }catch(error){
            return res.status(500).json({error: "An error has occurred."});
        }

    });

    app.post('/api/updateAlarmState', async (req, res) => {
        try{
            const{deviceID, alarmState} = req.body;

            if(!deviceID)
                return res.status(400).json({error: "System not specified."});

            if(typeof alarmState !== 'boolean')
                return res.status(400).json({error: "Invalid alarmState, must be boolean."});

            let objectDeviceID = new ObjectId(deviceID);

            //Connect to database
            let db = dbClient.db('PEISS_DB');
            let system = await db.collection('System').findOne({_id: objectDeviceID});

            if(!system)
                return res.status(404).json({error: "System not found."});

            //Update
            let update = {
                alarmSounding: alarmState
            };

            let result = await db.collection('System').updateOne(
                {_id: objectDeviceID},
                {$set: update}
            );

            if(result.modifiedCount === 0)
                return res.status(400).json({error: 'Update Unsuccessful.'});

            return res.status(200).json({message: "Update Successful"});
        }catch(error){
            return res.status(500).json({error: "An error has occurred."});
        }
    });

    app.get('/api/disconnectSystem', async (req, res) => {
        try{
            const{deviceID, userID} = req.query;

            if(!deviceID)
                return res.status(400).json({error: "System not specified."});

            if(!userID)
                return res.status(400).json({error: "User not specified."});

            //Create ObjectIds
            let objectDeviceID = new ObjectId(deviceID);
            let objectUserID = new ObjectId(userID);

            //Connect to database
            let db = dbClient.db('PEISS_DB');

            let system = await db.collection('System').findOne({_id: objectDeviceID});
            if(!system)
                return res.status(404).json({error: "System not found."});

            let user = await db.collection('System').findOne({
                _id: objectDeviceID,
                Users: objectUserID
            });

            if(!user)
                return res.status(404).json({error: "User not connected to system."});

            //Update and Disconnect
            let update = {
                isConnected: false
            };

            //Remove User Connectop
            let result = await db.collection('System').updateOne(
                {_id: objectDeviceID},
                {$pull: {Users: objectUserID}}
            );

            //Change User Connection Status
            let result2 = await db.collection('Users').updateOne(
                {_id: objectUserID},
                {$set: update}
            );

            if(result.modifiedCount === 0 || result2.modifiedCount === 0)
                return res.status(400).json({error: "User Disconnection Unsuccessful."});
            
            return res.status(200).json({message: "User Disconnection Successful."});
        }catch(error){
            return res.status(500).json({error: "An error has occurred."});
        }     
    });

    app.post('/api/checkConnection', async (req, res) => {
        try{
            const{userID} = req.body;

            if(!userID)
                return res.status(400).json({error: "User not specified."});

            //Create ObjectIds
            let objectUserID = new ObjectId(userID);

            //Connect to database
            let db = dbClient.db('PEISS_DB');

            let user = await db.collection('Users').findOne({_id: objectUserID});
            if(!user)
                return res.status(404).json({error: "User not found."});

            let status = {
                connectionStatus: user.isConnected
            };

            return res.status(200).json(status);            
        }catch(error){
            return res.status(500).json({error: "An error has occurred."});
        }   
    });
    
    //Refresh the Token 
    app.post('/api/refresh_token', async (req, res) => {
        try {
            const { token } = req.body;

            if (!token) {
                return res.status(400).json({ error: "Token is required." });
            }

            const newAccessToken = refreshToken(token);
            if (newAccessToken) {
                return res.status(200).json({ accessToken: newAccessToken });
            } else {
                return res.status(400).json({ error: "Unable to refresh token." });
            }
        } catch (error) {
            return res.status(500).json({ error: "An unexpected error occurred." });
        }
    });

}

//Export Function 
module.exports = {setApp};