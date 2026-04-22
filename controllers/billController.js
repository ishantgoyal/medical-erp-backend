// controllers/billController.js
const PDFDocument = require('pdfkit');
const db = require('../config/db');

const getSaleData = async (saleId, userId) => {
    const [saleRows] = await db.execute(
        `SELECT 
            s.id, s.invoice_no, s.patient_name, s.patient_mobile,
            s.doctor_name, s.bill_date, s.total_amount, s.total_gst, s.grand_total,
            u.shop_name, u.shop_address, u.mobile AS shop_mobile,
            u.gst_number AS shop_gst, u.name AS owner_name
         FROM sales s
         JOIN users u ON u.id = s.user_id
         WHERE s.id = ? AND s.user_id = ?`,
        [saleId, userId]
    );
    if (!saleRows.length) return null;
    const [items] = await db.execute(
        `SELECT * FROM sales_items WHERE sales_id = ? AND user_id = ?`,
        [saleId, userId]
    );
    return { sale: saleRows[0], items };
};

exports.generateA4PDF = async (req, res) => {
    try {
        const user_id = req.user_id;
        const { sale_id } = req.params;
        if (!sale_id) return res.status(400).json({ status: false, message: "sale_id required hai" });
        const data = await getSaleData(sale_id, user_id);
        if (!data) return res.status(404).json({ status: false, message: "Bill nahi mila ya access nahi hai" });
        const { sale, items } = data;

        const doc = new PDFDocument({ margin: 40, size: 'A4' });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="bill-${sale.invoice_no}.pdf"`);
        doc.pipe(res);

        doc.fontSize(18).font('Helvetica-Bold').text(sale.shop_name || 'Medical Store', { align: 'center' });
        doc.fontSize(9).font('Helvetica')
            .text(sale.shop_address || '', { align: 'center' })
            .text(`Mobile: ${sale.shop_mobile || '-'}   |   GST: ${sale.shop_gst || 'N/A'}`, { align: 'center' });
        doc.moveDown(0.5);
        doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor('#333333').lineWidth(1).stroke();
        doc.moveDown(0.5);

        const infoY = doc.y;
        doc.fontSize(9).font('Helvetica-Bold');
        doc.text(`Invoice No: ${sale.invoice_no}`, 40, infoY);
        doc.text(`Date: ${new Date(sale.bill_date).toLocaleDateString('en-IN')}`, 350, infoY);
        doc.fontSize(9).font('Helvetica');
        doc.text(`Patient: ${sale.patient_name || 'Walk-in'}`, 40, infoY + 15);
        doc.text(`Doctor: ${sale.doctor_name || '-'}`, 350, infoY + 15);
        if (sale.patient_mobile) doc.text(`Mobile: ${sale.patient_mobile}`, 40, infoY + 30);
        doc.moveDown(sale.patient_mobile ? 3.5 : 2.5);
        doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor('#aaaaaa').lineWidth(0.5).stroke();
        doc.moveDown(0.4);

        const colX = { sr: 40, name: 68, batch: 235, exp: 300, qty: 345, mrp: 385, rate: 430, gst: 470, amt: 505 };
        const headerY = doc.y;
        doc.fontSize(8).font('Helvetica-Bold').fillColor('#000000');
        doc.text('#', colX.sr, headerY, { width: 25 });
        doc.text('Medicine', colX.name, headerY, { width: 165 });
        doc.text('Batch', colX.batch, headerY, { width: 62 });
        doc.text('Exp', colX.exp, headerY, { width: 43 });
        doc.text('Qty', colX.qty, headerY, { width: 38, align: 'right' });
        doc.text('MRP', colX.mrp, headerY, { width: 42, align: 'right' });
        doc.text('Rate', colX.rate, headerY, { width: 37, align: 'right' });
        doc.text('GST%', colX.gst, headerY, { width: 32, align: 'right' });
        doc.text('Amount', colX.amt, headerY, { width: 50, align: 'right' });
        doc.moveDown(0.3);
        doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor('#aaaaaa').lineWidth(0.5).stroke();
        doc.moveDown(0.3);

        doc.font('Helvetica').fontSize(8).fillColor('#000000');
        items.forEach((item, idx) => {
            if (doc.y > 700) { doc.addPage(); doc.y = 40; }
            const rowY = doc.y;
            const hasSubtext = item.product_type || item.pack;
            doc.text(String(idx + 1), colX.sr, rowY, { width: 25 });
            doc.font('Helvetica-Bold').text(item.medicine_name, colX.name, rowY, { width: 165 });
            doc.font('Helvetica');
            if (hasSubtext) {
                doc.fontSize(7).fillColor('#888888')
                    .text(`${item.product_type || ''} ${item.pack || ''}`.trim(), colX.name, rowY + 11, { width: 165 });
                doc.fontSize(8).fillColor('#000000');
            }
            doc.text(item.batch_no || '-', colX.batch, rowY, { width: 62 });
            doc.text(item.expiry_date ? new Date(item.expiry_date).toLocaleDateString('en-IN', { month: '2-digit', year: '2-digit' }) : '-', colX.exp, rowY, { width: 43 });
            doc.text(String(item.quantity), colX.qty, rowY, { width: 38, align: 'right' });
            doc.text(parseFloat(item.mrp || 0).toFixed(2), colX.mrp, rowY, { width: 42, align: 'right' });
            doc.text(parseFloat(item.rate || 0).toFixed(2), colX.rate, rowY, { width: 37, align: 'right' });
            doc.text(`${item.gst_percent || 0}%`, colX.gst, rowY, { width: 32, align: 'right' });
            doc.text(parseFloat(item.net_amount || 0).toFixed(2), colX.amt, rowY, { width: 50, align: 'right' });
            doc.moveDown(hasSubtext ? 1.6 : 0.9);
        });

        doc.moveDown(0.3);
        doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor('#333333').lineWidth(0.8).stroke();
        doc.moveDown(0.5);
        doc.fontSize(9).font('Helvetica');
        doc.text('Taxable Amount:', 390, doc.y, { width: 110 });
        doc.text(`Rs. ${parseFloat(sale.total_amount).toFixed(2)}`, 505, doc.y - 11, { width: 50, align: 'right' });
        doc.moveDown(0.5);
        doc.text('Total GST:', 390, doc.y, { width: 110 });
        doc.text(`Rs. ${parseFloat(sale.total_gst).toFixed(2)}`, 505, doc.y - 11, { width: 50, align: 'right' });
        doc.moveDown(0.5);
        doc.moveTo(390, doc.y).lineTo(555, doc.y).strokeColor('#aaaaaa').lineWidth(0.5).stroke();
        doc.moveDown(0.3);
        doc.fontSize(11).font('Helvetica-Bold');
        doc.text('Grand Total:', 390, doc.y, { width: 110 });
        doc.text(`Rs. ${parseFloat(sale.grand_total).toFixed(2)}`, 505, doc.y - 13, { width: 50, align: 'right' });
        doc.moveDown(3);
        doc.fontSize(8).font('Helvetica').fillColor('#555555')
            .text('Thank you for your purchase!', { align: 'center' })
            .text('* Goods once sold will not be taken back *', { align: 'center' });
        doc.end();

    } catch (error) {
        console.error('A4 PDF Error:', error.message);
        if (!res.headersSent) res.status(500).json({ status: false, message: error.message });
    }
};

exports.getWhatsAppLink = async (req, res) => {
    try {
        const user_id = req.user_id;
        const { sale_id } = req.params;

        if (!sale_id) {
            return res.status(400).json({ status: false, message: "sale_id is required " });
        }

        const data = await getSaleData(sale_id, user_id);
        if (!data) {
            return res.status(404).json({ status: false, message: "Bill not found or access denied" });
        }

        const { sale, items } = data;
        const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';
        const pdfUrl = `${BASE_URL}/api/bills/pdf/${sale_id}`;
        const message = buildWhatsAppMessage(sale, items, pdfUrl);

        if (!sale.patient_mobile) {
            return res.status(200).json({
                status: true,
                message: "WhatsApp link ready — mobile number  is not available on this bill",
                whatsapp_link: `https://wa.me/?text=${encodeURIComponent(message)}`,
                has_mobile: false
            });
        }

        const mobile = sale.patient_mobile.replace(/\D/g, '');
        const waNumber = mobile.startsWith('91') ? mobile : `91${mobile}`;

        return res.status(200).json({
            status: true,
            message: "WhatsApp link ready",
            whatsapp_link: `https://wa.me/${waNumber}?text=${encodeURIComponent(message)}`,
            has_mobile: true,
            mobile: sale.patient_mobile
        });

    } catch (error) {
        console.error('WhatsApp Error:', error.message);
        res.status(500).json({ status: false, message: error.message });
    }
};

// const buildWhatsAppMessage = (sale, items, pdfUrl) => {
//     const itemLines = items.map(i =>
//         `  • ${i.medicine_name} x${i.quantity} = Rs.${parseFloat(i.net_amount).toFixed(2)}`
//     ).join('\n');
//     return (
//         `*${sale.shop_name}*\n` +
//         (sale.shop_address ? `${sale.shop_address}\n` : '') +
//         `\nBill No : ${sale.invoice_no}\n` +
//         `Date    : ${new Date(sale.bill_date).toLocaleDateString('en-IN')}\n` +
//         `Patient : ${sale.patient_name || 'Walk-in'}\n\n` +
//         `*Items:*\n${itemLines}\n\n` +
//         `Taxable : Rs. ${parseFloat(sale.total_amount).toFixed(2)}\n` +
//         `GST     : Rs. ${parseFloat(sale.total_gst).toFixed(2)}\n` +
//         `*Total  : Rs. ${parseFloat(sale.grand_total).toFixed(2)}*\n\n` +
        
//         `_Thank you for shopping with us!_`
//     );
// };

const buildWhatsAppMessage = (sale, items, pdfUrl) => {
    const itemLines = items.map(i =>
        `* ${i.medicine_name.toUpperCase()}\n  Qty: ${i.quantity} | Amt: Rs.${parseFloat(i.net_amount).toFixed(2)}`
    ).join('\n\n');

    return (
        `*${sale.shop_name.toUpperCase()}*\n` +
        (sale.shop_address ? `${sale.shop_address}\n` : '') +
        `------------------------------------------\n` +
        `INVOICE DETAILS\n` +
        `------------------------------------------\n` +
        `Bill No : #${sale.invoice_no}\n` +
        `Date    : ${new Date(sale.bill_date).toLocaleDateString('en-GB')}\n` +
        `Patient Name : ${sale.patient_name || 'Walk-in'}\n\n` +
        `*ITEMS ORDERED:*\n` +
        `${itemLines}\n\n` +
        `------------------------------------------\n` +
        `BILLING SUMMARY\n` +
        `------------------------------------------\n` +
        `Taxable : Rs.${parseFloat(sale.total_amount).toFixed(2)}\n` +
        `GST     : Rs.${parseFloat(sale.total_gst).toFixed(2)}\n` +
        `*TOTAL Amount*: Rs.${parseFloat(sale.grand_total).toFixed(2)}*\n` +
        `------------------------------------------\n\n` +
        `*Download Bill PDF:* \n${pdfUrl}\n\n` +
        `Thank you for choosing us! Get well soon.`
    );
};