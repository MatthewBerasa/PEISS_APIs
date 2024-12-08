const bcrypt = require('bcrypt');

async function hashPassword(password){
    try{
        const saltRounds = 10;
        const hashedPassword = bcrypt.hash(password, saltRounds);
        return hashedPassword;
    }
    catch(error){
        console.log(error);
        return;
    }

}

module.exports = {hashPassword};