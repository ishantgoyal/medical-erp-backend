const db = require('../config/db');


exports.getStockStatus = async (req, res) => {
    try {
        const { type, months } = req.query; 
        const user_id = req.user_id;
        
        
        let query = "";
        let params = [user_id];

        if (type === 'low') {
            query = `SELECT * FROM stock WHERE user_id = ? AND current_qty <= 10 AND current_qty > 0 ORDER BY current_qty ASC`;
        } 
        else if (type === 'expiry') {
            // Agar months nahi aaya toh default 6 mahine rakhenge
            const intervalMonths = months ? parseInt(months) : 6;
            
            query = `SELECT * FROM stock 
                     WHERE user_id = ? 
                     AND expiry_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL ${intervalMonths} MONTH) 
                     AND current_qty > 0
                     ORDER BY expiry_date ASC`;
        } 
        else {
            query = `SELECT * FROM stock WHERE user_id = ? AND current_qty > 0 ORDER BY medicine_name ASC`;
        }

        const [rows] = await db.execute(query, params);
        res.status(200).json({ success: true, data: rows });

    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};