// controllers/purchaseOrderController.js
const db = require('../config/db');

// ─────────────────────────────────────────────
// API 1: Create Order + Save + WhatsApp link


// ─────────────────────────────────────────────
exports.createOrder = async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const user_id = req.user_id;
        let { supplier_id, items } = req.body;

        // Validation
        if (!supplier_id) {
            return res.status(400).json({ status: false, message: "Please select a supplier" });
        }
        if (!items || items.length === 0) {
            return res.status(400).json({ status: false, message: "Add at least 1 medicine" });
        }

        // Supplier fetch
        const [supplierRows] = await connection.execute(
            `SELECT id, name, mobile, gst_number FROM suppliers WHERE id = ? AND user_id = ?`,
            [supplier_id, user_id]
        );
        if (!supplierRows.length) {
            return res.status(404).json({ status: false, message: "Supplier not found" });
        }
        const supplier = supplierRows[0];

        if (!supplier.mobile) {
            return res.status(400).json({ status: false, message: "This supplier has no mobile number" });
        }

        // Shop info
        const [shopRows] = await connection.execute(
            `SELECT shop_name, mobile, gst_number FROM users WHERE id = ?`,
            [user_id]
        );
        const shop = shopRows[0] || {};

        // Save order header
        const today = new Date().toISOString().split('T')[0];
        const [orderResult] = await connection.execute(
            `INSERT INTO purchase_orders (user_id, supplier_id, order_date, total_items, status)
             VALUES (?, ?, ?, ?, 'sent')`,
            [user_id, supplier_id, today, items.length]
        );
        const orderId = orderResult.insertId;

        // Save order items
        for (const item of items) {
            await connection.execute(
                `INSERT INTO purchase_order_items (purchase_order_id, user_id, medicine_name, qty)
                 VALUES (?, ?, ?, ?)`,
                [orderId, user_id, item.medicine_name, item.qty || 1]
            );
        }

        await connection.commit();

        // Build WhatsApp message
        const dateStr = new Date().toLocaleDateString('en-IN', {
            day: '2-digit', month: 'short', year: 'numeric'
        });

        let itemLines = '';
        items.forEach((item, idx) => {
            itemLines += `${idx + 1}. ${item.medicine_name} — Qty: ${item.qty || 1}\n`;
        });

        const message =
            `*Purchase Order #${orderId}*\n` +
            `━━━━━━━━━━━━━━━━━━\n` +
            `🏪 *${shop.shop_name || 'Medical Store'}*\n` +
            `📅 Date: ${dateStr}\n` +
            `━━━━━━━━━━━━━━━━━━\n\n` +
            `Dear *${supplier.name}*,\n\n` +
            `Please arrange the following medicines:\n\n` +
            `${itemLines}\n` +
            `━━━━━━━━━━━━━━━━━━\n` +
            `Total Items: ${items.length}\n` +
            (shop.gst_number ? `GST No: ${shop.gst_number}\n` : '') +
            `\nKindly confirm the order and delivery date.\n\n` +
            `Thank you 🙏`;

        // WhatsApp link
        const mobile   = supplier.mobile.replace(/\D/g, '');
        const waNumber = mobile.startsWith('91') ? mobile : `91${mobile}`;
        const waLink   = `https://wa.me/${waNumber}?text=${encodeURIComponent(message)}`;

        return res.status(200).json({
            status: true,
            message: "Order saved successfully",
            order_id: orderId,
            whatsapp_link: waLink,
            supplier_name: supplier.name,
            total_items: items.length
        });

    } catch (error) {
        await connection.rollback();
        console.error('Create Order Error:', error.message);
        return res.status(500).json({ status: false, message: error.message });
    } finally {
        connection.release();
    }
};

// ─────────────────────────────────────────────
// API 2: Order list — history
// GET /api/purchase-order/list
// ─────────────────────────────────────────────
exports.getOrderList = async (req, res) => {
    try {
        const user_id = req.user_id;

        const [rows] = await db.execute(
            `SELECT 
                po.id,
                po.order_date,
                po.total_items,
                po.status,
                po.created_at,
                s.name AS supplier_name,
                s.mobile AS supplier_mobile
             FROM purchase_orders po
             JOIN suppliers s ON s.id = po.supplier_id
             WHERE po.user_id = ?
             ORDER BY po.created_at DESC`,
            [user_id]
        );

        return res.status(200).json({
            status: true,
            message: "Order list fetched",
            data: rows
        });

    } catch (error) {
        console.error('Order List Error:', error.message);
        return res.status(500).json({ status: false, message: error.message });
    }
};

// ─────────────────────────────────────────────
// API 3: Order detail — ek order ki items
// GET /api/purchase-order/detail/:id
// ─────────────────────────────────────────────
exports.getOrderDetail = async (req, res) => {
    try {
        const user_id  = req.user_id;
        const order_id = req.params.id;

        // Order header
        const [orderRows] = await db.execute(
            `SELECT 
                po.id,
                po.order_date,
                po.total_items,
                po.status,
                po.created_at,
                s.name    AS supplier_name,
                s.mobile  AS supplier_mobile,
                s.gst_number AS supplier_gst
             FROM purchase_orders po
             JOIN suppliers s ON s.id = po.supplier_id
             WHERE po.id = ? AND po.user_id = ?`,
            [order_id, user_id]
        );

        if (!orderRows.length) {
            return res.status(404).json({ status: false, message: "Order not found" });
        }

        // Order items
        const [itemRows] = await db.execute(
            `SELECT id, medicine_name, qty
             FROM purchase_order_items
             WHERE purchase_order_id = ? AND user_id = ?`,
            [order_id, user_id]
        );

        return res.status(200).json({
            status: true,
            message: "Order detail fetched",
            data: {
                order: orderRows[0],
                items: itemRows
            }
        });

    } catch (error) {
        console.error('Order Detail Error:', error.message);
        return res.status(500).json({ status: false, message: error.message });
    }
};

