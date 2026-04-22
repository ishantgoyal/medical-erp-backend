const db = require('../config/db');

exports.addSales = async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const user_id = req.user_id;

        let { patient_name, patient_mobile, doctor_name, bill_date, items } = req.body;
        if (typeof items === 'string') { items = JSON.parse(items); }

        if (!items || items.length === 0) throw new Error("Medicine list is empty!");

        const invoice_no = `INV-${Date.now()}`;
        let total_taxable = 0, total_gst = 0, grand_total = 0;

        // --- STEP 1: Pehle Sales Header Insert Karo (Taaki ID mil jaye) ---
        const [salesResult] = await connection.execute(
            `INSERT INTO sales (user_id, invoice_no, patient_name, patient_mobile, doctor_name, bill_date, total_amount, total_gst, grand_total) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [user_id, invoice_no, patient_name, patient_mobile || null, doctor_name || null, bill_date, 0, 0, 0]
        );

        const salesId = salesResult.insertId; // Ab humare paas pakki Sales ID hai

        // --- STEP 2: Ab Items Loop Karo aur Insert Karo ---
        for (const item of items) {
            const product_id = item.product_id;
            const qty = parseFloat(item.qty || 0);
            const rate = parseFloat(item.rate || 0);
            const gstPer = parseFloat(item.gst || 0);
            const discPer = parseFloat(item.discount_percent || 0);

            const itemNet = qty * rate;
            const taxable = itemNet / (1 + (gstPer / 100));
            const gstAmt = itemNet - taxable;

            total_taxable += taxable;
            total_gst += gstAmt;
            grand_total += itemNet;

            let finalExp = item.db_expiry || item.expiry_date || null;
            if (!finalExp && item.expiry && item.expiry.includes('/')) {
                const [mm, yy] = item.expiry.split('/');
                finalExp = `20${yy}-${mm}-01`;
            }

            // Ab salesId null nahi jayega
            await connection.execute(
                `INSERT INTO sales_items (
                    sales_id, user_id, product_id, medicine_name, product_type, pack, hsn, batch_no, 
                    expiry_date, quantity, mrp, rate, discount_percent, gst_percent, 
                    taxable_value, gst_amount, net_amount
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    salesId, user_id, product_id, item.medicine_name, item.product_type || null,
                    item.pack || null, item.hsn || null, item.batch_no, finalExp, qty,
                    item.mrp || 0, rate, discPer, gstPer,
                    taxable.toFixed(2), gstAmt.toFixed(2), itemNet.toFixed(2)
                ]
            );

            // Stock Deduction
            const [stockUpdate] = await connection.execute(
                `UPDATE stock 
                 SET current_qty = current_qty - ? 
                 WHERE product_id = ? AND batch_no = ? AND user_id = ? AND current_qty >= ?`,
                [qty, product_id, item.batch_no, user_id, qty]
            );

            if (stockUpdate.affectedRows === 0) {
                throw new Error(`Stock mismatch or insufficient for: ${item.medicine_name}`);
            }
        }

        // --- STEP 3: Header Update (Final Totals ke saath) ---
        await connection.execute(
            `UPDATE sales SET total_amount = ?, total_gst = ?, grand_total = ? WHERE id = ?`,
            [total_taxable.toFixed(2), total_gst.toFixed(2), grand_total.toFixed(2), salesId]
        );

        await connection.commit();
        res.status(200).json({
            status: true, message: "Bill generated!", invoice_no,
            sale_id: salesId
        });

    } catch (error) {
        if (connection) await connection.rollback();
        res.status(500).json({ status: false, message: error.message });
    } finally {
        if (connection) connection.release();
    }
};



// 2. SEARCH STOCK (Added product_id, pack, conv for Sales screen)
// exports.searchStockForSales = async (req, res) => {
//     try {
//         const user_id = req.user_id;
//         const [rows] = await db.execute(
//             `SELECT id AS stock_id, product_id, medicine_name, batch_no, expiry_date, 
//                     current_qty, mrp, purchase_rate, gst_percent, hsn, product_type, pack, conv 
//              FROM stock 
//              WHERE user_id = ? AND current_qty > 0 AND expiry_date > CURRENT_DATE`,
//             [user_id]
//         );
//         res.status(200).json({ status: true, data: rows });
//     } catch (error) {
//         res.status(500).json({ status: false, message: error.message });
//     }
// };

exports.searchStockForSales = async (req, res) => {
    try {
        const user_id = req.user_id;
        const search = req.query.search || '';

        // Search query empty hai toh early return
        if (!search.trim()) {
            return res.status(400).json({ status: false, message: "Search query required hai" });
        }

        const [rows] = await db.execute(
            `SELECT id AS stock_id, product_id, medicine_name, batch_no, expiry_date, 
                    current_qty, mrp, purchase_rate, gst_percent, hsn, product_type, pack, conv 
             FROM stock 
             WHERE user_id = ? 
               AND current_qty > 0 
               AND expiry_date > CURRENT_DATE
               AND medicine_name LIKE ?`,
            [user_id, `%${search.trim()}%`]
        );

        res.status(200).json({ status: true, data: rows });

    } catch (error) {
        res.status(500).json({ status: false, message: error.message });
    }
};

// 3. DELETE/CANCEL SALES (Stock Reversal by Product ID)
exports.deleteSales = async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const { id } = req.params;
        const user_id = req.user_id;

        const [items] = await connection.execute(
            `SELECT product_id, batch_no, quantity FROM sales_items WHERE sales_id = ? AND user_id = ?`, [id, user_id]
        );

        for (const item of items) {
            await connection.execute(
                `UPDATE stock SET current_qty = current_qty + ? 
                 WHERE product_id = ? AND batch_no = ? AND user_id = ?`,
                [item.quantity, item.product_id, item.batch_no, user_id]
            );
        }

        await connection.execute(`UPDATE sales SET is_deleted = 1 WHERE id = ? AND user_id = ?`, [id, user_id]);

        await connection.commit();
        res.status(200).json({ status: true, message: "Bill cancelled and stock restored!" });
    } catch (error) {
        if (connection) await connection.rollback();
        res.status(500).json({ status: false, message: error.message });
    } finally {
        if (connection) connection.release();
    }
};


exports.updateSales = async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const { id } = req.params;
        const user_id = req.user_id;

        // MULTER SUPPORT: req.body se data uthayenge
        let { patient_name, patient_mobile, doctor_name, bill_date, items } = req.body;
        if (typeof items === 'string') items = JSON.parse(items);

        // --- STEP 1: Purana Stock Wapas Karo (Using product_id for Accuracy) ---
        const [oldItems] = await connection.execute(
            `SELECT product_id, batch_no, quantity FROM sales_items WHERE sales_id = ? AND user_id = ?`,
            [id, user_id]
        );

        for (const oldItem of oldItems) {
            await connection.execute(
                `UPDATE stock SET current_qty = current_qty + ? 
                 WHERE product_id = ? AND batch_no = ? AND user_id = ?`,
                [oldItem.quantity, oldItem.product_id, oldItem.batch_no, user_id]
            );
        }

        // --- STEP 2: Purane Items Delete Karo ---
        await connection.execute(`DELETE FROM sales_items WHERE sales_id = ? AND user_id = ?`, [id, user_id]);

        // --- STEP 3: Nayi Calculations & Items Insertion ---
        let total_taxable = 0, total_gst = 0, grand_total = 0;

        for (const item of items) {
            const product_id = item.product_id; // Frontend se aane wali Master ID
            const qty = parseFloat(item.qty || 0);
            const rate = parseFloat(item.rate || 0);
            const gstPer = parseFloat(item.gst || 0);

            const itemNet = qty * rate;
            const taxable = itemNet / (1 + (gstPer / 100));
            const gstAmt = itemNet - taxable;

            total_taxable += taxable;
            total_gst += gstAmt;
            grand_total += itemNet;

            let finalExp = item.expiry_date || item.expiry;
            if (finalExp && finalExp.includes('/')) {
                const [mm, yy] = finalExp.split('/');
                finalExp = `20${yy}-${mm}-01`;
            }

            // Insert New Items with product_id
            await connection.execute(
                `INSERT INTO sales_items (
                    sales_id, user_id, product_id, medicine_name, product_type, pack, hsn, batch_no, 
                    expiry_date, quantity, mrp, rate, discount_percent, gst_percent, 
                    taxable_value, gst_amount, net_amount
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    id, user_id, product_id, item.medicine_name, item.product_type || null,
                    item.pack || null, item.hsn || null, item.batch_no, finalExp, qty,
                    item.mrp || 0, rate, item.discount_percent || 0, gstPer,
                    taxable.toFixed(2), gstAmt.toFixed(2), itemNet.toFixed(2)
                ]
            );

            // Stock Minus with Strict product_id Check
            const [stockUpdate] = await connection.execute(
                `UPDATE stock SET current_qty = current_qty - ? 
                 WHERE product_id = ? AND batch_no = ? AND user_id = ? AND current_qty >= ?`,
                [qty, product_id, item.batch_no, user_id, qty]
            );

            if (stockUpdate.affectedRows === 0) {
                throw new Error(`Insufficient stock for ${item.medicine_name} (Batch: ${item.batch_no}) during update.`);
            }
        }

        // --- STEP 4: Main Sales Header Update ---
        await connection.execute(
            `UPDATE sales SET patient_name=?, patient_mobile=?, doctor_name=?, bill_date=?, total_amount=?, total_gst=?, grand_total=? 
             WHERE id=? AND user_id=?`,
            [patient_name, patient_mobile || null, doctor_name || null, bill_date, total_taxable.toFixed(2), total_gst.toFixed(2), grand_total.toFixed(2), id, user_id]
        );

        await connection.commit();
        res.status(200).json({ status: true, message: "Bill updated and stock adjusted!" });

    } catch (error) {
        if (connection) await connection.rollback();
        console.error("❌ Update Sales Error:", error.message);
        res.status(500).json({ status: false, message: error.message });
    } finally {
        if (connection) connection.release();
    }
};

exports.getSalesList = async (req, res) => {
    try {
        const user_id = req.user_id;
        const query = `
            SELECT 
                s.id AS id, 
                s.id AS sale_id,           -- Header Sale ID
                s.user_id,
                s.invoice_no, 
                s.patient_name, 
                s.patient_mobile, 
                s.doctor_name, 
                s.bill_date, 
                s.grand_total,
                (
                    SELECT JSON_ARRAYAGG(
                        JSON_OBJECT(
                            'id', si.id,               -- Item ki unique ID
                            'sale_id', si.sales_id,    -- Parent Sale ID
                            'product_id', si.product_id, -- Asli Product ID
                            'medicine_name', si.medicine_name,
                            'quantity', si.quantity,
                            'rate', si.rate,
                            'batch_no', si.batch_no,
                            'expiry_date', si.expiry_date,
                            'net_amount', si.net_amount
                        )
                    ) 
                    FROM sales_items si 
                    WHERE si.sales_id = s.id AND si.user_id = s.user_id
                ) AS items
            FROM sales s
            WHERE s.user_id = ? AND s.is_deleted = 0
            ORDER BY s.created_at DESC
        `;

        const [rows] = await db.execute(query, [user_id]);
        res.status(200).json({ status: true, data: rows });
    } catch (error) {
        res.status(500).json({ status: false, message: error.message });
    }
};


//------------------------------------------------------------------
// now no use for project but keep it for reference
// 2. GET SALES DETAIL
exports.getSalesDetail = async (req, res) => {
    try {
        const { id } = req.params;
        const user_id = req.user_id;

        const [header] = await db.execute(
            `SELECT * FROM sales WHERE id = ? AND user_id = ? AND is_deleted = 0`, // is_deleted check zaroori hai
            [id, user_id]
        );

        if (header.length === 0) return res.status(404).json({ status: false, message: "Bill not found" });

        // Security Fixed: Yahan user_id add karna bahut zaroori tha
        const [items] = await db.execute(
            `SELECT * FROM sales_items WHERE sales_id = ? AND user_id = ?`,
            [id, user_id]
        );

        res.status(200).json({ status: true, header: header[0], items });
    } catch (error) {
        res.status(500).json({ status: false, message: error.message });
    }
};









