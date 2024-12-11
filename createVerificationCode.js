function createCode(){
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890'; 
    let verifyCode = "";
    let length = 4;

    for(let i = 0; i < length; i++){
        let index = Math.floor(Math.random() * chars.length);
        verifyCode += chars[index];
    }

    return verifyCode;
}

module.exports = {createCode};