// utils/email.js
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

// Load environment variables specifically for this module
dotenv.config();

let transporter;

// Configure Nodemailer based on environment variables
if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    try {
        transporter = nodemailer.createTransport({
            // 🛠️ FIX: Replaced 'service: gmail' with explicit host and secure port
            host: 'smtp.gmail.com',
            port: 465,
            secure: true, // true for port 465
            auth: {
                user: process.env.EMAIL_USER, 
                pass: process.env.EMAIL_PASS, // Make sure this is your 16-letter App Password
            },
        });
        console.log('✅ Nodemailer configured successfully (in utils/email.js)');
    } catch (error) {
        console.error('❌ Failed to configure Nodemailer (in utils/email.js): Check credentials/service.', error);
        transporter = null;
    }
} else {
    console.warn('⚠️ Email credentials (EMAIL_USER, EMAIL_PASS) not found in .env. Email functionality will be disabled.');
    transporter = null;
}

// Export the sendEmail function
export const sendEmail = async (to, subject, text, html = null) => {
    if (!transporter) {
         console.error('Attempted to send email, but Nodemailer is not configured or failed to initialize.');
         throw new Error('Email service is not available due to configuration issues.');
    }

    let mailOptions = {
        from: `"${process.env.APP_NAME || 'AURORA INTEL'}" <${process.env.EMAIL_USER}>`,
        to: to,
        subject: subject,
        text: text,
    };
    
    if (html) {
        mailOptions.html = html;
    }

    try {
        console.log(`Attempting to send email via Nodemailer to: ${to}, Subject: ${subject}`);
        let info = await transporter.sendMail(mailOptions);
        console.log(`✅ Email sent successfully to ${to}! Message ID: ${info.messageId}`);
        return info;
    } catch (err) {
        console.error(`❌ Nodemailer failed to send email to ${to}. Error:`, err);
        throw new Error(`Failed to send email: ${err.message}`);
    }
};
