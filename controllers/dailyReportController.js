// controllers/dailyReportController.js
const db = require('../config/db');

// ─────────────────────────────────────────────
// HELPER: Ek user ka poora daily report data
// Dashboard controller jaisa hi pattern
// ─────────────────────────────────────────────
const getDailyReportData = async (user_id) => {

    // 1. Today sales + profit — dashboard jaisa
    const [salesData] = await db.execute(
        `SELECT 
            IFNULL(COUNT(DISTINCT s.id), 0)                                    AS total_bills,
            IFNULL(SUM(s.grand_total), 0)                                      AS total_sale,
            IFNULL(SUM(s.total_gst), 0)                                        AS total_gst,
            IFNULL(SUM((si.rate - st.purchase_rate) * si.quantity), 0)        AS approx_profit
         FROM sales s
         JOIN sales_items si ON s.id = si.sales_id
         JOIN stock st ON si.product_id = st.product_id
         WHERE s.user_id = ?
           AND DATE(s.bill_date) = CURDATE()
           AND s.is_deleted = 0`,
        [user_id]
    );

    // 2. Low stock — dashboard jaisa
    const [lowStockRows] = await db.execute(
        `SELECT p.medicine_name, s.batch_no, s.current_qty AS stock
         FROM stock s
         JOIN products p ON s.product_id = p.id
         WHERE s.user_id = ?
           AND s.current_qty <= p.reorder_level
           AND s.current_qty > 0
         ORDER BY s.current_qty ASC
         LIMIT 10`,
        [user_id]
    );

    // 3. Expiry near — dashboard jaisa (90 din)
    const [expiryRows] = await db.execute(
        `SELECT p.medicine_name, s.batch_no, s.expiry_date,
                DATEDIFF(s.expiry_date, CURDATE()) AS days_left
         FROM stock s
         JOIN products p ON s.product_id = p.id
         WHERE s.user_id = ?
           AND s.expiry_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 90 DAY)
         ORDER BY s.expiry_date ASC
         LIMIT 10`,
        [user_id]
    );

    // 4. Supplier dues — column name 'amount' hai 'amount_paid' nahi
    const [supplierDueRows] = await db.execute(
        `SELECT 
            s.name AS supplier_name,
            IFNULL(SUM(pu.net_amount), 0) - IFNULL(
                (SELECT SUM(sp.amount)
                 FROM supplier_payments sp
                 WHERE sp.supplier_id = s.id AND sp.user_id = s.user_id), 0
            ) AS outstanding
         FROM suppliers s
         LEFT JOIN purchases pu
             ON pu.supplier_id = s.id
             AND pu.user_id = s.user_id
             AND pu.is_deleted = 0
         WHERE s.user_id = ?
         GROUP BY s.id, s.name
         HAVING outstanding > 0
         ORDER BY outstanding DESC
         LIMIT 5`,
        [user_id]
    );

    return {
        sales:         salesData[0]    || { total_bills: 0, total_sale: 0, total_gst: 0, approx_profit: 0 },
        low_stock:     lowStockRows    || [],
        expiry_near:   expiryRows      || [],
        supplier_dues: supplierDueRows || []
    };
};

// ─────────────────────────────────────────────
// HELPER: WhatsApp message format
// ─────────────────────────────────────────────
const buildReportMessage = (data, shopName) => {
    const today = new Date().toLocaleDateString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric'
    });

    const { sales, low_stock, expiry_near, supplier_dues } = data;

    let msg = `🏪 *${shopName || 'Medical Store'} - Daily Report*\n`;
    msg += `📅 ${today}\n`;
    msg += `━━━━━━━━━━━━━━━━━━\n\n`;

    msg += `💰 *TODAY SALES*\n`;
    msg += `   Total Bills   : ${sales.total_bills}\n`;
    msg += `   Sale Amount   : ₹${parseFloat(sales.total_sale   || 0).toFixed(0)}\n`;
    msg += `   GST Collected : ₹${parseFloat(sales.total_gst    || 0).toFixed(0)}\n`;
    msg += `   Est. Profit   : ₹${parseFloat(sales.approx_profit|| 0).toFixed(0)}\n\n`;

    if (low_stock.length > 0) {
        msg += `⚠️ *LOW STOCK (${low_stock.length} items)*\n`;
        low_stock.forEach(item => {
            msg += `   • ${item.medicine_name} — ${item.stock} left\n`;
        });
        msg += '\n';
    } else {
        msg += `✅ *STOCK* — All good!\n\n`;
    }

    if (expiry_near.length > 0) {
        msg += `💊 *EXPIRY NEAR (${expiry_near.length} items)*\n`;
        expiry_near.forEach(item => {
            const expDate = new Date(item.expiry_date).toLocaleDateString('en-IN', {
                day: '2-digit', month: 'short', year: 'numeric'
            });
            msg += `   • ${item.medicine_name} — ${expDate} (${item.days_left} days)\n`;
        });
        msg += '\n';
    } else {
        msg += `✅ *EXPIRY* — Nothing expiring soon!\n\n`;
    }

    if (supplier_dues.length > 0) {
        msg += `💸 *SUPPLIER DUES*\n`;
        supplier_dues.forEach(s => {
            msg += `   • ${s.supplier_name} — ₹${parseFloat(s.outstanding || 0).toFixed(0)}\n`;
        });
        msg += '\n';
    }

    msg += `━━━━━━━━━━━━━━━━━━\n`;
    msg += `_Powered by RK Software_`;

    return msg;
};

// ─────────────────────────────────────────────
// API 1: Manual report
// GET /api/daily-report/send
// ─────────────────────────────────────────────
exports.sendManualReport = async (req, res) => {
    try {
        const user_id = req.user_id;

        const [shopRows] = await db.execute(
            `SELECT shop_name, mobile FROM users WHERE id = ?`,
            [user_id]
        );

        if (!shopRows.length) {
            return res.status(404).json({ status: false, message: "User nahi mila" });
        }

        const shop = shopRows[0];

        if (!shop.mobile) {
            return res.status(400).json({ status: false, message: "Account mein mobile number nahi hai" });
        }

        const data    = await getDailyReportData(user_id);
        const message = buildReportMessage(data, shop.shop_name);

        const mobile   = shop.mobile.replace(/\D/g, '');
        const waNumber = mobile.startsWith('91') ? mobile : `91${mobile}`;
        const waLink   = `https://wa.me/${waNumber}?text=${encodeURIComponent(message)}`;

        return res.status(200).json({
            status: true,
            message: "Report ready",
            whatsapp_link: waLink,
            report_data: data,
            message_preview: message
        });

    } catch (error) {
        console.error('Daily Report Error:', error.message);
        return res.status(500).json({ status: false, message: error.message });
    }
};

// ─────────────────────────────────────────────
// API 2: Sirf data — dashboard ke liye
// GET /api/daily-report/data
// ─────────────────────────────────────────────
exports.getReportData = async (req, res) => {
    try {
        const user_id = req.user_id;
        const data    = await getDailyReportData(user_id);
        return res.status(200).json({ status: true, data });
    } catch (error) {
        console.error('Report Data Error:', error.message);
        return res.status(500).json({ status: false, message: error.message });
    }
};

// ─────────────────────────────────────────────
// CRON — server.js se call hoga raat 9 baje
// ─────────────────────────────────────────────
exports.sendDailyReportToAll = async () => {
    console.log('Daily report cron started:', new Date().toLocaleString('en-IN'));
    try {
        const [users] = await db.execute(
            `SELECT id, shop_name, mobile FROM users WHERE mobile IS NOT NULL AND mobile != ''`
        );
        console.log(`Total users: ${users.length}`);

        for (const user of users) {
            try {
                const data    = await getDailyReportData(user.id);
                const message = buildReportMessage(data, user.shop_name);
                const mobile  = user.mobile.replace(/\D/g, '');
                const waNum   = mobile.startsWith('91') ? mobile : `91${mobile}`;
                const waLink  = `https://wa.me/${waNum}?text=${encodeURIComponent(message)}`;
                console.log(`✅ Report ready for: ${user.shop_name} (${user.mobile})`);
                console.log(`   WhatsApp Link: ${waLink.substring(0, 120)}...`);
            } catch (err) {
                console.error(`User ${user.id} report error:`, err.message);
            }
        }
        console.log('Daily report cron completed.');
    } catch (error) {
        console.error('Cron Error:', error.message);
    }
};
