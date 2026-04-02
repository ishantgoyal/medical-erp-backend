const db = require('../config/db'); 

exports.getSupplierLedger = async (req, res) => {
    try {
        const { supplier_id, from_date, to_date } = req.body;
         const user_id = req.user_id;  

        if (!supplier_id) {
            return res.status(400).json({ status: false, message: "Supplier ID is required" });
        }

     
        let sql = `
            SELECT * FROM (
                SELECT 
                    id,
                    purchase_date as date, 
                    CONCAT('Purchase Invoice: ', IFNULL(invoice_no, 'N/A')) as particulars, 
                    'BILL' as type,
                    0 as debit, 
                    net_amount as credit,  -- FIXED: net_amount use kiya table se
                    created_at
                FROM purchases 
                WHERE supplier_id = ? AND user_id = ? AND is_deleted = 0

                UNION ALL

                SELECT 
                    id,
                    payment_date as date, 
                    CONCAT('Paid via ', payment_mode, ' ', IFNULL(remarks, '')) as particulars, 
                    'PAYMENT' as type,
                    amount as debit, 
                    0 as credit,
                    created_at
                FROM supplier_payments 
                WHERE supplier_id = ? AND user_id = ?
            ) AS ledger_table
        `;

        let params = [supplier_id, user_id, supplier_id, user_id];

        // Date Filter logic
        if (from_date && to_date) {
            sql += ` WHERE date BETWEEN ? AND ? `;
            params.push(from_date, to_date);
        }

        // Order zaroori hai running balance ke liye
        sql += ` ORDER BY date ASC, created_at ASC`;

        // Database execution (Make sure 'db' is your pool connection)
        const [rows] = await db.execute(sql, params);

        let runningBalance = 0;
        const finalData = rows.map(row => {
            // Formula: Previous + Bill(Credit) - Payment(Debit)
            runningBalance = Number(runningBalance) + Number(row.credit) - Number(row.debit);
            return { 
                ...row, 
                balance: Number(runningBalance).toFixed(2) 
            };
        });

        return res.status(200).json({
            status: true,
            message: "Ledger fetched successfully",
            data: finalData,
            totalOutstanding: Number(runningBalance).toFixed(2) 
        });

    } catch (error) {
        console.error("Ledger Error:", error);
        return res.status(500).json({ 
            status: false, 
            message: "Database Error: " + error.message 
        });
    }
};