const db = require('../config/db');
const jwt = require('jsonwebtoken');
const JWT_SECRET = 'my_super_ishant_medical_27_12_2001';

// ==========================
// 1. REGISTER API
// ==========================
exports.register = async (req, res) => {
    const { name, mobile, password, shop_name, shop_address, dl_number, gst_number } = req.body;
    if (!name || !mobile || !password || !shop_name) {
        return res.json({ status: false, message: "Please fill required fields (Name, Mobile, Password, Shop Name)" });
    }

    try {
        const [existingUser] = await db.query("SELECT * FROM users WHERE mobile = ?", [mobile]);
        if (existingUser.length > 0) {
            return res.json({ status: false, message: "Mobile Number Already Registered!" });
        }

        const insertSql = `INSERT INTO users (name, mobile, password, shop_name, shop_address, dl_number, gst_number) 
                           VALUES (?, ?, ?, ?, ?, ?, ?)`; 
        await db.query(insertSql, [name, mobile, password, shop_name, shop_address, dl_number, gst_number]);

        return res.json({
            status: true,
            message: "Registration Successful! Please Login."
        });

    } catch (error) {
        console.error("Register Error:", error); //
        return res.status(500).json({ status: false, message: "Internal Server Error" }); //
    }
};

// ==========================
// 2. LOGIN API
// ==========================


exports.login = async (req, res) => {
    const { mobile, password } = req.body;
    if (!mobile || !password) {
        return res.json({
            status: false,
            message: "Mobile and Password are required!"
        }); 
    }

    try {
        const [rows] = await db.query("SELECT * FROM users WHERE mobile = ? AND password = ?", [mobile, password]);

        if (rows.length > 0) {
            const user = rows[0]; 
            const token = jwt.sign(
                { id: user.id },
                JWT_SECRET,
                { expiresIn: '24h' }
            );
            return res.json({
                status: true,
                message: "Login Successfully",
                data: {
                    login_token: token,
                    user: {
                        id: user.id,
                        name: user.name,
                        shop_name: user.shop_name,
                        shop_address: user.shop_address,
                        dl_number: user.dl_number,
                        gst_number: user.gst_number
                    }
                }
            });

        } else {
            return res.json({
                status: false,
                message: "Invalid Mobile or Password"
            }); //
        }

    } catch (error) {
        console.error("Login Error:", error);
        return res.status(500).json({ status: false, message: "Internal Server Error" }); 
    }
};