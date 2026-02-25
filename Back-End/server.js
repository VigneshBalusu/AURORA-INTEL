// server.js (Full Inline Logic Version - Refined)
import express from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import helmet from 'helmet';
import bcrypt from 'bcryptjs'; // Needed for inline auth logic
import jwt from 'jsonwebtoken';   // Needed for inline auth logic & middleware use
import cors from 'cors';
// Nodemailer is handled in utils/email.js now
import multer from 'multer';      // Needed for inline upload logic
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import cloudinary from 'cloudinary'; // Use v2
import crypto from 'crypto';     // Needed for inline remote logout logic


// --- Utilities ---
// Import sendEmail helper from its dedicated file
import { sendEmail } from './utils/email.js';

// --- Models ---
// Import models directly as they are used inline
import User from './models/User.js';
import Experience from './models/Experience.js'; // Used by external experienceRoutes
import Conversation from './models/Conversation.js'; // Adjusted import to match the correct file name

// --- Middleware ---
// Import authMiddleware to use on protected inline routes
import { authMiddleware } from './middleware/auth.js';

// --- Other Route Handlers (External) ---
import experienceRoutes from './routes/experienceRoutes.js'; // Keeping this external
import chatRoutes from './routes/chatRoutes.js';

// --- Chatbot Logic Helper ---
// Import the function that generates the actual chatbot answer
import { generateChatbotAnswer } from './chatbot.js'; // Ensure path is correct

// --- Setup ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config(); // Load environment variables

// --- Temporary In-Memory Stores (Consider replacing for production) ---
const remoteLogoutTokens = new Map(); // For single-use remote logout links
const otpStore = new Map();          // For signup OTP verification



// --- Cloudinary Configuration ---
try {
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
        console.warn('⚠️ Cloudinary credentials missing. Uploads will use local storage.');
    } else {
        cloudinary.v2.config({
            cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
            api_key: process.env.CLOUDINARY_API_KEY,
            api_secret: process.env.CLOUDINARY_API_SECRET,
            secure: true // Use HTTPS
        });
        console.log('✅ Cloudinary Configured');
    }
} catch(cldError){ console.error('❌ Error configuring Cloudinary:', cldError)}


// --- Express App Initialization ---
const app = express();
const PORT = process.env.PORT || 3000;
const allowedOrigin = process.env.FRONTEND_URL || 'http://localhost:5173';
console.log(`[CORS Check] Raw process.env.FRONTEND_URL: ${process.env.FRONTEND_URL}`); // Log raw value
console.log(`[CORS Check] Allowed Origin determined as: ${allowedOrigin}`); // Log the value used
// --- MongoDB Connection ---
const connectDB = async () => {
  try {
    if (!process.env.MONGO_URI) throw new Error('MONGO_URI environment variable not set.');
    await mongoose.connect(process.env.MONGO_URI); // Removed deprecated options
    console.log('✅ MongoDB Connected');
  } catch (err) {
    console.error('❌ MongoDB Connection Error:', err.message);
    process.exit(1); // Exit if DB connection fails
  }
};
connectDB();

// --- Core Middleware ---
// app.use(helmet()); // Security headers
app.use(cors({
    origin: allowedOrigin, // Allow ANY origin for testing
    credentials: true, // May need to set to false with '*'
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: '5mb' })); // Parse JSON request bodies (limit size)
app.use(express.urlencoded({ extended: true, limit: '5mb' })); // Parse URL-encoded bodies
app.use('/api', chatRoutes); // ✅ Makes /api/chatbot and /api/chat-history work

// --- Static File Serving ---
// Serve files from the /public/uploads directory via the /uploads URL path
const publicUploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(publicUploadsDir)) { // Ensure directory exists
    fs.mkdirSync(publicUploadsDir, { recursive: true });
    console.log(`Created directory: ${publicUploadsDir}`);
}
app.use('/uploads', express.static(publicUploadsDir));
console.log(`✅ Serving static files from /uploads mapped to ${publicUploadsDir}`);


// --- Multer Configuration (File Uploads) ---
const storage = multer.diskStorage({ // Configure temporary storage for uploads
  destination: (req, file, cb) => {
      const tempDir = path.join(__dirname, 'uploads_temp'); // Temp dir before processing
      if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
      cb(null, tempDir);
  },
  filename: (req, file, cb) => { // Generate unique filename
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});
const fileFilter = (req, file, cb) => { // Filter only allowed image types
  if (!file.originalname.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
      req.fileValidationError = 'Only image files (jpg, jpeg, png, gif, webp) are allowed!'; // Attach error to request
      return cb(null, false); // Reject file smoothly
  }
  cb(null, true); // Accept file
};
const upload = multer({ // Create reusable multer instance
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB file size limit
    fileFilter: fileFilter
});

// =============================================
// === API Routes Definition (ALL INLINE) ====
// =============================================

app.get('/', (req, res) => res.status(200).json({ message: '🚀 API Root is running!' }));
app.get('/api', (req, res) => res.status(200).json({ message: '🚀 API /api base reached!' }));

// --- Authentication & User Management Routes ---

// POST /api/auth/request-otp (Start OTP Signup)
app.post('/api/auth/request-otp', async (req, res, next) => {
    // 1. Proof of Life Log (If this prints, the request reached the backend)
    console.log("🚨 [DEBUG] OTP Route Triggered! Received Body:", req.body); 

    try {
        // 2. Safely extract email so it doesn't crash if body is empty
        const { email } = req.body || {}; 
        
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            console.log("❌ OTP Route: Invalid or missing email");
            return res.status(400).json({ error: 'Valid email is required.' });
        }
        
        const normalizedEmail = email.toLowerCase();
        
        const existingUser = await User.findOne({ email: normalizedEmail });
        if (existingUser) { 
            return res.status(409).json({ error: 'Email already registered. Please Login.' }); 
        }

        const otp = Math.floor(100000 + Math.random() * 900000).toString(); // Generate 6-digit OTP
        const otpExpires = Date.now() + 5 * 60 * 1000; // 5 minute validity
        
        otpStore.set(normalizedEmail, { otp, expires: otpExpires });
        console.log(`DEV ONLY - OTP for ${normalizedEmail}: ${otp}`); 

        setTimeout(() => { 
            const current = otpStore.get(normalizedEmail);
            if (current?.otp === otp) otpStore.delete(normalizedEmail);
        }, otpExpires - Date.now() + 2000);

        await sendEmail(
            normalizedEmail, 
            "Your Account Verification Code", 
            `Your verification code is: ${otp}\nIt expires in 5 minutes.`
        );

        return res.status(200).json({ message: `✅ OTP sent successfully to ${normalizedEmail}` });
        
    } catch (error) { 
        console.error("❌ CRASH IN OTP ROUTE:", error); 
        return res.status(500).json({ 
            error: "Backend crashed while processing OTP.", 
            details: error.message 
        }); 
    }
});
// POST /api/auth/verify-otp (Complete OTP Signup)
// server.js (Replace the existing /api/auth/verify-otp route handler with this corrected version)

app.post('/api/auth/verify-otp', async (req, res, next) => {
  const { name, email, password, otp } = req.body;

  // --- Input Validation ---
  if (!name?.trim() || !email || !password || !otp || password.length < 6 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^\d{6}$/.test(otp)) {
      return res.status(400).json({ error: 'Valid name, email, password (min 6 chars), and 6-digit OTP required.' });
  }
  const normalizedEmail = email.toLowerCase();

  try {
      const storedOtpData = otpStore.get(normalizedEmail);

      // --- Step 1: Check if OTP exists and hasn't expired ---
      if (!storedOtpData || Date.now() > storedOtpData.expires) {
          // It's okay to clean up an expired/non-existent entry
          otpStore.delete(normalizedEmail);
          console.log(`Verify attempt for ${normalizedEmail}: OTP not found or expired.`);
          return res.status(400).json({ error: 'OTP is invalid or has expired. Please request again.' });
      }

      // --- Step 2: Check if the provided OTP matches the stored OTP ---
      if (storedOtpData.otp !== otp) {
          // *** CRITICAL FIX: DO NOT DELETE THE OTP HERE ***
          // The user might have made a typo and can try again with the correct code if within expiry.
          console.log(`Verify attempt for ${normalizedEmail}: Invalid OTP entered.`);
          return res.status(400).json({ error: 'Invalid OTP entered.' }); // Specific error message
      }

      // --- Step 3: OTP is Correct and Valid! ---
      // *** NOW it's safe to delete the used OTP ***
      otpStore.delete(normalizedEmail);
      console.log(`OTP successfully verified for ${normalizedEmail}. Deleting OTP record.`);

      // --- Step 4: Check for Race Condition (user created between OTP request and verify) ---
      const existingUser = await User.findOne({ email: normalizedEmail });
      if (existingUser) {
          // OTP was correct, but user exists now. Don't need to delete OTP again.
          console.log(`Verify attempt for ${normalizedEmail}: Email registered after OTP was sent.`);
          return res.status(409).json({ error: 'This email address was registered during the verification process. Please Login.' });
      }

      // --- Step 5: Create the New User ---
      console.log(`Creating new user account for ${normalizedEmail}.`);
      const hashedPassword = await bcrypt.hash(password, 10);
      const defaultPhotoUrl = '/uploads/default-profile-placeholder.png'; // Ensure this file exists
      const newUser = new User({
          name: name.trim(),
          email: normalizedEmail,
          password: hashedPassword,
          photo: defaultPhotoUrl
      });
      await newUser.save(); // Mongoose validates and saves

      console.log(`User ${normalizedEmail} created successfully.`);
      // Exclude password from response
      const userResponse = { _id: newUser._id, name: newUser.name, email: newUser.email, photo: newUser.photo };
      res.status(201).json({ message: '✅ Account created successfully! You can now login.', user: userResponse });

  } catch (error) {
      // --- Error Handling ---
      console.error(`Error during OTP Verification/User Creation for ${normalizedEmail}:`, error);
      // Do NOT delete OTP here in the generic catch block, as the validation might not have even passed.
      // The timeout cleanup in request-otp handles expired ones eventually.
      if (error.name === 'ValidationError') {
          return res.status(400).json({ error: 'User validation failed', errors: error.errors });
      }
      // Pass any other errors (e.g., database connection issues) to the global error handler
      next(error);
  }
});

// --- ★★★ ADD THIS ENTIRE BLOCK ★★★ ---

// POST /api/auth/forgot-password - Request a password reset link
app.post('/api/auth/forgot-password', async (req, res, next) => {
    
    const { email } = req.body;
    if (!email) {
        return res.status(400).json({ error: 'Please provide your email address.' });
    }
    const normalizedEmail = email.toLowerCase().trim();
    console.log(`Password reset requested for: ${normalizedEmail}`);

    try {
        const user = await User.findOne({ email: normalizedEmail });

        // Always send a generic success message to prevent email enumeration
        if (!user) {
            console.log(`Forgot Password: User not found for ${normalizedEmail}, sending generic response.`);
            return res.status(200).json({ message: '✅ If an account with that email exists, a password reset link has been sent.' });
        }

        // --- Generate, Hash, and Save Token ---
        const resetToken = crypto.randomBytes(32).toString('hex'); // Generate secure token
        const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex'); // Hash it
        const tokenExpiry = Date.now() + 3600000; // Token expires in 1 hour (3600 * 1000 ms)

        user.passwordResetToken = hashedToken;
        user.passwordResetExpires = new Date(tokenExpiry);
        await user.save(); // Save token and expiry to user document
        console.log(`Reset token generated and saved (hashed) for user ${user._id}`);

        // --- Construct Reset Link ---
        const frontendBaseUrl = process.env.FRONTEND_URL || 'http://localhost:5173'; // Get frontend URL
        const resetUrl = `${frontendBaseUrl}/reset-password/${resetToken}`; // Use the ORIGINAL (unhashed) token in the link

        // --- Send Email ---
        const subject = `Password Reset Request for ${process.env.APP_NAME || 'Your App'}`;
        const textMessage = `You requested a password reset. Click this link (valid for 1 hour) to reset your password:\n\n${resetUrl}\n\nIf you did not request this, please ignore this email.`;
        const htmlMessage = `<p>You requested a password reset.</p><p>Click the link below (valid for 1 hour) to reset your password:</p><p><a href="${resetUrl}" target="_blank">Reset Your Password</a></p><p>If you did not request this, ignore this email.</p>`;

        // Send email asynchronously
        sendEmail(user.email, subject, textMessage, htmlMessage)
             .then(() => console.log(`Password reset email sent to ${user.email}`))
             .catch(emailErr => console.error(`❌ FAILED to send password reset email to ${user.email}:`, emailErr));

        // --- Send Generic Success Response to Frontend ---
        res.status(200).json({ message: '✅ If an account with that email exists, a password reset link has been sent.' });

    } catch (error) {
        console.error('Error in forgot-password route:', error);
        // Use the global error handler for unexpected errors
        next(new Error('An error occurred while processing the password reset request.'));
    }
});

console.log('✅ Mounted POST /api/auth/forgot-password (Inline)'); // Add log message
// ... (your existing requires: express, User model, crypto, sendEmail, etc.) ...
// const app = express();
// ... (your existing middleware: app.use(express.json()), app.use(cors()), etc.) ...

// --- FORGOT PASSWORD ROUTE (Your Existing Code) ---
app.post('/api/auth/forgot-password', async (req, res, next) => {
    const { email } = req.body;
    if (!email) {
        return res.status(400).json({ error: 'Please provide your email address.' });
    }
    const normalizedEmail = email.toLowerCase().trim();
    console.log(`Password reset requested for: ${normalizedEmail}`);

    try {
        const user = await User.findOne({ email: normalizedEmail });

        if (!user) {
            console.log(`Forgot Password: User not found for ${normalizedEmail}, sending generic response.`);
            return res.status(200).json({ message: '✅ If an account with that email exists, a password reset link has been sent.' });
        }

        const resetToken = crypto.randomBytes(32).toString('hex');
        const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');
        const tokenExpiry = Date.now() + 3600000; // 1 hour

        user.passwordResetToken = hashedToken;
        user.passwordResetExpires = new Date(tokenExpiry);
        await user.save();
        console.log(`Reset token generated and saved (hashed) for user ${user._id}`);

        const frontendBaseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        const resetUrl = `${frontendBaseUrl}/reset-password/${resetToken}`; // ORIGINAL token in URL

        const subject = `Password Reset Request for ${process.env.APP_NAME || 'Your App'}`;
        const textMessage = `You requested a password reset. Click this link (valid for 1 hour) to reset your password:\n\n${resetUrl}\n\nIf you did not request this, please ignore this email.`;
        const htmlMessage = `<p>You requested a password reset.</p><p>Click the link below (valid for 1 hour) to reset your password:</p><p><a href="${resetUrl}" target="_blank">Reset Your Password</a></p><p>If you did not request this, ignore this email.</p>`;

        sendEmail(user.email, subject, textMessage, htmlMessage)
             .then(() => console.log(`Password reset email sent to ${user.email}`))
             .catch(emailErr => console.error(`❌ FAILED to send password reset email to ${user.email}:`, emailErr));

        res.status(200).json({ message: '✅ If an account with that email exists, a password reset link has been sent.' });

    } catch (error) {
        console.error('Error in forgot-password route:', error);
        next(new Error('An error occurred while processing the password reset request.'));
    }
});
console.log('✅ Mounted POST /api/auth/forgot-password (Inline)');


// --- RESET PASSWORD ROUTE (NEW CODE TO ADD) ---
app.post('/api/auth/reset-password/:token', async (req, res, next) => {
    const { token: receivedToken } = req.params; // Get the ORIGINAL token from URL
    const { password, confirmPassword } = req.body;

    console.log(`Password reset attempt with token prefix: ${receivedToken ? receivedToken.substring(0,8) : 'N/A'}...`);

    // 1. Basic Validation
    if (!password || !confirmPassword) {
        return res.status(400).json({ error: 'Password and confirmation are required.' });
    }
    if (password.length < 6) { // Ensure this matches your signup password policy
        return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
    }
    if (password !== confirmPassword) {
        return res.status(400).json({ error: 'Passwords do not match.' });
    }

    try {
        // 2. Hash the received token to compare with the stored hashed token
        const hashedReceivedToken = crypto.createHash('sha256').update(receivedToken).digest('hex');

        // 3. Find user by the HASHED token and ensure it's not expired
        const user = await User.findOne({
            passwordResetToken: hashedReceivedToken,
            passwordResetExpires: { $gt: Date.now() } // Check if expiry is in the future
        });

        if (!user) {
            console.log(`Reset Password: Invalid or expired token provided (hashed received: ${hashedReceivedToken.substring(0,8)}...).`);
            // It's important to make it harder for attackers to know if a token was valid but expired vs never valid.
            // A 400 is generally appropriate here.
            return res.status(400).json({ error: 'Password reset token is invalid or has expired. Please request a new one.' });
        }

        // 4. Hash the new password (Assuming you have bcrypt or similar installed and required)
        // const salt = await bcrypt.genSalt(10);
        // user.password = await bcrypt.hash(password, salt);
        // --- OR if you have a pre-save hook in your User model to hash passwords: ---
        user.password = password; // The pre-save hook in your User model should handle hashing

        // 5. Invalidate the reset token
        user.passwordResetToken = undefined;
        user.passwordResetExpires = undefined;
        await user.save(); // This will trigger the pre-save hook if `user.password` was modified

        console.log(`Password successfully reset for user ${user._id}`);
        return res.status(200).json({ message: '✅ Password has been reset successfully.' });

    } catch (error) {
        console.error('Error in reset-password route:', error);
        // Use a generic error message for the client, log details on server
        // Consider passing to your global error handler: next(error);
        return res.status(500).json({ error: 'An error occurred while resetting your password.' });
    }
});
console.log('✅ Mounted POST /api/auth/reset-password/:token (Inline)');


// ... (your global error handler if you have one, e.g., app.use((err, req, res, next) => { ... })) ...

// ... (your app.listen call) ...
// --- ★★★ END OF BLOCK TO ADD ★★★ ---

// POST /api/auth/login (User Login)
app.post('/api/auth/login', async (req, res, next) => {
    const { email, password } = req.body;
    console.log(`Login attempt: ${email}`); // Log attempt
    if (!email || !password) return res.status(400).json({ error: 'Email and Password are required.' });
    try {
        // Find user and explicitly include password for comparison
        const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
        if (!user) return res.status(401).json({ error: 'Invalid credentials.' }); // Generic error for security

        const isMatch = await bcrypt.compare(password, user.password); // Compare submitted pass with hashed pass
        if (!isMatch) return res.status(401).json({ error: 'Invalid credentials.' }); // Generic error

        // Generate JWT token
        const tokenPayload = { userId: user._id };
        const mainJwtToken = jwt.sign(tokenPayload, process.env.JWT_SECRET, { expiresIn: '1h' }); // Token expires in 1 hour
        console.log(`✅ Login success: User ${user._id}`);

        // --- Remote Logout Token (Optional Feature) ---
        const remoteLogoutToken = crypto.randomBytes(32).toString('hex');
        const expires = Date.now() + 3600000; // 1 hour validity for the logout link
        remoteLogoutTokens.set(remoteLogoutToken, { userId: user._id.toString(), expires });
        setTimeout(() => remoteLogoutTokens.delete(remoteLogoutToken), 3602000); // Schedule cleanup
        // --- ---

        // --- Login Notification Email (Optional - Runs async) ---
        try {
            const backendUrl = process.env.BACKEND_URL || `http://localhost:${PORT}`;
            const remoteLogoutLink = `${backendUrl}/api/auth/remote-logout/${remoteLogoutToken}`; // Full URL for email link
            sendEmail(user.email,
                      `Login Alert for ${process.env.APP_NAME || 'App'}`,
                      `Login detected for your account. If this wasn't you, click to invalidate this session: ${remoteLogoutLink} (expires in 1 hour)`,
                      `<p>Login detected. If this wasn't you, <a href="${remoteLogoutLink}">click here to invalidate this session</a> (expires in 1 hour).</p>`
            ).catch(e => console.error("⚠️ Login email send failed (non-critical):", e.message)); // Log error but don't block response
        } catch (emailSetupError) { console.error("⚠️ Email setup error during login:", emailSetupError); }
        // --- ---

        // Send response: token and user details (excluding password)
        const userForFrontend = { _id: user._id, name: user.name, email: user.email, photo: user.photo };
        res.status(200).json({ token: mainJwtToken, user: userForFrontend });

    } catch (err) { console.error('Login route error:', err); next(err); }
});

// GET /api/auth/remote-logout/:token (Handles email link click)
// server.js -> REPLACE the existing GET /api/auth/remote-logout/:token handler

// GET /api/auth/remote-logout/:token (Handles email link click for remote logout)
app.get('/api/auth/remote-logout/:token', async (req, res, next) => {
    const { token } = req.params;
    const userAgent = req.headers['user-agent'] || 'Unknown'; // Get user agent for logging

    console.log(`Remote logout request received. Token prefix: ${token?.substring(0, 8)}... User Agent: ${userAgent}`);

    if (!token) {
        return res.status(400).send(`
            <html><head><title>Error</title></head><body>
                <h1>Invalid Request</h1><p>Remote logout token missing from the link.</p>
            </body></html>`);
    }

    // --- Check and Remove Token from Temporary Store ---
    const tokenData = remoteLogoutTokens.get(token);
    let userId = null;

    if (!tokenData || Date.now() > tokenData.expires) {
        remoteLogoutTokens.delete(token); // Clean up invalid/expired token
        console.warn(`Remote logout token ${token.substring(0, 8)}... not found or expired.`);
        return res.status(400).send(`
             <html><head><title>Link Expired</title></head><body>
                 <h1>Link Expired or Invalid</h1>
                 <p>This remote logout link has expired or is invalid. Your session may still be active elsewhere.</p>
                 <p><a href="${process.env.FRONTEND_URL || '/login'}">Go to Login</a></p>
            </body></html>`);
    } else {
         // Token is valid (in our temporary map), mark for client-side clearing and remove from map
         userId = tokenData.userId;
         remoteLogoutTokens.delete(token); // Use the token (single use)
         console.log(`Remote logout token valid for user ${userId}. Token deleted.`);
    }


    // --- ★ ACTION NEEDED FOR REAL INVALIDATION ★ ---
    // In a real-world scenario with proper session management or JWT blacklisting,
    // you would invalidate the *actual session/JWT* associated with the user ID here.
    // This might involve:
    // 1. Finding the user's active session(s) in a DB and marking them invalid.
    // 2. Adding the user's active JWT IDs to a blacklist (e.g., Redis) until they expire naturally.
    console.warn(`REMOTE LOGOUT ACTION: Actual session invalidation logic for user ${userId} needs implementation (e.g., JWT blacklist).`);
    // --- END ★ ACTION NEEDED ★ ---


    // --- Send HTML Response with Client-Side Logout Script ---
    // This script attempts to clear the token from the user's browser where the link was clicked.
    const frontendUrl = process.env.FRONTEND_URL || '/login'; // Default to login if not set
    res.status(200).send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Logout Confirmation</title>
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                body { font-family: sans-serif; padding: 20px; text-align: center; background-color: #f4f4f4; color: #333; }
                .container { background-color: #fff; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); display: inline-block; }
                h1 { color: #444; margin-bottom: 15px; }
                p { margin-bottom: 20px; line-height: 1.6; }
                a { color: #007bff; text-decoration: none; }
                a:hover { text-decoration: underline; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>Logout Initiated</h1>
                <p>An attempt has been made to log out the session associated with this link from this browser.</p>
                <p>For complete security, you may want to log out from other devices or browsers manually if you suspect unauthorized access.</p>
                <p><a href="${frontendUrl}">Go back to application</a></p>
            </div>
            <script>
                try {
                    // Attempt to clear token and user info from localStorage
                    localStorage.removeItem('token');
                    localStorage.removeItem('userInfo');
                    console.log('Remote logout script: Token and userInfo removed from localStorage.');
                    // You could potentially redirect after a short delay
                    // setTimeout(() => { window.location.href = '${frontendUrl}'; }, 3000);
                } catch (e) {
                    console.error('Remote logout script: Error clearing localStorage:', e);
                    // Display message if storage clearing fails (e.g., private browsing)
                     const errorDiv = document.createElement('div');
                     errorDiv.style.color = 'red';
                     errorDiv.style.marginTop = '15px';
                     errorDiv.textContent = 'Note: Could not automatically clear stored data in this browser session (possibly due to privacy settings). Please clear site data manually if needed.';
                     document.querySelector('.container').appendChild(errorDiv);
                }
            </script>
        </body>
        </html>
    `);
});
console.log('✅ Updated GET /api/auth/remote-logout/:token with client-side clear script');

// GET /api/user (Get Logged-In User's Details) - Protected
app.get('/api/user', authMiddleware, (req, res) => { // No async needed if just accessing req.user
    // authMiddleware adds 'user' object to 'req' if token is valid
    // Respond with user data attached by the middleware (excluding password)
    res.status(200).json(req.user);
});

// PUT /api/auth/user (Update Logged-In User's Profile) - Protected
app.put('/api/auth/user', authMiddleware, async (req, res, next) => {
    const userId = req.user._id; // Get user ID from authenticated user
    const updates = req.body;
    const allowedUpdates = ['name', 'address', 'phone', 'dateOfBirth']; // Email/Photo handled separately
    const finalUpdates = {};

    allowedUpdates.forEach(key => { // Build update object safely
        if (updates[key] !== undefined && updates[key] !== null) {
            finalUpdates[key] = typeof updates[key] === 'string' ? updates[key].trim() : updates[key];
        }
    });

    // Specific validation or checks can go here (e.g., phone format)

    if (Object.keys(finalUpdates).length === 0) {
        return res.status(400).json({ error: 'No valid fields provided for update.' });
    }

    try {
        // Update user and return the new document, excluding password
        const updatedUser = await User.findByIdAndUpdate(userId, { $set: finalUpdates }, { new: true, runValidators: true }).select('-password');

        if (!updatedUser) return res.status(404).json({ error: 'User not found during update.' }); // Should not happen if authenticated

        res.status(200).json({ message: '✅ Profile updated successfully', user: updatedUser });
    } catch (err) {
        console.error("Error updating user profile:", err);
        if (err.name === 'ValidationError') return res.status(400).json({ error: 'Validation failed', errors: err.errors });
        next(err); // Pass other errors
    }
});

// POST /api/auth/upload (Upload Logged-In User's Profile Picture) - Protected
app.post('/api/auth/upload', authMiddleware, upload.single('profileImage'), async (req, res, next) => {
    // Check for validation errors from multer fileFilter
    if (req.fileValidationError) return res.status(400).json({ error: req.fileValidationError });
    if (!req.file) return res.status(400).json({ error: 'No image file uploaded.' });

    let photoUrl = null;
    const tempFilePath = req.file.path; // Path to temp uploaded file

    try {
        console.log(`Uploading profile image for user ${req.user._id}`);
        // --- Cloudinary Upload ---
        if (cloudinary.v2.config().cloud_name) { // Check if Cloudinary is configured
            try {
                const result = await cloudinary.v2.uploader.upload(tempFilePath, {
                    folder: 'profile_pictures', // Organize in Cloudinary
                    public_id: `user_${req.user._id}_profile`, // Unique ID, overwrite previous
                    overwrite: true,
                    // transformation: [{ width: 250, height: 250, crop: "fill", gravity: "face" }] // Example resize
                });
                photoUrl = result.secure_url; // Get HTTPS URL
                console.log(`Cloudinary upload success: ${photoUrl}`);
            } catch (cldErr) { console.error("⚠️ Cloudinary upload error:", cldErr.message); }
        } else { console.log("Cloudinary not configured, using local fallback."); }

        // --- Local Storage Fallback ---
        if (!photoUrl) {
            const filename = req.file.filename;
            const targetPath = path.join(publicUploadsDir, filename); // Final public path
            try {
                fs.renameSync(tempFilePath, targetPath); // Move from temp to public/uploads
                photoUrl = `/uploads/${filename}`; // URL path for frontend
                console.log(`Local upload success: ${photoUrl}`);
            } catch (renameErr) { throw new Error(`Failed to process file locally: ${renameErr.message}`); } // Throw if move fails
        }

        // --- Update User in DB ---
        const updatedUser = await User.findByIdAndUpdate(req.user._id, { photo: photoUrl }, { new: true }).select('photo'); // Update photo URL

        // --- Cleanup ---
        if (fs.existsSync(tempFilePath)) { // Delete the temp file regardless of success/failure if it exists
             try { fs.unlinkSync(tempFilePath); } catch (e) { console.error(`⚠️ Error deleting temp file ${tempFilePath}:`, e); }
        }
         // Note: Cleanup of OLD photo is not implemented here (complex)

        if (!updatedUser) return res.status(404).json({ error: 'User not found, could not update photo URL.' });

        res.status(200).json({ message: '✅ Upload successful', photo: updatedUser.photo }); // Return new photo URL

    } catch (error) { console.error("Error during image upload:", error); next(error); } // Pass error to global handler
});

// --- General User Management Routes (Potentially Admin) ---
// NOTE: Authorization logic inside these routes is CRUCIAL

// PUT /api/users/update/:id (Update any user - Requires Admin/Self Check) - Protected
app.put('/api/users/update/:id', authMiddleware, async (req, res, next) => {
    const userIdToUpdate = req.params.id;
    const { _id: loggedInUserId, isAdmin: loggedInUserIsAdmin = false } = req.user; // Get info from token

    // --- Authorization ---
    if (userIdToUpdate !== loggedInUserId.toString() && !loggedInUserIsAdmin) {
        return res.status(403).json({ error: 'Forbidden: Insufficient permissions.' });
    }

    const { name, email, password, isAdmin } = req.body; // Fields that can be updated
    const updates = {};

    // Prepare update object
    if (name?.trim()) updates.name = name.trim();
    if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) updates.email = email.toLowerCase();
    if (password && password.length >= 6) { updates.password = await bcrypt.hash(password, 10); }
    else if (password) { return res.status(400).json({ error: 'Password must be at least 6 characters.' }); }
    if (loggedInUserIsAdmin && typeof isAdmin === 'boolean') { updates.isAdmin = isAdmin; } // Only admin can change admin status

    if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No valid update fields provided.' });

    try {
        // Check email uniqueness if changing email
        if (updates.email) {
            const userBeingUpdated = await User.findById(userIdToUpdate).lean(); // Use lean
            if (!userBeingUpdated) return res.status(404).json({ error: 'User to update not found.' });
            if (updates.email !== userBeingUpdated.email) { // Only check if email actually changed
                const existing = await User.findOne({ email: updates.email }).lean();
                if (existing) return res.status(409).json({ error: 'Email already in use.' });
            } else { delete updates.email; } // No change if same email
            if (Object.keys(updates).length === 0) return res.status(200).json({ message: 'No actual changes requested.' });
        }

        const updatedUser = await User.findByIdAndUpdate(userIdToUpdate, { $set: updates }, { new: true, runValidators: true }).select('-password'); // Apply updates
        if (!updatedUser) return res.status(404).json({ error: 'User not found after update attempt.' }); // Should be rare

        console.log(`User ${userIdToUpdate} updated by ${loggedInUserId}`);
        res.status(200).json({ message: '✅ User updated successfully', user: updatedUser });
    } catch (error) { console.error(`Error updating user ${userIdToUpdate}:`, error); next(error); }
});

// DELETE /api/users/delete/:id (Delete any user - Requires Admin/Self Check) - Protected
app.delete('/api/users/delete/:id', authMiddleware, async (req, res, next) => {
    const userIdToDelete = req.params.id;
     const { _id: loggedInUserId, isAdmin: loggedInUserIsAdmin = false } = req.user;

    // --- Authorization ---
    if (userIdToDelete !== loggedInUserId.toString() && !loggedInUserIsAdmin) {
        return res.status(403).json({ error: 'Forbidden: Insufficient permissions.' });
    }
    // Optional: Prevent self-deletion via this generic route?
    // if (userIdToDelete === loggedInUserId.toString()) return res.status(400).json({ error: 'Use specific account deletion function.' });

    try {
        // Ensure user exists
        const user = await User.findById(userIdToDelete);
        if (!user) return res.status(404).json({ error: 'User not found.' });

        // --- Delete Related Data (IMPORTANT) ---
        await Experience.deleteMany({ userId: userIdToDelete });
        await Chat.deleteOne({ userId: userIdToDelete });
        console.log(`Related Experience/Chat data deleted for user ${userIdToDelete}`);
        // --- TODO: Add cleanup for user's uploads (Cloudinary/Local) ---

        // --- Delete User ---
        await User.findByIdAndDelete(userIdToDelete);

        console.log(`User ${userIdToDelete} deleted by ${loggedInUserId}`);
        res.status(200).json({ message: '✅ User and related data deleted successfully', userId: userIdToDelete });
    } catch (error) { console.error(`Error deleting user ${userIdToDelete}:`, error); next(error); }
});


// --- Chatbot Routes ---

// POST /api/chatbot - Handle Chat Interaction - Protected
// server.js -> Inside the API Routes Definition section

// --- Conversation Routes (Multi-Chat) ---

// GET /api/conversations - Fetch list for user
    // GET /api/conversations - Fetch list for user
    app.get('/api/conversations', authMiddleware, async (req, res, next) => {
        const userId = req.user.id;
        console.log(`[User ${userId}] Fetching conversation list...`);
        try {
            // ★★★ POTENTIAL ISSUE AREA 1: Model Name ★★★
            // Use the Conversation model
            const conversations = await Conversation.find({ userId: userId }) // <-- Is 'Conversation' correctly imported and named?
                // ★★★ POTENTIAL ISSUE AREA 2: Schema Fields ★★★
                .select('_id title lastActivity createdAt') // <-- Do 'title' and 'lastActivity' exist in your schema?
                .sort({ lastActivity: -1 })
                .limit(100)
                .lean();

            // ★★★ POTENTIAL ISSUE AREA 3: Mapping Logic ★★★
            const conversationSummaries = conversations.map(conv => ({
                id: conv._id,
                title: conv.title || 'Untitled Chat', // <-- Requires 'title' field
                lastUpdate: conv.lastActivity || conv.updatedAt // <-- Requires 'lastActivity' or 'updatedAt'
            }));

            console.log(`[User ${userId}] Found ${conversationSummaries.length} conversations.`);
            res.status(200).json({ conversations: conversationSummaries });

        } catch (error) {
            console.error(`[User ${userId}] Error fetching conversation list:`, error); // <-- THIS CATCH IS LIKELY BEING HIT
            next(error);
        }
    });
console.log('✅ Mounted GET /api/conversations');

// POST /api/conversations - Create a new empty conversation
app.post('/api/conversations', authMiddleware, async (req, res, next) => {
    const userId = req.user.id;
    console.log(`[User ${userId}] Creating new conversation...`);
    try {
        // Create a new Conversation document with only the userId
        const newConversation = new Conversation({ userId: userId });
        await newConversation.save();

        console.log(`[User ${userId}] New conversation created with ID: ${newConversation._id}`);
        res.status(201).json({
            message: "New conversation started.",
            conversationId: newConversation._id // Return the ID of the new conversation
        });

    } catch (error) {
        console.error(`[User ${userId}] Error creating new conversation:`, error);
        next(error);
    }
});
console.log('✅ Mounted POST /api/conversations');

// GET /api/conversations/:id/messages - Fetch messages for a specific conversation
app.get('/api/conversations/:id/messages', authMiddleware, async (req, res, next) => {
    const userId = req.user.id;
    const conversationId = req.params.id;
    console.log(`[User ${userId}] Fetching messages for conversation: ${conversationId}`);

    try {
        if (!mongoose.Types.ObjectId.isValid(conversationId)) {
             return res.status(400).json({ error: 'Invalid conversation ID format.' });
        }

        // Find the specific conversation belonging to the user
        const conversation = await Conversation.findOne({ _id: conversationId, userId: userId })
                                           .select('messages') // Only get the messages array
                                           .lean();

        if (!conversation) {
            console.log(`[User ${userId}] Conversation not found or not authorized: ${conversationId}`);
            return res.status(404).json({ error: 'Conversation not found.' });
        }

        console.log(`[User ${userId}] Found ${conversation.messages?.length || 0} messages for conversation ${conversationId}.`);
        res.status(200).json({ messages: conversation.messages || [] }); // Return messages or empty array

    } catch (error) {
        console.error(`[User ${userId}] Error fetching messages for conversation ${conversationId}:`, error);
        next(error);
    }
});
console.log('✅ Mounted GET /api/conversations/:id/messages');

// POST /api/conversations/:id/messages - Add user message, get bot response, save both
app.post('/api/conversations/:id/messages', authMiddleware, async (req, res, next) => {
    const userId = req.user.id;
    const conversationId = req.params.id;
    const { prompt } = req.body;

    if (!prompt?.trim()) return res.status(400).json({ error: "Prompt cannot be empty." });
    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
         return res.status(400).json({ error: 'Invalid conversation ID format.' });
    }

    console.log(`[User ${userId}] Adding message to conversation ${conversationId}. Prompt: "${prompt.substring(0, 50)}..."`);

    try {
        // 1. Find the conversation first to ensure it exists and belongs to user
        const conversation = await Conversation.findOne({ _id: conversationId, userId: userId });
        if (!conversation) {
             console.log(`[User ${userId}] Conversation not found or not authorized for adding message: ${conversationId}`);
            return res.status(404).json({ error: 'Conversation not found.' });
        }

        // 2. Get bot response (using your existing logic)
        const timeout = 45000;
        console.log(`[User ${userId}] Calling generateChatbotAnswer...`);
        const result = await Promise.race([
            generateChatbotAnswer(prompt), // Pass context if needed: generateChatbotAnswer(prompt, conversation.messages)
            new Promise((_, reject) => setTimeout(() => reject(new Error("Chatbot request timed out")), timeout))
        ]);

        if (!result || typeof result.answer !== 'string' || !result.answer.trim()) {
            throw new Error("Invalid chatbot response format received from generation logic.");
        }
        const botAnswer = result.answer;
        console.log(`[User ${userId}] Bot response received for conversation ${conversationId}.`);

        // 3. Prepare message objects
        const userMessage = { role: 'user', content: prompt.trim(), timestamp: new Date() };
        const botMessage = { role: 'bot', content: botAnswer, timestamp: new Date() };

        // 4. Update the conversation document
        // Use findByIdAndUpdate to push both messages and update lastActivity atomically
        const updatedConversation = await Conversation.findByIdAndUpdate(
            conversationId,
            {
                $push: { messages: { $each: [userMessage, botMessage] } },
                $set: { lastActivity: botMessage.timestamp } // Explicitly set last activity time
            },
            { new: true } // Option to return the updated doc if needed, though not strictly required here
        );

        if (!updatedConversation) {
             // Should not happen if conversation was found initially, but handle defensively
             throw new Error("Failed to update conversation after getting bot response.");
        }

        console.log(`[User ${userId}] User/Bot messages saved to conversation ${conversationId}.`);

        // 5. Send only the bot's answer back to the frontend
        res.status(200).json({ answer: botAnswer });

    } catch (error) {
        console.error(`[User ${userId}] Error processing message for conversation ${conversationId}:`, error);
        // Set appropriate status code based on error type
        if (error.message?.toLowerCase().includes("timed out")) { error.status = 408; }
        else if (error.message?.toLowerCase().includes("invalid chatbot response format")) { error.status = 502; }
        next(error); // Pass to global error handler
    }
});
console.log('✅ Mounted POST /api/conversations/:id/messages');

// DELETE /api/conversations/:id - Delete a specific conversation
app.delete('/api/conversations/:id', authMiddleware, async (req, res, next) => {
    const userId = req.user.id;
    const conversationId = req.params.id;
    console.log(`[User ${userId}] Deleting conversation: ${conversationId}`);

    try {
         if (!mongoose.Types.ObjectId.isValid(conversationId)) {
             return res.status(400).json({ error: 'Invalid conversation ID format.' });
        }
        // Find and delete the conversation belonging to the user
        const result = await Conversation.deleteOne({ _id: conversationId, userId: userId });

        if (result.deletedCount === 0) {
            console.log(`[User ${userId}] Conversation not found or not authorized for deletion: ${conversationId}`);
            return res.status(404).json({ error: 'Conversation not found or you do not have permission to delete it.' });
        }

        console.log(`[User ${userId}] Conversation ${conversationId} deleted successfully.`);
        res.status(200).json({ message: 'Conversation deleted successfully.' }); // Use 200 or 204 (No Content)

    } catch (error) {
        console.error(`[User ${userId}] Error deleting conversation ${conversationId}:`, error);
        next(error);
    }
});
console.log('✅ Mounted DELETE /api/conversations/:id');
// server.js -> Add this route handler

// POST /api/chatbot - Handles single-chat interaction
// Example Express route
app.post('/api/chatbot', async (req, res) => {
    console.log('--- Received /api/chatbot request ---'); // Log request start
    try {
      const { prompt, history } = req.body;
      console.log('Received prompt:', prompt);
      console.log('Received history length:', history?.length || 0); // Log history length
  
      if (!prompt) {
        console.log('Error: No prompt received.');
        return res.status(400).json({ error: 'Prompt is required.' });
      }
  
      // Log before calling the core logic
      console.log('Calling generateChatbotAnswer...');
      const result = await generateChatbotAnswer(prompt, history || []);
      console.log('generateChatbotAnswer returned:', result); // Log successful result
  
      res.status(200).json(result); // Send back { answer: "..." }
  
    } catch (error) {
      // ★★★ Log the DETAILED error here ★★★
      console.error("--- ERROR in /api/chatbot route ---");
      console.error("Error Message:", error.message);
      console.error("Error Stack:", error.stack); // Log the full stack trace
      // Optionally log the original error object if it has more details
      // console.error("Full Error Object:", error);
  
      // Send a generic error response, but the logs are key
      res.status(500).json({ error: error.message || 'Failed to get response from chatbot.' });
    }
    console.log('--- Finished /api/chatbot request ---');
  });
console.log('✅ Mounted POST /api/chatbot (Inline - Single Chat Model)');

// ★ REMOVE OR COMMENT OUT the multi-conversation routes for now ★
// app.get('/api/conversations', ...);
// app.post('/api/conversations', ...);
// app.get('/api/conversations/:id/messages', ...);
// app.post('/api/conversations/:id/messages', ...);
// app.delete('/api/conversations/:id', ...);

// --- END Conversation Routes ---


// --- Generic Email Route (Consider adding protection) ---
app.post('/api/send-email', async (req, res, next) => {
    const { to, subject, message, html } = req.body;
    if (!to || !subject || !message) return res.status(400).json({ error: 'Required fields: to, subject, message.' });
    try {
        await sendEmail(to, subject, message, html); // Use imported utility
        res.status(200).json({ message: '✅ Email sent successfully' });
    } catch (err) { next(err); } // Pass errors (like "service unavailable")
});
console.log('✅ Mounted POST /api/send-email (Inline)');


// --- Mount External Routes (Example: Experiences) ---
app.use('/api/experiences', experienceRoutes);
console.log('✅ Mounted /api/experiences (External Router)');


// =============================================
// --- Health Check & Final Middleware ---
// =============================================
app.get('/health', (req, res) => res.status(200).json({ status: 'ok', uptime: `${process.uptime().toFixed(2)}s`, mongo: mongoose.connection.readyState === 1 ? 'connected' : `disconnected (${mongoose.connection.readyState})`, timestamp: new Date().toISOString() }));
console.log('✅ Mounted GET /health');

// --- 404 Not Found Handler ---
app.use((req, res, next) => { const err = new Error(`Not Found - ${req.method} ${req.originalUrl}`); err.status = 404; next(err); });

// --- Global Error Handler ---
app.use((err, req, res, next) => {
    console.error('❌ SERVER ERROR:', { status: err.status || 500, message: err.message, url: req.originalUrl, stack: process.env.NODE_ENV === 'development' ? err.stack : ' suppressed ' });
    const statusCode = err.status || 500;
    res.status(statusCode).json({
        error: (statusCode === 500 && process.env.NODE_ENV !== 'development') ? 'Internal Server Error' : err.message || 'An unexpected error occurred.'
    });
});

// =============================================
// --- Start Server ---
// =============================================
// --- Start Server ---
app.listen(PORT, () => {
    // Corrected log message:
    console.log(`\n🚀 Server running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
});

export default app; // Export for testing
