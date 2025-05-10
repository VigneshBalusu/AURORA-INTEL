// routes/experienceRoutes.js
import express from 'express';
import Experience from '../models/Experience.js'; // Model for experiences
import { authMiddleware } from '../middleware/auth.js'; // Middleware for protected routes
import { sendEmail } from '../utils/email.js'; // Updated to point to utils/email.js

const router = express.Router();

// --- GET All Experiences (Public Route - No Auth Needed) ---
router.get('/', async (req, res, next) => {
  console.log("[Backend GET /api/experiences] - 1. Request received.");
  try {
    console.time("fetchExperiencesDB");
    console.log("[Backend GET /api/experiences] - 2. Querying database...");

    const experiences = await Experience.find()
                                        .sort({ createdAt: -1 })
                                        .limit(100)
                                        .lean();

    console.timeEnd("fetchExperiencesDB");
    const count = experiences?.length ?? 0;
    console.log(`[Backend GET /api/experiences] - 3. Found ${count} experiences.`);

    if (!Array.isArray(experiences)) {
        console.error("[Backend GET /api/experiences] - ERROR: Result not an array!");
        throw new Error("Internal server error retrieving data.");
    }

    console.log("[Backend GET /api/experiences] - 4. Sending success response...");
    res.status(200).json(experiences);
  } catch (error) {
    console.error('❌ Error fetching experiences:', error.message);
    console.log("[Backend GET /api/experiences] - 5. Passing to error handler.");
    next(error);
  }
});

// --- POST a New Experience (Protected Route) ---
router.post('/', authMiddleware, async (req, res, next) => {
    console.log("[Backend POST /api/experiences] - 1. Request received.");
    try {
        if (!req.user) {
             console.error("Error: req.user not found!");
             return res.status(401).json({ error: 'Authentication failed unexpectedly.' });
        }

        const { _id: userId, name: userNameFromAuth, email: userEmailFromAuth, photo: userPhotoFromAuth } = req.user;
        const { experience, taggedEmail, messageToRecipient } = req.body;
        console.log("[Backend POST /api/experiences] - 2. Extracted data. Validating...");

        if (!experience || experience.trim() === '') {
            console.log("[Backend POST] - Validation Failed: Empty experience.");
            return res.status(400).json({ error: 'Experience text cannot be empty.' });
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (taggedEmail && taggedEmail.trim() !== '' && !emailRegex.test(taggedEmail.trim())) {
             console.log("[Backend POST] - Invalid taggedEmail format.");
             return res.status(400).json({ error: 'Invalid recipient email format provided.' });
        }
        console.log("[Backend POST] - 3. Validation passed.");

        const processedTaggedEmail = taggedEmail ? taggedEmail.trim().toLowerCase() : null;

        const newExperience = new Experience({
            experience: experience.trim(),
            taggedEmail: processedTaggedEmail,
            messageToRecipient: (processedTaggedEmail && messageToRecipient) ? messageToRecipient.trim() : null,
            userId,
            userName: userNameFromAuth,
            userEmail: userEmailFromAuth,
            userPhoto: userPhotoFromAuth || '/uploads/default-profile-placeholder.png'
        });

        console.log("[Backend POST] - 4. Saving to DB...");
        const savedExperience = await newExperience.save();
        console.log(`[Backend POST] - 5. Saved with ID: ${savedExperience._id}`);

        // Send email notification if tagged
        if (savedExperience.taggedEmail) {
            console.log(`[Backend POST] - 6. Sending email to ${savedExperience.taggedEmail}`);
            const appName = "Aurora Intel";
            const frontendUrl = 'https://auroraintel.netlify.app';
            const subject = `${savedExperience.userName} shared an experience with you on ${appName}!`;

            let emailText = `Hi there,\n\n`;
            emailText += `${savedExperience.userName} (${savedExperience.userEmail}) shared an experience on ${appName} and mentioned you:\n\n`;
            emailText += `"${savedExperience.experience}"\n\n`;
            if (savedExperience.messageToRecipient) {
                emailText += `They added this message for you:\n"${savedExperience.messageToRecipient}"\n\n`;
            }
            emailText += `You can view all experiences here: ${frontendUrl}/blog\n\n`;
            emailText += `Thanks,\nThe ${appName} Team`;

            sendEmail(savedExperience.taggedEmail, subject, emailText)
                .then(info => console.log(`[Backend POST] - Email sent. Message ID: ${info.messageId}`))
                .catch(emailError => {
                    console.error(`❌ Email failed to ${savedExperience.taggedEmail}: ${emailError.message}`);
                });
        } else {
            console.log("[Backend POST] - 6. No email tagging, skipping email.");
        }

        console.log("[Backend POST] - 7. Responding to client.");
        res.status(201).json({ message: 'Experience added successfully!', experience: savedExperience });

    } catch (error) {
        console.error('❌ Error adding experience:', error.message);
        console.log("[Backend POST] - 9. Handling error...");

        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(err => err.message);
            return res.status(400).json({ error: `Validation Failed: ${messages.join(', ')}` });
        }

        if (error.code === 11000) {
            return res.status(409).json({ error: 'A duplicate entry was detected.' });
        }

        next(error);
    }
});

export default router;
