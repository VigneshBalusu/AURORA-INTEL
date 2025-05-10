// src/components/ForgotPassword.jsx
import React, { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import '../assets/styles/AuthForms.css'; // Ensure this shared CSS file is imported

// API Base URL (Defined Directly - Consistent)
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState({ type: '', message: '', show: false, timerId: null });

  // --- Helper: Show Temporary Feedback ---
  const showTemporaryFeedback = useCallback((type, message, duration = 5000) => {
      if (feedback.timerId) clearTimeout(feedback.timerId);
      const newTimerId = setTimeout(() => {
          setFeedback(prev => (prev.message === message ? { type: '', message: '', show: false, timerId: null } : prev));
      }, duration);
      setFeedback({ type, message, show: true, timerId: newTimerId });
  }, [feedback.timerId]);

  // --- Form Submission Handler ---
  const handleSubmit = async (e) => {
    e.preventDefault();
    setFeedback({ type: '', message: '', show: false, timerId: null }); // Clear old feedback

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email.trim())) {
      showTemporaryFeedback('failure', 'Please enter a valid email address.');
      return;
    }

    setIsLoading(true);
    try {
      const targetEmail = email.trim().toLowerCase();
      console.log(`Requesting password reset for ${targetEmail}...`);
      const response = await axios.post(`${API_BASE_URL}/api/auth/forgot-password`,
        { email: targetEmail },
        { timeout: 15000 }
      );

      // Show the generic success message from backend
      showTemporaryFeedback('success', response.data.message || 'If an account exists, a reset link has been sent to email .');
      // setEmail(''); // Optionally clear email field

    } catch (error) {
      console.error('Forgot Password Error:', error);
      let errorMsg = 'An error occurred. Please try again later.';
      if (error.response) {
         console.error('Server Error:', { status: error.response.status, data: error.response.data});
         // Still keep error generic for forgot password to avoid email enumeration
         errorMsg = error.response.data?.error || 'Failed to process request.';
      } else if (error.request) { errorMsg = "Network Error: Could not reach server."; }
        else if (error.code === 'ECONNABORTED') { errorMsg = "Request timed out."; }
      showTemporaryFeedback('failure', errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  // --- Render Logic ---
  return (
    <div className="auth-container">
      {/* Feedback Card */}
      <div className={`feedback-card ${feedback.type} ${feedback.show ? 'show' : ''}`}>
          {feedback.message}
      </div>

      <form className="auth-form forgot-password-form" onSubmit={handleSubmit}>
        <h2 className='form-title'>Forgot Password</h2>
        <p className="form-description">
            Enter your account's email address below and we will send you a link to reset your password.
        </p>

        <div className="form-group">
          <label htmlFor="forgot-email">Email Address</label>
          <input
            id="forgot-email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            disabled={isLoading}
          />
        </div>

        <button type="submit" className="submit-btn" disabled={isLoading}>
          {isLoading ? 'Sending Link...' : 'Send Password Reset Link'}
        </button>

        <p className="redirect-text">
          Remember your password? <Link to="/login" className="link">Back to Login</Link>
        </p>
      </form>
    </div>
  );
};

export default ForgotPassword;