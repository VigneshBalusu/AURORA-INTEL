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
  const showTemporaryFeedback = useCallback((type, message, duration = 4000) => {
      if (feedback.timerId) clearTimeout(feedback.timerId);
      const newTimerId = setTimeout(() => {
          setFeedback(prev => (prev.message === message ? { type: '', message: '', show: false, timerId: null } : prev));
      }, duration);
      setFeedback({ type, message, show: true, timerId: newTimerId });
  }, [feedback.timerId]);

  // --- Effect to check token presence on mount ---
  useEffect(() => {
      if (!token) {
           console.error("ResetPassword Component: No token found in URL parameter.");
           setIsTokenInvalid(true);
           showTemporaryFeedback('failure', 'Invalid password reset link: The link appears to be incomplete or broken.', 10000);
      }
  }, [token, showTemporaryFeedback]);

  // --- Form Submission Handler ---
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (feedback.timerId) clearTimeout(feedback.timerId);
    setFeedback({ type: '', message: '', show: false, timerId: null });

    // Frontend Validations
    if (!token) { 
        showTemporaryFeedback('failure', 'Cannot reset password: The reset link is invalid or missing a token.'); 
        setIsTokenInvalid(true);
        return; 
    }
    if (!password || !confirmPassword) { 
        showTemporaryFeedback('failure', 'Please enter and confirm your new password.'); 
        return; 
    }
    if (password.length < 6) {
        showTemporaryFeedback('failure', 'Password must be at least 6 characters long.'); 
        return; 
    }
    if (password !== confirmPassword) { 
        showTemporaryFeedback('failure', 'Passwords do not match.'); 
        return; 
    }

    // ★★★ DEBUG LOGS (Optional: Remove when working) ★★★
    console.log("FRONTEND: Submitting to backend. Password state:", password ? "******" : "EMPTY"); // Don't log actual password
    console.log("FRONTEND: Submitting to backend. ConfirmPassword state:", confirmPassword ? "******" : "EMPTY");
    console.log("FRONTEND: Submitting to backend. Payload being sent:", { password: password ? "******" : "EMPTY", confirmPassword: confirmPassword ? "******" : "EMPTY" });
    // ★★★ END DEBUG LOGS ★★★

    setIsLoading(true);
    try {
      console.log(`Attempting password reset. Token prefix: ${token ? token.substring(0, 8) : 'N/A'}...`);
      
      const response = await axios.post(`${API_BASE_URL}/api/auth/reset-password/${token}`, {
        password,         // Send the password state
        confirmPassword,  // ★★★ THIS LINE IS NOW UNCOMMENTED AND CORRECT ★★★
      }, { timeout: 15000 });

      // --- Success ---
      console.log("Password reset successful:", response.data);
      showTemporaryFeedback('success', response.data.message || '✅ Password reset successfully!', 5000);
      setIsTokenInvalid(true);
      setTimeout(() => navigate('/login'), 2500);

    } catch (error) {
      console.error('Reset Password Error:', error);
      let errorMsg = 'Failed to reset password. Please try again later.'; 

      if (error.response) {
          console.error('Server Error Details:', { status: error.response.status, data: error.response.data }); // Inspect this data object
          errorMsg = error.response.data?.error || error.response.data?.message || `Server error (${error.response.status})`;
          
          if ((error.response.status === 400 || error.response.status === 404) && 
              (errorMsg.toLowerCase().includes('token') || 
               errorMsg.toLowerCase().includes('invalid') || 
               errorMsg.toLowerCase().includes('expired'))) {
                errorMsg = 'This password reset link is invalid or has expired. Please request a new one.';
                setIsTokenInvalid(true);
          }
      } else if (error.request) {
          console.error('Network Error: No response received.', error.request);
          errorMsg = "Network Error: Could not reach the server. Please check your connection.";
      } else if (error.code === 'ECONNABORTED') {
          console.error('Request Timeout Error:', error.message);
          errorMsg = "The request timed out. Please try again.";
      } else {
          console.error('Error setting up request:', error.message);
      }
      showTemporaryFeedback('failure', errorMsg, 6000);
    } finally {
      setIsLoading(false);
    }
  };

  // --- Render Logic ---
  return (
    <div className="auth-container">

      <div className={`feedback-card ${feedback.type} ${feedback.show ? 'show' : ''}`}>
        {feedback.message}
      </div>

      <form className="auth-form reset-password-form" onSubmit={handleSubmit} noValidate>
        <h2 className='form-title'>Reset Password</h2>

        {isTokenInvalid && !feedback.show && (
            <p className="form-description error-text">
                This password reset link is invalid or has expired. Please request a new link.
            </p>
        )}

        {!isTokenInvalid && (
          <>
            <p className="form-description">Enter and confirm your new password below.</p>
            
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

            <button 
                type="submit" 
                className="submit-btn" 
                disabled={isLoading || !token}
            >
                {isLoading ? 'Resetting...' : 'Set New Password'}
            </button>
          </>
        )}

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