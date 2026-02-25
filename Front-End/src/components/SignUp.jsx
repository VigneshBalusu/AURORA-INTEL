// src/components/SignUp.jsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import '../assets/styles/SignUp.css'; // Ensure CSS has styles for .feedback-card

// --- ★ API Base URL (Define Directly - Consistent with Login fix) ★ ---
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000"; // Replace if needed

const SignUp = () => {
  const navigate = useNavigate();

  // --- State ---
  const [formStage, setFormStage] = useState('details'); // 'details', 'otp', 'success'
  const [formData, setFormData] = useState({ name: '', email: '', password: '', confirmPassword: '' });
  const [otp, setOtp] = useState(''); // User's input for OTP
  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState({ type: '', message: '', show: false }); // Unified feedback
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // OTP Resend Timer State
  const [canResendOtp, setCanResendOtp] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);
  const timerIntervalRef = useRef(null);

  // --- Helper Functions ---
  // Show temporary feedback messages
  const showTemporaryFeedback = (type, message, duration = 3500) => {
      // Clear any existing timer to prevent premature hiding if called rapidly
      if (feedback.timerId) clearTimeout(feedback.timerId);

      const newTimerId = setTimeout(() => {
          // Only clear if the currently displayed message is the one this timer was for
          setFeedback(prev => prev.message === message ? { type: '', message: '', show: false, timerId: null } : prev);
      }, duration);

      setFeedback({ type, message, show: true, timerId: newTimerId });
  };

  // --- OTP Timer Logic ---
  useEffect(() => { // Mount/unmount cleanup
    return () => { if (timerIntervalRef.current) clearInterval(timerIntervalRef.current); };
  }, []);

  useEffect(() => { // Countdown logic
    let intervalId = null;
    if (resendTimer > 0) {
      setCanResendOtp(false);
      intervalId = setInterval(() => {
        setResendTimer(prevTimer => {
          const newTime = prevTimer - 1;
          if (newTime <= 0) {
            clearInterval(intervalId);
            setCanResendOtp(true);
            return 0;
          }
          return newTime;
        });
      }, 1000);
      timerIntervalRef.current = intervalId;
    } else {
      setCanResendOtp(true); // Ensure enabled if timer starts/resets to 0
    }
    return () => { if (intervalId) clearInterval(intervalId); }; // Cleanup
  }, [resendTimer]);

  const startOtpTimer = useCallback(() => {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    setResendTimer(60); // Start timer (e.g., 60 seconds)
    setCanResendOtp(false); // Disable resend button immediately
  }, []);

  // --- Input Handlers ---
  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
     if (feedback.show && feedback.type === 'failure') setFeedback({type:'', message:'', show: false}); // Clear errors on input
  };

  const handleOtpChange = (e) => {
    const value = e.target.value.replace(/\D/g, ''); // Digits only
    if (value.length <= 6) {
       setOtp(value);
       // Clear only OTP-related errors when typing OTP
       if (feedback.show && feedback.type === 'failure' && feedback.message.toLowerCase().includes('otp')) {
           setFeedback({type:'', message:'', show: false});
       }
    }
  };

  const togglePasswordVisibility = (field) => {
    if (field === 'password') setShowPassword(s => !s);
    if (field === 'confirmPassword') setShowConfirmPassword(s => !s);
  };

  // --- API Handlers ---
  // Step 1: Request OTP (or Resend)
  const handleRequestOtp = async (isResend = false) => {
    // Clear feedback specifically on new request/resend attempts
    setFeedback({ type: '', message: '', show: false });

    // Validation (skip full validation on resend, only check email)
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!formData.email?.trim() || !emailRegex.test(formData.email.trim())) {
       showTemporaryFeedback('failure', "Please enter a valid email address."); return;
    }
    if (!isResend) {
        if (!formData.name?.trim() || !formData.password || !formData.confirmPassword) { showTemporaryFeedback('failure', "Please fill in all required account details."); return; }
        if (formData.password.length < 6) { showTemporaryFeedback('failure', "Password must be at least 6 characters long."); return; }
        if (formData.password !== formData.confirmPassword) { showTemporaryFeedback('failure', "Passwords do not match!"); return; }
    }

    setIsLoading(true);
    setCanResendOtp(false); // Disable resend button during request

    try {
      const targetEmail = formData.email.trim().toLowerCase();
      console.log(`Requesting OTP${isResend ? ' (Resend)' : ''} for: ${targetEmail}`);

      // ✅ FIX: Increased timeout to 60000ms to allow Render to wake up
      const response = await axios.post(`${API_BASE_URL}/api/auth/request-otp`, { email: targetEmail }, { timeout: 60000 });

      showTemporaryFeedback('success', response.data?.message || `✅ OTP (re)sent to ${targetEmail}.`);
      if (!isResend) {
           setFormStage('otp'); // Move to OTP stage only on initial request
      }
      setOtp(''); // Clear old OTP input on successful send/resend
      startOtpTimer(); // Start/Restart the timer
      console.log("OTP request/resend successful, timer started.");

    } catch (error) {
       console.error(`Error ${isResend ? 'resending' : 'requesting'} OTP:`, error);
       let errMsg = `❌ Failed to ${isResend ? 'resend' : 'send'} OTP.`;
        if (error.response) { // Error from server
            errMsg = error.response.data?.error || error.response.data?.message || errMsg;
            if (error.response.status === 409) errMsg += " Email already exists. Please Login.";
       } else if (error.request) { // Network error
            errMsg = "❌ Network error: Could not reach server for OTP.";
       } else if (error.code === 'ECONNABORTED') {
           errMsg = "❌ Request timed out sending OTP. The server might still be waking up.";
       }
        showTemporaryFeedback('failure', errMsg);
        setCanResendOtp(true); // Allow retry on error
    } finally {
       setIsLoading(false); // Stop loading indicator
    }
  };

  // Step 2: Verify OTP & Sign Up
  const handleVerifyOtpAndSignup = async (e) => {
    e.preventDefault();
    setFeedback({ type: '', message: '', show: false }); // Clear previous feedback

    if (!otp || otp.length !== 6 || !/^\d{6}$/.test(otp)) {
        showTemporaryFeedback('failure', "Please enter the 6-digit OTP sent to your email.");
        return;
    }
    // Ensure required form data exists (should not happen normally)
    if (!formData.name || !formData.email || !formData.password) {
        showTemporaryFeedback('failure', "Account details are missing. Please go back.", 5000);
        setFormStage('details');
        return;
    }

    setIsLoading(true);

    try {
      console.log("Verifying OTP and creating account...");
      
      // ✅ FIX: Increased timeout to 60000ms here as well
      const response = await axios.post(`${API_BASE_URL}/api/auth/verify-otp`, {
        name: formData.name.trim(),
        email: formData.email.trim().toLowerCase(),
        password: formData.password, // Send plain password
        otp: otp,
      }, { timeout: 60000 });

      console.log("Signup/Verification success:", response.data);
       // Use a non-temporary success message for the final stage
       setFeedback({ type: 'success', message: "✅ Account Created Successfully!", show: true});
      setFormStage('success'); // Move to final success stage
      // Clear sensitive data after success
      setFormData({ name: '', email: '', password: '', confirmPassword: ''});
      setOtp('');

      // Redirect after a longer delay to show success
      setTimeout(() => { navigate("/login"); }, 3000);

    } catch (error) {
       console.error("Error verifying OTP / Signup:", error);
       let errMsg = "❌ OTP verification failed.";
       if (error.response) { // Server responded with error
           errMsg = error.response.data?.error || errMsg;
           // Give a hint based on common backend error message content
           if (errMsg.toLowerCase().includes('invalid') || errMsg.toLowerCase().includes('expired')) {
                errMsg = "❌ Invalid or expired OTP. Please check the code or click Resend.";
           }
           // No need to clear OTP here - let user see what failed maybe? Or clear: setOtp('');
       } else if (error.request) { // Network error
            errMsg = "❌ Network error during verification.";
       } else if (error.code === 'ECONNABORTED'){
            errMsg = "❌ Verification request timed out.";
       } else { // Other errors
           errMsg = "❌ An unexpected error occurred during signup.";
       }
       showTemporaryFeedback('failure', errMsg);
       // Crucially, allow user to resend OTP after a verification failure
       setCanResendOtp(true);
       // Maybe stop the timer explicitly if it was running?
       // if (timerIntervalRef.current) clearInterval(timerIntervalRef.current); setResendTimer(0);
    } finally {
        setIsLoading(false); // Stop loading
    }
  };

  // --- Render Logic ---
  return (
    <div className="signup-container">

      {/* Feedback Card - Uses unified state */}
      <div className={`feedback-card ${feedback.type} ${feedback.show ? 'show' : ''}`}>
         {feedback.message}
      </div>

      {/* Stage 1: Details Form */}
      {formStage === 'details' && (
        <form className="signup-form" onSubmit={(e) => { e.preventDefault(); handleRequestOtp(false); }}>
            <h2 className='form-title'>Create Account</h2>
            {/* Name */}
            <div className="form-group">
                <label htmlFor="signup-name">Full Name</label>
                <input type="text" id="signup-name" name="name" value={formData.name} onChange={handleChange} placeholder="Your Name" required disabled={isLoading} />
            </div>
            {/* Email */}
            <div className="form-group">
                <label htmlFor="signup-email">Email Address</label>
                <input type="email" id="signup-email" name="email" value={formData.email} onChange={handleChange} placeholder="you@example.com" required autoComplete="email" disabled={isLoading} />
            </div>
            {/* Password */}
            <div className="form-group">
                <label htmlFor="signup-password">Password</label>
                <div className="password-container">
                <input type={showPassword ? 'text' : 'password'} id="signup-password" name="password" value={formData.password} onChange={handleChange} placeholder="Min. 6 characters" required autoComplete="new-password" disabled={isLoading} />
                <button type="button" className="toggle-btn" onClick={() => togglePasswordVisibility('password')} disabled={isLoading} title={showPassword ? 'Hide' : 'Show'}> {showPassword ? '👁️‍🗨️' : '👁️'} </button>
                </div>
            </div>
            {/* Confirm Password */}
            <div className="form-group">
                <label htmlFor="signup-confirmPassword">Confirm Password</label>
                <div className="password-container">
                <input type={showConfirmPassword ? 'text' : 'password'} id="signup-confirmPassword" name="confirmPassword" value={formData.confirmPassword} onChange={handleChange} placeholder="Re-enter password" required autoComplete="new-password" disabled={isLoading}/>
                <button type="button" className="toggle-btn" onClick={() => togglePasswordVisibility('confirmPassword')} disabled={isLoading} title={showConfirmPassword ? 'Hide' : 'Show'}> {showConfirmPassword ? '👁️‍🗨️' : '👁️'} </button>
                </div>
            </div>
            {/* Submit (Request OTP) */}
            <button type="submit" className="submit-btn" disabled={isLoading}>
                {isLoading ? 'Processing...' : 'Send Verification Code'}
            </button>
            {/* Login Link */}
            <p className="redirect-text">
                Already have an account?{' '}
                <span className="link" onClick={() => !isLoading && navigate('/login')} role="link" tabIndex={isLoading ? -1 : 0}> Login Instead </span>
            </p>
        </form>
      )}

      {/* Stage 2: OTP Verification Form */}
      {formStage === 'otp' && (
         <form className="signup-form otp-form" onSubmit={handleVerifyOtpAndSignup}>
            <h2 className='form-title'>Verify your Email </h2>

             <p className="otp-info-text">Enter the 6-digit code sent to <br/><strong>{formData.email}</strong></p>
            <p className="otp-info-text">Check your spam folder if you don't see it.</p>
            <p className="otp-info-text">If you didn't receive it, click Resend.</p>
             {/* OTP Input */}
            <div className="form-group otp-input-group">
                <label htmlFor="otp">Verification Code (6 digits)</label>
                <input
                    type="text"
                    id="otp"
                    name="otp"
                    value={otp}
                    onChange={handleOtpChange}
                    placeholder="------"
                    maxLength="6"
                    required
                    autoComplete="one-time-code"
                    inputMode="numeric"
                    pattern="\d{6}"
                    className="otp-input-field" // Specific class for potential styling
                    disabled={isLoading}
                />
            </div>

            {/* Timer & Resend */}
            <div className="otp-timer-section">
                {resendTimer > 0 && <p>Resend available in: {resendTimer}s</p>}
                <button
                    type="button"
                    className="resend-otp-btn link"
                    onClick={() => handleRequestOtp(true)} // Resend OTP action
                    disabled={!canResendOtp || isLoading}
                >
                    {isLoading && !canResendOtp ? 'Sending...' : 'Resend OTP'}
                </button>
            </div>

            {/* Verify Button */}
            <button type="submit" className="submit-btn" disabled={isLoading || otp.length !== 6}>
                {isLoading ? 'Verifying...' : 'Verify & Create Account'}
            </button>

            {/* Go Back */}
            <p className="redirect-text small-text">
                Incorrect email?{' '}
                <span className="link" onClick={() => { setFormStage('details'); setFeedback({ type: '', message: '', show: false}); }} role="link" tabIndex={0}>
                 Go Back
                </span>
            </p>
         </form>
      )}

      {/* Stage 3: Success */}
      {formStage === 'success' && (
        <div className="signup-form success-display">
           <h2 className='form-title success-title'>🎉 Account Created!</h2>
           {/* Success feedback shown by the unified card */}
           <p className='success-text'>You will be redirected to the login page shortly.</p>
           <button type="button" className="submit-btn" onClick={() => navigate('/login')} style={{marginTop: '2rem'}}>Login Now</button>
        </div>
      )}

    </div> // End signup-container
  );
};

export default SignUp;
