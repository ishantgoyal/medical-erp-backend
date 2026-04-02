const jwt = require('jsonwebtoken');

const verifyToken = (req, res, next) => {
    // recieve token from header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ status: false, message: "Unauthorized: No token provided" });
    }

    const token = authHeader.split(' ')[1];

    try {
        // verify token using the same secret key used during login
        // 'your_jwt_secret_key' As same as login
        const decoded = jwt.verify(token, 'my_super_ishant_medical_27_12_2001');
        req.user_id = decoded.id; 
        next(); 
    } catch (error) {
        console.error("JWT Verification Error:", error.message);
        return res.status(401).json({ status: false, message: "Unauthorized: Invalid or expired token" });
    }
};

module.exports = verifyToken;