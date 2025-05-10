// src/components/ResetPassword.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import '../assets/styles/AuthForms.css'; // Ensure this shared CSS file is imported

// API Base URL - ensure VITE_API_BASE_URL is set correctly in your environment
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

const ResetPassword = () => {
  const { token } = useParams(); // Get token from URL parameter (this is the raw token)
  const navigate = useNavigate();

  // --- State Management ---
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState({ type: '', message: '', show: false, timerId: null });
  const [isTokenInvalid, setIsTokenInvalid] = useState(false); // Tracks if the token is known to be invalid/expired/used

  // --- Feedback Helper ---
  // useCallback to memoize the function and prevent unnecessary re-renders if passed as prop
  const showTemporaryFeedback = useCallback((type, message, duration = 4000) => {
      // Clear existing timer if a new feedback is shown quickly
      if (feedback.timerId) clearTimeout(feedback.timerId);
      
      const newTimerId = setTimeout(() => {
          // Only hide if the message hasn't changed in the meantime (prevents race conditions)
          setFeedback(prev => (prev.message === message ? { type: '', message: '', show: false, timerId: null } : prev));
      }, duration);
      
      setFeedback({ type, message, show: true, timerId: newTimerId });
  }, [feedback.timerId]); // Dependency: only recreate if feedback.timerId instance changes (which it does on setFeedback)

  // --- Effect to check token presence on mount ---
  useEffect(() => {
      if (!token) {
           console.error("ResetPassword Component: No token found in URL parameter.");
           setIsTokenInvalid(true); // Mark as invalid, which will hide the form
           // Provide clear feedback that the link itself is broken (missing token part)
           showTemporaryFeedback('failure', 'Invalid password reset link: The link appears to be incomplete or broken.', 10000);
      }
  }, [token, showTemporaryFeedback]); // Dependencies: re-run if token or the feedback function changes

  // --- Form Submission Handler ---
  const handleSubmit = async (e) => {
    e.preventDefault();
    // Clear any previous feedback before new submission attempt
    if (feedback.timerId) clearTimeout(feedback.timerId);
    setFeedback({ type: '', message: '', show: false, timerId: null });

    // Frontend Validations
    if (!token) { 
        showTemporaryFeedback('failure', 'Cannot reset password: The reset link is invalid or missing a token.'); 
        setIsTokenInvalid(true); // Ensure form remains hidden
        return; 
    }
    if (!password || !confirmPassword) { 
        showTemporaryFeedback('failure', 'Please enter and confirm your new password.'); 
        return; 
    }
    if (password.length < 6) { // Ensure this matches your backend validation for password length
        showTemporaryFeedback('failure', 'Password must be at least 6 characters long.'); 
        return; 
    }
    if (password !== confirmPassword) { 
        showTemporaryFeedback('failure', 'Passwords do not match.'); 
        return; 
    }

    setIsLoading(true);
    try {
      console.log(`Attempting password reset. Token prefix: ${token ? token.substring(0, 8) : 'N/A'}...`);
      // The 'token' here is the raw token from the URL
      const response = await axios.post(`${API_BASE_URL}/api/auth/reset-password/${token}`, {
        password, // Backend will receive this in req.body.password
        // confirmPassword, // Usually backend only needs 'password' and does its own re-validation if needed,
                           // but sending both is fine if your backend expects it.
                           // Your backend logic already has password and confirmPassword in req.body
      }, { timeout: 15000 }); // Request timeout

      // --- Success ---
      console.log("Password reset successful:", response.data);
      showTemporaryFeedback('success', response.data.message || '✅ Password reset successfully!', 5000);
      setIsTokenInvalid(true); // Mark token as used/invalid to prevent re-submission and hide form
      setTimeout(() => navigate('/login'), 2500); // Redirect to login after a short delay

    } catch (error) {
      console.error('Reset Password Error:', error);
      let errorMsg = 'Failed to reset password. Please try again later.'; // Default error

      if (error.response) {
          // The request was made and the server responded with a status code
          // that falls out of the range of 2xx
          console.error('Server Error Details:', { status: error.response.status, data: error.response.data });
          errorMsg = error.response.data?.error || error.response.data?.message || `Server error (${error.response.status})`;
          
          // Specifically check if backend indicates token invalid/expired (e.g., status 400 or 404)
          // Adjust status codes based on what your backend actually returns for bad tokens
          if ((error.response.status === 400 || error.response.status === 404) && 
              (errorMsg.toLowerCase().includes('token') || 
               errorMsg.toLowerCase().includes('invalid') || 
               errorMsg.toLowerCase().includes('expired'))) {
                errorMsg = 'This password reset link is invalid or has expired. Please request a new one.';
                setIsTokenInvalid(true); // Mark token as bad, hide form
          }
      } else if (error.request) {
          // The request was made but no response was received
          console.error('Network Error: No response received.', error.request);
          errorMsg = "Network Error: Could not reach the server. Please check your connection.";
      } else if (error.code === 'ECONNABORTED') {
          // Request timed out
          console.error('Request Timeout Error:', error.message);
          errorMsg = "The request timed out. Please try again.";
      } else {
          // Something happened in setting up the request that triggered an Error
          console.error('Error setting up request:', error.message);
      }
      showTemporaryFeedback('failure', errorMsg, 6000); // Show error for longer
    } finally {
      setIsLoading(false);
    }
  };

  // --- Render Logic ---
  return (
    <div className="auth-container">

      {/* Feedback Card - Displays success or error messages */}
      <div className={`feedback-card ${feedback.type} ${feedback.show ? 'show' : ''}`}>
        {feedback.message}
      </div>

      <form className="auth-form reset-password-form" onSubmit={handleSubmit} noValidate>
        <h2 className='form-title'>Reset Password</h2>

        {/* Conditional rendering based on token validity */}
        {isTokenInvalid && !feedback.show && ( // Show this only if token is bad AND no other feedback is active
            <p className="form-description error-text">
                This password reset link is invalid or has expired. Please request a new link.
            </p>
        )}

        {/* Render form fields only if token isn't (yet) known to be invalid */}
        {!isTokenInvalid && (
          <>
            <p className="form-description">Enter and confirm your new password below.</p>
            
            {/* New Password Field */}
            <div className="form-group">
                <label htmlFor="reset-password">New Password</label>
                <div className="password-container">
                    <input 
                        id="reset-password" 
                        type={showPassword ? "text" : "password"} 
                        placeholder="Min. 6 characters" 
                        value={password} 
                        onChange={(e) => setPassword(e.target.value)} 
                        required 
                        autoComplete="new-password" 
                        disabled={isLoading}
                    />
                    <button 
                        type="button" 
                        className="toggle-btn" 
                        onClick={() => setShowPassword(s => !s)} 
                        disabled={isLoading} 
                        title={showPassword ? 'Hide password' : 'Show password'}
                    >
                        {showPassword ? '👁️‍🗨️' : '👁️'} 
                    </button>
                </div>
            </div>

            {/* Confirm New Password Field */}
            <div className="form-group">
                <label htmlFor="reset-confirmPassword">Confirm New Password</label>
                <div className="password-container">
                    <input 
                        id="reset-confirmPassword" 
                        type={showConfirmPassword ? "text" : "password"} 
                        placeholder="Re-enter new password" 
                        value={confirmPassword} 
                        onChange={(e) => setConfirmPassword(e.target.value)} 
                        required 
                        autoComplete="new-password" 
                        disabled={isLoading}
                    />
                    <button 
                        type="button" 
                        className="toggle-btn" 
                        onClick={() => setShowConfirmPassword(s => !s)} 
                        disabled={isLoading} 
                        title={showConfirmPassword ? 'Hide password' : 'Show password'}
                    >
                        {showConfirmPassword ? '👁️‍🗨️' : '👁️'}
                    </button>
                </div>
            </div>

            {/* Submit Button */}
            <button 
                type="submit" 
                className="submit-btn" 
                disabled={isLoading || !token} // Also disable if no token initially
            >
                {isLoading ? 'Resetting...' : 'Set New Password'}
            </button>
          </>
        )}

        {/* Navigation Links - Content changes based on token validity */}
        <p className="redirect-text">
          {isTokenInvalid ? (
             <>Need a new link? <Link to="/forgot-password" className="link">Request Password Reset</Link></>
          ) : (
             <>Remembered your password? <Link to="/login" className="link">Back to Login</Link></>
          )}
        </p>
      </form>
    </div>
  );
};

export default ResetPassword;