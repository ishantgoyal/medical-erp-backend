const db = require('../config/db');
exports.getBillForReturn = async (req, res) => {
    try {
        const { bill_no } = req.params; 
        const user_id = req.user_id;

        const query = `
            SELECT 
                s.id as sale_id, 
                s.patient_name as customer_name, 
                s.invoice_no,
                si.product_id as stock_id,   -- Photo ke hisab se product_id
                si.medicine_name, 
                si.quantity as sold_qty,     -- Photo ke hisab se quantity
                si.rate, 
                si.batch_no,
                si.expiry_date
            FROM sales s
            JOIN sales_items si ON s.id = si.sales_id -- Photo ke hisab se sales_id (with 's')
            WHERE (s.id = ? OR s.invoice_no = ? OR s.patient_name LIKE ?) 
            AND s.user_id = ?`;

        const searchName = `%${bill_no}%`;

        const [rows] = await db.execute(query, [bill_no, bill_no, searchName, user_id]);

        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: "Koi record nahi mila!" });
        }

        res.status(200).json({ success: true, data: rows });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// 2. Add Sales Return (Stock Update logic ke saath)
exports.addSalesReturn = async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const { sale_id, return_date, total_amount, remarks, items } = req.body;
        const user_id = req.user_id;
        const return_no = `SR-${Date.now()}`;

        // Header Entry
        const [result] = await connection.execute(
            `INSERT INTO sales_return (return_no, sale_id, user_id, total_amount, return_date, remarks) 
             VALUES (?, ?, ?, ?, ?, ?)`,
            [return_no, sale_id, user_id, total_amount, return_date, remarks]
        );

        const return_id = result.insertId;

        for (let item of items) {
            // Item details entry
            await connection.execute(
                `INSERT INTO sales_return_items (return_id, stock_id, return_qty, rate, total) 
                 VALUES (?, ?, ?, ?, ?)`,
                [return_id, item.stock_id, item.return_qty, item.rate, (item.return_qty * item.rate)]
            );

            // STOCK INCREASE (+): Maal wapas aaya toh stock badhao (stock table ke ID se match karega)
            await connection.execute(
                `UPDATE stock SET current_qty = current_qty + ? WHERE id = ? AND user_id = ?`,
                [item.return_qty, item.stock_id, user_id]
            );
        }

        await connection.commit();
        res.status(201).json({ success: true, message: "Return processed and Stock updated!" });

    } catch (error) {
        await connection.rollback();
        res.status(500).json({ success: false, message: "Error: " + error.message });
    } finally {
        connection.release();
    }
};

// 3. Sales Return List (History)
exports.getReturnList = async (req, res) => {
    try {
        const user_id = req.user_id;
        const query = `
            SELECT sr.*, s.invoice_no, s.patient_name 
            FROM sales_return sr 
            JOIN sales s ON sr.sale_id = s.id 
            WHERE sr.user_id = ? 
            ORDER BY sr.created_at DESC`;

        const [rows] = await db.execute(query, [user_id]);
        res.status(200).json({ success: true, data: rows });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// 4. Return Detail (Specific Return ID ki items dikhane ke liye)
exports.getReturnDetail = async (req, res) => {
    try {
        const { id } = req.params;
        const query = `
            SELECT sri.*, st.medicine_name, st.batch_no 
            FROM sales_return_items sri
            JOIN stock st ON sri.stock_id = st.id
            WHERE sri.return_id = ?`;
            
        const [rows] = await db.execute(query, [id]);
        res.status(200).json({ success: true, data: rows });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};