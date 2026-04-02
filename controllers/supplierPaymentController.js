const db = require('../config/db'); 

exports.addPayment = async (req, res) => {
    try {
        const { supplier_id, payment_date, amount, payment_mode, remarks } = req.body;
        const user_id = req.user_id; 

        if (!supplier_id || !amount || !payment_date) {
            return res.status(400).json({ 
                status: false, 
                message: "Supplier, Date aur Amount is required !" 
            });
        }

        const [result] = await db.execute(
            `INSERT INTO supplier_payments (user_id, supplier_id, payment_date, amount, payment_mode, remarks) 
             VALUES (?, ?, ?, ?, ?, ?)`,
            [user_id, supplier_id, payment_date, amount, payment_mode, remarks]
        );

        return res.status(200).json({
            status: true,
            message: "Payment Saved Successfully!",
            paymentId: result.insertId
        });
    } catch (error) {
        console.error("Payment Save Error:", error);
        return res.status(500).json({ status: false, message: "Error saving payment" });
    }
};