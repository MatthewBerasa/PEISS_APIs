const jwt = require("jsonwebtoken");
require("dotenv").config();

function createAccessToken(userInfo) 
{
    return jwt.sign({ userInfo: userInfo }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
}

// This function will be called within various APIs (probably CRUD events)
// It will be called to ensure a user's token is still valid
function isTokenExpired(token)
{
    try 
    {
        // Token is valid & not expired
        jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
        return false;
    } 
    catch (error) 
    {
        // Check if error is because token expired. If token is expired return true.
        if (error.name == 'TokenExpiredError')
        {
            return true;
        }
        return true; // Token is invalid for some other reason
    }
}

//Refresh the Token 
function createRefreshToken(userInfo) {
    return jwt.sign({ userInfo: userInfo }, process.env.REFRESH_TOKEN_SECRET, { expiresIn: '365d' });  // 1 year expiration
}


module.exports = {createAccessToken, isTokenExpired, createRefreshToken};