import React, { useState, useEffect } from "react";
import { Link, Routes, Route, useNavigate, Navigate } from "react-router-dom";
import Home from "./Home";
import Contact from "./Contact";
import About from "./About";
import SignUp from "./SignUp";
import Login from "./Login";
import Profile from "./Profile";
import BlogPage from "./BlogPage";
import ForgotPassword from "./ForgotPassword";
import ResetPassword from "./ResetPassword";
import "../assets/styles/Navigation.css";

function Navigation({ isLoggedIn: isLoggedInProp, setIsLoggedIn: setIsLoggedInProp }) {
  const isLoggedIn = isLoggedInProp;
  const setIsLoggedIn = setIsLoggedInProp;

  const [visible, setVisible] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 769);
  const navigate = useNavigate();

  useEffect(() => {
    setVisible(true);
    const timer = setTimeout(() => setVisible(false), 2000);
    const handleMouseMove = (event) => setVisible(event.clientY < 80);
    const handleResize = () => {
      setIsMobile(window.innerWidth < 769);
      setMenuOpen(false); // Close menu when resizing to desktop
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("resize", handleResize);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  const toggleMenu = () => setMenuOpen(!menuOpen);
  const closeMenu = () => isMobile && setMenuOpen(false);

  return (
    <>
      <nav className={`navbar ${visible ? "show" : ""}`}>
        {isMobile && (
          <div className="menu-icon" onClick={toggleMenu}>
            <span>{menuOpen ? "✕" : "☰"}</span>
          </div>
        )}
        <ul className={`nav-links ${!isMobile || menuOpen ? "show" : ""}`}>
          <li><Link to="/home" onClick={closeMenu}>Home</Link></li>
          <li><Link to="/contact" onClick={closeMenu}>Contact</Link></li>
          <li><Link to="/about" onClick={closeMenu}>About</Link></li>
          <li><Link to="/blog" onClick={closeMenu}>Blog</Link></li>
          {isLoggedIn ? (
            <li><Link to="/profile" onClick={closeMenu}>Profile</Link></li>
          ) : (
            <li><Link to="/login" onClick={closeMenu}>Login/SignUp</Link></li>
          )}
        </ul>
      </nav>

      <div className="main-content-area">
        <Routes>
          <Route path="/home" element={<Home />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/about" element={<About />} />
          <Route path="/blog" element={<BlogPage />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password/:token" element={<ResetPassword />} />

          {!isLoggedIn && (
            <>
              <Route path="/login" element={<Login setIsLoggedIn={setIsLoggedIn} />} />
              <Route path="/signup" element={<SignUp />} />
              <Route path="/profile" element={<Navigate to="/login" replace />} />
            </>
          )}

          {isLoggedIn && (
            <>
              <Route path="/profile" element={<Profile setIsLoggedIn={setIsLoggedIn} />} />
              <Route path="/login" element={<Navigate to="/home" replace />} />
              <Route path="/signup" element={<Navigate to="/home" replace />} />
            </>
          )}

          <Route path="*" element={<Navigate to="/home" replace />} />
        </Routes>
      </div>
    </>
  );
}

export default Navigation;
