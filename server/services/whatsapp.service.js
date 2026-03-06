// ═══════════════════════════════════════════════
// WhatsApp Service — Stub with Provider Support
// ═══════════════════════════════════════════════
const config = require('../config');

/**
 * Send a WhatsApp message
 * Currently a stub — replace with actual provider SDK
 */
const sendMessage = async (phone, message) => {
    const provider = config.whatsapp.provider;

    if (provider === 'stub') {
        console.log(`📱 [WhatsApp Stub] To: ${phone}`);
        console.log(`   Message: ${message}`);
        return { success: true, provider: 'stub' };
    }

    if (provider === 'twilio') {
        try {
            // Uncomment and install twilio SDK when ready:
            // const twilio = require('twilio');
            // const client = twilio(config.whatsapp.twilio.accountSid, config.whatsapp.twilio.authToken);
            // const result = await client.messages.create({
            //   from: config.whatsapp.twilio.from,
            //   to: `whatsapp:${phone}`,
            //   body: message,
            // });
            // return { success: true, sid: result.sid };
            console.log(`📱 [Twilio WhatsApp] Would send to ${phone}: ${message}`);
            return { success: true, provider: 'twilio' };
        } catch (err) {
            console.error('❌ Twilio WhatsApp error:', err.message);
            return { success: false, error: err.message };
        }
    }

    console.warn(`⚠️  Unknown WhatsApp provider: ${provider}`);
    return { success: false, error: 'Unknown provider' };
};

/**
 * Send order confirmation via WhatsApp
 */
const sendOrderConfirmation = async (phone, orderDetails) => {
    const message = [
        `🎉 Order Confirmed!`,
        ``,
        `📋 Order #${orderDetails.invoice_number || orderDetails.id}`,
        `📌 Service: ${orderDetails.service_title}`,
        `💰 Amount: $${orderDetails.price}`,
        `📅 Date: ${new Date().toLocaleDateString()}`,
        ``,
        `Thank you for choosing ROYA Platform!`,
    ].join('\n');

    return sendMessage(phone, message);
};

/**
 * Send status update via WhatsApp
 */
const sendStatusUpdate = async (phone, orderDetails) => {
    const statusEmojis = {
        confirmed: '✅',
        in_progress: '🔄',
        completed: '🎊',
        cancelled: '❌',
    };
    const emoji = statusEmojis[orderDetails.status] || '📢';

    const message = [
        `${emoji} Order Update`,
        ``,
        `📋 Order #${orderDetails.invoice_number || orderDetails.id}`,
        `📌 Status: ${orderDetails.status.replace(/_/g, ' ').toUpperCase()}`,
        ``,
        `ROYA Platform`,
    ].join('\n');

    return sendMessage(phone, message);
};

module.exports = { sendMessage, sendOrderConfirmation, sendStatusUpdate };
