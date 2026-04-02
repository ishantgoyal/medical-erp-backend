// Local db connect krne ke liye ye code use krna hai


// const mysql = require('mysql2');

// const pool = mysql.createPool({
//     host: 'localhost',
//     user: 'root',
//     password: 'Eshant@1234',     
//     database: 'medicalishant',   
//     waitForConnections: true,
//     connectionLimit: 10,
//     queueLimit: 0
// });

// module.exports = pool.promise();





//  aur aiven db  ke sath env ka code connect krne ke liye yeh  wala code use krna hai

const mysql = require('mysql2');
const path = require('path');
// Ye line .env file ko ek folder bahar se dhoondti hai
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
    ssl: {
        rejectUnauthorized: false
    },
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000
});

// Connection Test
pool.getConnection((err, connection) => {
    if (err) {
        console.error('❌ Database connection failed:', err.message);
    } else {
        console.log('✅ Connected to Aiven MySQL (via .env)!');
        connection.release();
    }
});

module.exports = pool.promise();