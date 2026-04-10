const db = require('../config/db');


exports.addProduct = async (req, res) => {
    try {
        const user_id = req.user_id;
        const {
            medicine_name,
            company_name,
            product_type,
            hsn,
            pack,
            conv,
            mrp,
            purchase_rate,
            gst_percent,
            discount_percent,
            reorder_level
        } = req.body;

        const query = `
            INSERT INTO products (
                user_id, medicine_name, company_name, product_type, hsn, 
                pack, conv, mrp, purchase_rate, gst_percent, 
                discount_percent, reorder_level, is_deleted
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`;


        const [result] = await db.execute(query, [
            user_id,
            medicine_name || null,
            company_name || null,
            product_type || 'Tab',
            hsn || null,
            pack || null,
            conv || 1,
            mrp || 0,
            purchase_rate || 0,
            gst_percent || 5,
            discount_percent || 0,
            reorder_level || 0
        ]);

        res.status(200).json({
            status: true, message: "Product added to Master successfully!",
            product_id: result.insertId
        });
    } catch (e) {
        console.error("❌ Add Product Error:", e.message);
        res.status(500).json({ status: false, message: e.message });
    }
};

exports.getProducts = async (req, res) => {
    try {
        const query = `
            SELECT 
                id,                  
                user_id,             
                id AS product_id,    
                medicine_name, 
                company_name, 
                product_type, 
                hsn, 
                pack, 
                conv, 
                mrp, 
                purchase_rate, 
                gst_percent, 
                discount_percent, 
                reorder_level 
            FROM products 
            WHERE user_id = ? AND is_deleted = 0 
            ORDER BY medicine_name ASC`;

        const [rows] = await db.execute(query, [req.user_id]);

        res.status(200).json({
            status: true,
            data: rows
        });
    } catch (e) {
        res.status(500).json({ status: false, message: e.message });
    }
};



exports.deleteProduct = async (req, res) => {
    try {
        const { id } = req.params;
        const user_id = req.user_id;
        await db.execute(
            'UPDATE products SET is_deleted = 1 WHERE id = ? AND user_id = ?',
            [id, user_id]
        );
        res.status(200).json({ status: true, message: "Product deleted from Master!" });
    } catch (e) {
        res.status(500).json({ status: false, message: e.message });
    }
};


exports.getProductById = async (req, res) => {
    try {
        const { id } = req.params;
        const user_id = req.user_id;

        const [rows] = await db.execute(
            'SELECT * FROM products WHERE id = ? AND user_id = ? AND is_deleted = 0',
            [id, user_id]
        );

        if (rows.length === 0) {
            return res.status(200).json({ status: false, message: "Product not found!" });
        }

        return res.status(200).json({
            status: true,
            message: "Product Data Fetched",
            data: rows[0]
        });

    } catch (error) {
        console.error("Get Product Error:", error);
        return res.status(500).json({ status: false, message: "Server Error" });
    }
};

exports.updateProduct = async (req, res) => {
    const connection = await db.getConnection(); 
    try {
        await connection.beginTransaction();

        const { id } = req.params;
        const user_id = req.user_id;

        const {
            medicine_name, company_name, product_type, hsn,
            pack, conv, mrp, purchase_rate,
            gst_percent, discount_percent, reorder_level
        } = req.body;

        
        const queryProduct = `
            UPDATE products SET 
                medicine_name=?, company_name=?, product_type=?, hsn=?, 
                pack=?, conv=?, mrp=?, purchase_rate=?, 
                gst_percent=?, discount_percent=?, reorder_level=? 
            WHERE id=? AND user_id=?`;

        await connection.execute(queryProduct, [
            medicine_name || null, company_name || null, product_type || 'Tab', hsn || null,
            pack || null, conv || 1, mrp || 0, purchase_rate || 0,
            gst_percent || 12, discount_percent || 0, reorder_level || 0,
            id, user_id
        ]);

        const queryStock = `
            UPDATE stock SET 
                medicine_name=?, product_type=?, hsn=?, 
                pack=?, conv=?, mrp=?, purchase_rate=?, gst_percent=?
            WHERE product_id=? AND user_id=?`;

        await connection.execute(queryStock, [
            medicine_name, product_type || 'Tab', hsn || null,
            pack || null, conv || 1, mrp || 0, purchase_rate || 0, gst_percent || 12,
            id, user_id
        ]);

        await connection.commit();
        res.status(200).json({ status: true, message: "Product and Stock Updated Successfully!" });

    } catch (e) {
        if (connection) await connection.rollback();
        console.error("❌ Update Product Error:", e.message);
        res.status(500).json({ status: false, message: e.message });
    } finally {
        if (connection) connection.release();
    }
};

