const db = require('../config/db');

exports.addSupplier = async (req, res) => {
    try {
        const user_id = req.user_id; 
        const { name, mobile, email, gst_number, address } = req.body;

        if (!name || !mobile) {
            return res.status(200).json({ status: false, message: "Name and Mobile are required!" });
        }

        const [result] = await db.execute(
            `INSERT INTO suppliers (user_id, name, mobile, email, gst_number, address) 
             VALUES (?, ?, ?, ?, ?, ?)`,
            [user_id, name, mobile, email, gst_number, address]
        );

        // Response exactly jaisa aapne manga
        return res.status(200).json({ 
            status: true, 
            message: "Supplier Added Successfully!", 
            supplier_id: result.insertId  // <--- Aapka manga hua key name
        });

    } catch (error) {
        return res.status(500).json({ status: false, message: "Server Error" });
    }
};


exports.getSuppliers = async (req, res) => {
    try {
        const user_id = req.user_id; 

        const query = `
            SELECT 
                s.id AS id,             -- Unique ID
                s.user_id AS user_id,   -- Login user ki ID
                s.id AS supplier_id,    -- Jo supplier add hua hai uski ID
                s.name, 
                s.mobile, 
                s.email, 
                s.gst_number, 
                s.address,
                (
                    IFNULL((SELECT SUM(net_amount) FROM purchases WHERE supplier_id = s.id AND user_id = ?), 0) 
                    -  
                    IFNULL((SELECT SUM(amount) FROM supplier_payments WHERE supplier_id = s.id AND user_id = ?), 0)
                ) AS balance 
            FROM suppliers s
            WHERE s.user_id = ?
            ORDER BY s.id DESC
        `;

        const [suppliers] = await db.execute(query, [user_id, user_id, user_id]);

        return res.status(200).json({
            status: true,
            message: "Suppliers Fetched Successfully",
            data: suppliers 
        });

    } catch (error) {
        return res.status(500).json({ status: false, message: "Server Error" });
    }
};


exports.updateSupplier = async (req, res) => {
    try {
        const { id } = req.params; // URL se ID uthayenge
        const user_id = req.user_id; // Token se User ID
        const { name, mobile, email, gst_number, address } = req.body;

        if (!name || !mobile) {
            return res.status(200).json({ status: false, message: "Name and Mobile are required!" });
        }

        // Check karo ki mobile number kisi aur supplier ka toh nahi hai (Duplicate check)
        const [duplicate] = await db.execute(
            'SELECT id FROM suppliers WHERE mobile = ? AND user_id = ? AND id != ?', 
            [mobile, user_id, id]
        );

        if (duplicate.length > 0) {
            return res.status(200).json({ status: false, message: "Mobile number already used by another supplier." });
        }

        const query = `
            UPDATE suppliers 
            SET name = ?, mobile = ?, email = ?, gst_number = ?, address = ? 
            WHERE id = ? AND user_id = ?
        `;

        const [result] = await db.execute(query, [name, mobile, email, gst_number, address, id, user_id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ status: false, message: "Supplier not found or unauthorized!" });
        }

        return res.status(200).json({ status: true, message: "Supplier Updated Successfully!" });

    } catch (error) {
        console.error("Update Supplier Error:", error);
        return res.status(500).json({ status: false, message: "Server Error", error: error.message });
    }
};


exports.getSupplierById = async (req, res) => {
    try {
        const { id } = req.params;
        const user_id = req.user_id; // Token se security ke liye

        const [rows] = await db.execute(
            'SELECT * FROM suppliers WHERE id = ? AND user_id = ?', 
            [id, user_id]
        );

        if (rows.length === 0) {
            return res.status(200).json({ status: false, message: "Supplier not found!" });
        }

        return res.status(200).json({
            status: true,
            message: "Supplier Data Fetched",
            data: rows[0] // Sirf pehla record bhejenge
        });

    } catch (error) {
        console.error("Get Supplier Error:", error);
        return res.status(500).json({ status: false, message: "Server Error" });
    }
};


exports.deleteSupplier = async (req, res) => {
    try {
        const { id } = req.params;
        const user_id = req.user_id;

        // Check: Kya is supplier ki koi purchase entry hai? 
        // Agar hai, toh use delete nahi karne dena chahiye (Data Integrity)
        const [hasPurchases] = await db.execute(
            'SELECT id FROM purchases WHERE supplier_id = ? AND user_id = ? LIMIT 1',
            [id, user_id]
        );

        if (hasPurchases.length > 0) {
            return res.status(200).json({ 
                status: false, 
                message: "Cannot delete! This supplier has purchase records in your system." 
            });
        }

        // Real delete ki jagah aap 'is_deleted' flag bhi use kar sakte ho agar table mein column hai.
        // Filhaal main Hard Delete de raha hoon:
        const [result] = await db.execute('DELETE FROM suppliers WHERE id = ? AND user_id = ?', [id, user_id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ status: false, message: "Supplier not found!" });
        }

        return res.status(200).json({ status: true, message: "Supplier Deleted Successfully!" });

    } catch (error) {
        console.error("Delete Supplier Error:", error);
        return res.status(500).json({ status: false, message: "Server Error", error: error.message });
    }
};

