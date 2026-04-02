const db = require('../config/db');

exports.getDashboardStats = async (req, res) => {
    try {
        const user_id = req.user_id;

        // 1. TODAY'S SALES & PROFIT
        const [salesData] = await db.execute(
            `SELECT 
                IFNULL(SUM(s.grand_total), 0) AS totalSales,
                IFNULL(SUM((si.rate - st.purchase_rate) * si.quantity), 0) AS totalProfit
             FROM sales s
             JOIN sales_items si ON s.id = si.sales_id
             JOIN stock st ON si.product_id = st.product_id 
             WHERE s.user_id = ? 
             AND DATE(s.bill_date) = CURDATE() 
             AND s.is_deleted = 0`, 
            [user_id]
        );

        const todaySales = salesData.length > 0 ? salesData[0].totalSales : 0;
        const todayProfit = salesData.length > 0 ? salesData[0].totalProfit : 0;

        // 2. LOW STOCK ALERT (Count + Details)
        const [lowStockDetails] = await db.execute(
            `SELECT p.medicine_name, s.batch_no, s.current_qty as stock
             FROM stock s
             JOIN products p ON s.product_id = p.id
             WHERE s.user_id = ? AND s.current_qty <= p.reorder_level AND s.current_qty > 0`,
            [user_id]
        );

        // 3. EXPIRY ALERTS (Count + Details for next 90 days)
        const [expiryDetails] = await db.execute(
            `SELECT p.medicine_name, s.batch_no, s.expiry_date
             FROM stock s
             JOIN products p ON s.product_id = p.id
             WHERE s.user_id = ? 
             AND s.expiry_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 90 DAY)
             ORDER BY s.expiry_date ASC`,
            [user_id]
        );

        // 4. TOP 5 SELLING MEDICINES
        const [topMedicines] = await db.execute(
            `SELECT p.medicine_name as name, SUM(si.quantity) as value 
             FROM sales_items si
             JOIN products p ON si.product_id = p.id
             WHERE si.user_id = ? 
             GROUP BY p.medicine_name ORDER BY value DESC LIMIT 5`,
            [user_id]
        );

        // 5. CATEGORY WISE SALES
        const [categorySales] = await db.execute(
            `SELECT 'General' as type, SUM(si.quantity) as value 
             FROM sales_items si
             WHERE si.user_id = ?
             GROUP BY type`,
            [user_id]
        );

        // 6. RECENT SALES
        const [recentBills] = await db.execute(
            `SELECT invoice_no, patient_name, grand_total, bill_date 
             FROM sales 
             WHERE user_id = ? AND is_deleted = 0 
             ORDER BY created_at DESC LIMIT 5`,
            [user_id]
        );

        // Frontend ko response bhejna
        res.status(200).json({
            status: true,
            data: {
                todaySales: todaySales,
                todayProfit: todayProfit,
                lowStockCount: lowStockDetails.length,
                expiryCount: expiryDetails.length,
                lowStockDetails: lowStockDetails, // Modal ke liye list
                expiryDetails: expiryDetails,     // Modal ke liye list
                topMedicines,
                categorySales,
                recentSales: recentBills
            }
        });

    } catch (error) {
        console.error("Dashboard Error:", error.message);
        res.status(500).json({ status: false, message: error.message });
    }
};