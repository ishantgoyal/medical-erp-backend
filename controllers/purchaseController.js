const db = require('../config/db');

// 1. ADD PURCHASE
exports.addPurchase = async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const user_id = req.user_id;
        let { supplier_name, invoice_no, purchase_date, items } = req.body;

        if (typeof items === 'string') { items = JSON.parse(items); }

        // Supplier Handling
        let supplier_id = null;
        const [suppResult] = await connection.execute(
            'SELECT id FROM suppliers WHERE name = ? AND user_id = ?',
            [supplier_name, user_id]
        );

        if (suppResult.length > 0) {
            supplier_id = suppResult[0].id;
        } else {
            const [newSupp] = await connection.execute(
                'INSERT INTO suppliers (name, user_id) VALUES (?, ?)',
                [supplier_name, user_id]
            );
            supplier_id = newSupp.insertId;
        }

        let totalBasicAmount = 0, totalGstAmount = 0, totalNetAmount = 0;

        const processedItems = items.map(item => {
            // Frontend keys (quantity, purchase_rate, discount_percent, gst_percent)
            const qty = parseFloat(item.quantity || 0);
            const rate = parseFloat(item.purchase_rate || 0);
            const discPer = parseFloat(item.discount_percent || 0);
            const gstPer = parseFloat(item.gst_percent || 0);

            const gross = rate * qty;
            const discAmt = (gross * discPer) / 100;
            const taxable = gross - discAmt;
            const gstAmt = (taxable * gstPer) / 100;
            const netItemAmount = taxable + gstAmt;

            totalBasicAmount += taxable;
            totalGstAmount += gstAmt;
            totalNetAmount += netItemAmount;

            let finalExp = item.expiry_date;
            if (item.expiry_date && item.expiry_date.includes('/')) {
                const [mm, yy] = item.expiry_date.split('/');
                finalExp = `20${yy}-${mm}-01`;
            }

            return {
                ...item,
                qty, rate, discPer, gstPer, taxable,
                iNet: netItemAmount.toFixed(2),
                finalExp: finalExp || null
            };
        });

        // Insert Purchase Header
        const [purchaseResult] = await connection.execute(
            `INSERT INTO purchases (user_id, supplier_id, invoice_no, purchase_date, total_amount, gst_amount, net_amount, is_deleted) 
             VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
            [user_id, supplier_id, invoice_no, purchase_date, totalBasicAmount.toFixed(2), totalGstAmount.toFixed(2), totalNetAmount.toFixed(2)]
        );
        const purchaseId = purchaseResult.insertId;

        // Insert Items and Update Stock
        for (const item of processedItems) {
            // SYNCED COLUMN NAMES: pack, conv
            await connection.execute(
                `INSERT INTO purchase_items (
                    purchase_id, user_id, product_id, medicine_name, product_type, pack, hsn, conv, 
                    batch_no, expiry_date, quantity, mrp, purchase_rate, discount_percent, gst_percent, net_amount
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    purchaseId, user_id, item.product_id, item.medicine_name,
                    item.product_type, item.pack, item.hsn, item.conv || 1,
                    item.batch_no, item.finalExp, item.qty, item.mrp || 0,
                    item.rate, item.discPer, item.gstPer, item.iNet
                ]
            );

            // Stock Update logic using product_id
            const [existing] = await connection.execute(
                'SELECT id FROM stock WHERE product_id = ? AND batch_no = ? AND user_id = ?',
                [item.product_id, item.batch_no, user_id]
            );

            if (existing.length > 0) {
                await connection.execute(
                    `UPDATE stock SET 
                        current_qty = current_qty + ?, 
                        mrp = ?, purchase_rate = ?, expiry_date = ?, 
                        product_type = ?, pack = ?, hsn = ?, conv = ?,
                        gst_percent = ?, medicine_name = ?
                     WHERE id = ?`,
                    [item.qty, item.mrp || 0, item.rate, item.finalExp, item.product_type, item.pack, item.hsn, item.conv || 1, item.gstPer, item.medicine_name, existing[0].id]
                );
            } else {
                await connection.execute(
                    `INSERT INTO stock (user_id, product_id, medicine_name, product_type, pack, hsn, conv, batch_no, expiry_date, current_qty, mrp, purchase_rate, gst_percent, discount_percent) 
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        user_id, item.product_id, item.medicine_name, item.product_type, item.pack,
                        item.hsn, item.conv || 1, item.batch_no, item.finalExp,
                        item.qty, item.mrp || 0, item.rate, item.gstPer, item.discPer
                    ]
                );
            }
        }

        await connection.commit();
        res.status(200).json({ status: true, message: "Purchase saved and stock updated!", purchase_id: purchaseId });

    } catch (error) {
        if (connection) await connection.rollback();
        res.status(500).json({ status: false, message: error.message });
    } finally {
        if (connection) connection.release();
    }
};

// 2. SEARCH MEDICINE (With all keys for Autofill)
exports.searchMedicine = async (req, res) => {
    try {
        const { term } = req.query;
        // SYNCED COLUMN NAMES: product_type, hsn, pack, conv, mrp, purchase_rate
        const [rows] = await db.execute(`
            SELECT 
                id, medicine_name, product_type, hsn, pack, conv, 
                gst_percent, mrp, purchase_rate, discount_percent, company_name
            FROM products 
            WHERE user_id = ? AND is_deleted = 0 AND medicine_name LIKE ? 
            LIMIT 20`,
            [req.user_id, `%${term}%`]
        );
        res.status(200).json({ status: true, data: rows });
    } catch (error) {
        res.status(500).json({ status: false, message: "Search Error: " + error.message });
    }
};

// 3. DELETE PURCHASE (Corrected Reversal)
exports.deletePurchase = async (req, res) => {
    const { id } = req.params;
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const user_id = req.user_id;

        const [items] = await connection.execute(
            'SELECT product_id, medicine_name, batch_no, quantity FROM purchase_items WHERE purchase_id = ? AND user_id = ?',
            [id, user_id]
        );

        for (const item of items) {
            const [stockUpdate] = await connection.execute(
                `UPDATE stock 
                 SET current_qty = current_qty - ? 
                 WHERE product_id = ? AND batch_no = ? AND user_id = ? AND current_qty >= ?`,
                [item.quantity, item.product_id, item.batch_no, user_id, item.quantity]
            );

            if (stockUpdate.affectedRows === 0 && item.quantity > 0) {
                throw new Error(`Cannot delete! '${item.medicine_name}' is sold or stock mismatch.`);
            }
        }

        await connection.execute(
            'UPDATE purchases SET is_deleted = 1 WHERE id = ? AND user_id = ?',
            [id, user_id]
        );

        await connection.commit();
        res.status(200).json({ status: true, message: "Purchase deleted successfully!" });
    } catch (e) {
        if (connection) await connection.rollback();
        res.status(500).json({ status: false, message: e.message });
    } finally {
        if (connection) connection.release();
    }
};

exports.updatePurchase = async (req, res) => {
    const { id } = req.params;
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();
        const user_id = req.user_id;

        // --- MULTER SUPPORT: req.body se data uthayenge ---
        let { supplier_id, invoice_no, purchase_date, items } = req.body;

        if (typeof items === 'string') items = JSON.parse(items);

        // --- STEP 1: VALIDATION & REVERSAL (Purana Stock Wapas Karo) ---
        // Yahan 'quantity' column name DB ke hisab se check kar lena
        const [oldItems] = await connection.execute(
            'SELECT product_id, medicine_name, batch_no, quantity FROM purchase_items WHERE purchase_id = ? AND user_id = ?',
            [id, user_id]
        );

        for (const old of oldItems) {
            const [currentStock] = await connection.execute(
                'SELECT id, current_qty FROM stock WHERE product_id = ? AND batch_no = ? AND user_id = ?',
                [old.product_id, old.batch_no, user_id]
            );

            const availableQty = currentStock[0]?.current_qty || 0;

            // Agar dawai bik chuki hai toh update nahi karne denge
            if (availableQty < old.quantity) {
                throw new Error(`Cannot update! '${old.medicine_name}' (Batch: ${old.batch_no}) is already sold. Available stock (${availableQty}) is less than original purchase (${old.quantity}).`);
            }

            // Purana stock minus karo taaki naya stock add ho sake
            await connection.execute(
                'UPDATE stock SET current_qty = current_qty - ? WHERE product_id = ? AND batch_no = ? AND user_id = ?',
                [old.quantity || 0, old.product_id, old.batch_no, user_id]
            );
        }

        // --- STEP 2: DELETE OLD PURCHASE ITEMS ---
        await connection.execute('DELETE FROM purchase_items WHERE purchase_id = ? AND user_id = ?', [id, user_id]);

        // --- STEP 3: DATA PROCESSING (Naye calculations) ---
        let totalBasic = 0, totalGst = 0, totalNet = 0;
        const processedItems = items.map(item => {
            const qty = parseFloat(item.quantity) || 0;
            const rate = parseFloat(item.purchase_rate) || 0;
            const discPer = parseFloat(item.discount_percent) || 0;
            const gstPer = parseFloat(item.gst_percent) || 0;

            const taxable = (rate * qty) - ((rate * qty * discPer) / 100);
            const gstAmt = (taxable * gstPer) / 100;
            const netItemAmount = taxable + gstAmt;

            totalBasic += taxable;
            totalGst += gstAmt;
            totalNet += netItemAmount;

            let finalExp = item.expiry_date;
            if (item.expiry_date && item.expiry_date.includes('/')) {
                const [mm, yy] = item.expiry_date.split('/');
                finalExp = `20${yy}-${mm}-01`;
            }

            return {
                ...item,
                qty, rate, discPer, gstPer, taxable,
                iNet: netItemAmount.toFixed(2),
                finalExp: finalExp || null
            };
        });

        // --- STEP 4: UPDATE PURCHASE HEADER ---
        await connection.execute(
            `UPDATE purchases SET supplier_id = ?, invoice_no = ?, purchase_date = ?, total_amount = ?, gst_amount = ?, net_amount = ? 
             WHERE id = ? AND user_id = ?`,
            [supplier_id || null, invoice_no || '', purchase_date || null, totalBasic.toFixed(2), totalGst.toFixed(2), totalNet.toFixed(2), id, user_id]
        );

        // --- STEP 5: INSERT NEW ITEMS & UPDATE STOCK (Schema Sync) ---
        for (const item of processedItems) {
            if (!item.product_id) {
                throw new Error(`Item '${item.medicine_name}' has no Product ID. Please select from Master.`);
            }

            // Insert into items using NEW SCHEMA: pack, conv
            await connection.execute(
                `INSERT INTO purchase_items (
                    purchase_id, user_id, product_id, medicine_name, product_type, pack, hsn, conv, 
                    batch_no, expiry_date, quantity, mrp, purchase_rate, discount_percent, gst_percent, net_amount
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [id, user_id, item.product_id, item.medicine_name, item.product_type, item.pack, item.hsn, item.conv || 1, item.batch_no, item.finalExp, item.qty, item.mrp || 0, item.rate, item.discPer, item.gstPer, item.iNet]
            );

            // Update/Insert Stock using NEW SCHEMA: pack, conv
            const [exists] = await connection.execute(
                'SELECT id FROM stock WHERE product_id = ? AND batch_no = ? AND user_id = ?',
                [item.product_id, item.batch_no, user_id]
            );

            if (exists.length > 0) {
                await connection.execute(
                    `UPDATE stock SET 
                        current_qty = current_qty + ?, 
                        product_type = ?, pack = ?, hsn = ?, conv = ?, 
                        expiry_date = ?, mrp = ?, purchase_rate = ?, 
                        discount_percent = ?, gst_percent = ?, medicine_name = ? 
                     WHERE id = ?`,
                    [item.qty, item.product_type, item.pack, item.hsn, item.conv || 1, item.finalExp, item.mrp || 0, item.rate, item.discPer, item.gstPer, item.medicine_name, exists[0].id]
                );
            } else {
                await connection.execute(
                    `INSERT INTO stock (
                        user_id, product_id, medicine_name, product_type, pack, hsn, conv, 
                        batch_no, expiry_date, current_qty, mrp, purchase_rate, gst_percent, discount_percent
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [user_id, item.product_id, item.medicine_name, item.product_type, item.pack, item.hsn, item.conv || 1, item.batch_no, item.finalExp, item.qty, item.mrp || 0, item.rate, item.gstPer, item.discPer]
                );
            }
        }

        await connection.commit();
        res.status(200).json({ status: true, message: "Purchase and Stock updated correctly!" });

    } catch (e) {
        if (connection) await connection.rollback();
        console.error("❌ Update Error:", e.message);
        res.status(500).json({ status: false, message: e.message });
    } finally {
        if (connection) connection.release();
    }
};

// 1. GET PURCHASE LIST
exports.getPurchaseList = async (req, res) => {
    try {
        const user_id = req.user_id;
        const query = `
            SELECT 
                p.*, 
                s.name AS supplier_name,
                (
                    SELECT JSON_ARRAYAGG(
                        JSON_OBJECT(
                            'id', pi.id,
                            'purchase_id', pi.purchase_id,
                            'product_id', pi.product_id,
                            'medicine_name', pi.medicine_name,
                            'product_type', pi.product_type,
                            'pack', pi.pack,              
                            'hsn', pi.hsn,               
                            'conv', pi.conv,              
                            'batch_no', pi.batch_no,
                            'expiry_date', pi.expiry_date, 
                            'quantity', pi.quantity,
                            'mrp', pi.mrp,
                            'purchase_rate', pi.purchase_rate,
                            'discount_percent', pi.discount_percent,
                            'gst_percent', pi.gst_percent,
                            'net_amount', pi.net_amount
                        )
                    ) 
                    FROM purchase_items pi 
                    WHERE pi.purchase_id = p.id AND pi.user_id = p.user_id
                ) AS items
            FROM purchases p
            LEFT JOIN suppliers s ON p.supplier_id = s.id
            WHERE p.user_id = ? AND p.is_deleted = 0
            ORDER BY p.id DESC
        `;

        const [rows] = await db.execute(query, [user_id]);
        res.status(200).json({ status: true, data: rows });
    } catch (error) {
        res.status(500).json({ status: false, message: error.message });
    }
};

// 2. GET PURCHASE BY ID (Edit ke liye data fetch karna)
exports.getPurchaseById = async (req, res) => {
    try {
        const { id } = req.params;
        const user_id = req.user_id;

        const [rows] = await db.execute(`
            SELECT p.*, s.name as supplier_name 
            FROM purchases p 
            LEFT JOIN suppliers s ON p.supplier_id = s.id 
            WHERE p.id = ? AND p.user_id = ?`,
            [id, user_id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ status: false, message: "Purchase record nahi mila." });
        }

        const [items] = await db.execute(
            `SELECT 
                id,
                 product_id,
                 medicine_name,
                 product_type, 
                pack ,        
                hsn, 
                conv ,     
                batch_no, 
                expiry_date, 
                quantity , 
                mrp,
                purchase_rate , 
                discount_percent,
                gst_percent ,
                 net_amount 
             FROM purchase_items 
             WHERE purchase_id = ? AND user_id = ?`,
            [id, user_id]
        );

        res.status(200).json({
            status: true,
            data: {
                ...rows[0],
                items: items
            }
        });

    } catch (e) {
        res.status(500).json({ status: false, message: "Server error: " + e.message });
    }
};









