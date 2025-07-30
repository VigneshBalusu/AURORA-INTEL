// src/components/Home.jsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

// --- Component Imports ---
import Input from './Input';
import PreviousChats from './PreviousChats';
import PreviewCard from './PreviewCard';
import ConfirmationDialog from './ConfirmationDialog';


// --- Asset Imports ---
import logo from '../assets/images/logo.jpeg';
import styles from '../assets/styles/Home.module.css';

// --- Constants ---
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

// --- Axios Instance ---
const axiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 25000,
});

// Axios Request Interceptor (Adds Auth Token)
axiosInstance.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    } else {
      console.warn("No token found for API request to:", config.url);
    }
    return config;
  },
  (error) => {
    console.error("Axios request interceptor error:", error);
    return Promise.reject(error);
  }
);

// --- Hardcoded FAQs ---
const hardcodedFaqs = [
    "What is AI?", "How does the AI work?", "What kind of questions can I ask?",
    "Is my data secure?", "How can I provide feedback?", "Explain machine learning simply.",
    "What are neural networks?", "What is natural language processing?",
    "How do I reset my password?", "who is the CEO of OpenAI?",
    "What is the latest version of GPT?",
];


// ==========================================================================
//          Home Component
// ==========================================================================
const Home = () => {
  // --- State ---
  const [username, setUsername] = useState('');
  const [isLoadingUser, setIsLoadingUser] = useState(true);
  const [error, setError] = useState('');
  const [promptText, setPromptText] = useState('');
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [isNewChatView, setIsNewChatView] = useState(true);
  const [chatMessages, setChatMessages] = useState([]);
  const [isLoadingReply, setIsLoadingReply] = useState(false);
  const [isFaqSidebarOpen, setIsFaqSidebarOpen] = useState(false);
  const [faqs, setFaqs] = useState(hardcodedFaqs);
  const [confirmationState, setConfirmationState] = useState({
    isOpen: false,
    message: '',
    chatIdToDelete: null,
});
 const [activePreview, setActivePreview] = useState(null);
 const [previewPosition, setPreviewPosition] = useState({ top: 0, left: 0 });
 const [previewData, setPreviewData] = useState([]);
 const leaveTimeoutRef = useRef(null);
  // --- State for Previous Chats ---
  const [currentChatId, setCurrentChatId] = useState(null);
  const [isPrevChatsOpen, setIsPrevChatsOpen] = useState(false);
  const [previousChats, setPreviousChats] = useState([]);
  const [isLoadingPrevChats, setIsLoadingPrevChats] = useState(false);
  const [deletingChatId, setDeletingChatId] = useState(null);

  // --- Refs ---
  const inputRef = useRef(null);
  const mainAreaRef = useRef(null);
  const chatEndRef = useRef(null);
  // ★ MODIFICATION: Add a ref to ensure the fetch runs only once per mount.
  const fetchAttempted = useRef(false);
  
  const navigate = useNavigate();

  // --- Utility Callbacks ---
  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, 50);
  }, []);

  // --- Event Handlers ---
  const handleInputChange = (newValue) => {
    setPromptText(newValue);
  };
  
  const handleFocus = () => setIsInputFocused(true);
  const handleBlur = () => setIsInputFocused(false);

  const toggleFaqSidebar = () => {
    setIsFaqSidebarOpen(prev => {
      const opening = !prev;
      if (opening) setIsPrevChatsOpen(false);
      return opening;
    });
  };

  const togglePrevChatsSidebar = useCallback(() => {
    setIsPrevChatsOpen(prev => {
        const opening = !prev;
        if (opening && previousChats.length === 0 && !isLoadingPrevChats) {
             fetchPreviousChats();
        }
         if (opening) setIsFaqSidebarOpen(false);
        return opening;
    });
    }, [previousChats.length, isLoadingPrevChats]);

  // --- Core Action Callbacks ---
  const handleNewChat = useCallback(() => {
    console.log("Starting New Chat");
    setChatMessages([]);
    setPromptText('');
    setError('');
    setIsLoadingReply(false);
    setCurrentChatId(null);
    setIsNewChatView(true);
    setIsFaqSidebarOpen(false);
    setIsPrevChatsOpen(false);
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  const fetchPreviousChats = useCallback(async () => {
    console.log("Fetching previous chats list...");
    setIsLoadingPrevChats(true);
    setError('');
    try {
      const response = await axiosInstance.get('/api/chats');
      const sortedChats = Array.isArray(response.data)
         ? response.data.sort((a, b) => new Date(b.lastUpdate) - new Date(a.lastUpdate))
         : [];
      setPreviousChats(sortedChats);
    } catch (err) {
      console.error("Failed to fetch previous chats list:", err);
      setError("Could not load chat history list.");
      setPreviousChats([]);
    } finally {
      setIsLoadingPrevChats(false);
    }
  }, []);

  const loadChatHistory = useCallback(async (chatId) => {
    if (!chatId || isLoadingReply) return;
    console.log("Loading chat history for ID:", chatId);
    setIsLoadingReply(true);
    setError('');
    setIsPrevChatsOpen(false);
    setIsNewChatView(false);
    try {
      const response = await axiosInstance.get(`/api/chats/${chatId}`);
      if (!response.data || !Array.isArray(response.data.messages)) {
        throw new Error("Invalid chat history structure from API.");
      }
      setChatMessages(response.data.messages);
      setCurrentChatId(chatId);
      const { title, lastUpdate } = response.data;
      if (title || lastUpdate) {
          setPreviousChats(prev => prev.map(chat =>
              chat.id === chatId ? { ...chat, title: title || chat.title, lastUpdate: lastUpdate || chat.lastUpdate } : chat
          ));
      }
    } catch (err) {
      console.error(`Failed to load chat ${chatId}:`, err);
      let errorMsg = `Could not load chat history.`;
      if (axios.isAxiosError(err) && err.response?.status === 404) {
          errorMsg = "Chat not found.";
      } else if (axios.isAxiosError(err) && err.response?.status === 403) {
          errorMsg = "You don't have permission to view this chat.";
      } else {
           errorMsg = err.message || errorMsg;
      }
      setError(errorMsg);
      setChatMessages([]);
      setCurrentChatId(null);
      setIsNewChatView(true);
    } finally {
      setIsLoadingReply(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isLoadingReply]);

  const handleSelectChat = useCallback((chatId) => {
    if (chatId === currentChatId) {
      setIsPrevChatsOpen(false);
      return;
    }
    loadChatHistory(chatId);
  }, [currentChatId, loadChatHistory]);

  const handleDeleteChat = useCallback((chatId) => {
    if (!chatId || deletingChatId || confirmationState.isOpen) {
        return;
    }
    setConfirmationState({
        isOpen: true,
        message: `Are you sure you want to delete this chat? This action cannot be undone.`,
        chatIdToDelete: chatId,
    });
}, [deletingChatId, confirmationState.isOpen]);

  const handleSendPrompt = useCallback(async (messageToSend) => {
    const trimmedMessage = messageToSend?.trim();
    if (!trimmedMessage || isLoadingReply) return;
    setError('');
    const currentHistory = chatMessages;
    const wasNewChat = isNewChatView;
    setIsNewChatView(false);
    setIsLoadingReply(true);
    setIsFaqSidebarOpen(false);
    setIsPrevChatsOpen(false);
    const newUserMessage = { role: 'user', content: trimmedMessage };
    setChatMessages(prev => [...prev, newUserMessage]);
    setPromptText('');
    try {
      const payload = {
        prompt: trimmedMessage,
        history: currentHistory.map(msg => ({ role: msg.role, content: msg.content })),
        chatId: currentChatId
      };
      const response = await axiosInstance.post('/api/chatbot', payload);
      if (!response.data || typeof response.data.answer !== 'string') {
        throw new Error("Invalid response from server (missing answer).");
      }
      const newBotMessage = { role: 'bot', content: response.data.answer };
      setChatMessages(prev => [...prev, newBotMessage]);
      if (wasNewChat && response.data.newChatId) {
        const newId = response.data.newChatId;
        const newTitle = response.data.title || generateTitleFromPrompt(trimmedMessage);
        setCurrentChatId(newId);
        const newChatItem = { id: newId, title: newTitle, lastUpdate: new Date().toISOString() };
        setPreviousChats(prev => [newChatItem, ...prev]);
      } else if (currentChatId && response.data.updatedChat) {
        const updatedInfo = response.data.updatedChat;
        setPreviousChats(prev => prev.map(chat => chat.id === currentChatId ? { ...chat, ...updatedInfo } : chat).sort((a, b) => new Date(b.lastUpdate) - new Date(a.lastUpdate)));
      }
    } catch (err) {
      console.error("Failed to get bot response:", err);
      let errorMsg = "Sorry, failed to get a response.";
      if (axios.isAxiosError(err)) {
        if (err.response) {
          errorMsg = err.response.data?.error || err.response.data?.message || `Error ${err.response.status}`;
          if (err.response.status === 401 || err.response.status === 403) {
            errorMsg = "Authentication may have expired. Please log in again.";
          } else if (err.response.status === 408 || err.code === 'ECONNABORTED') {
             errorMsg = "The request timed out. Please try again.";
          }
        } else if (err.request) {
          errorMsg = "Network error: Could not reach the server.";
        } else { errorMsg = `Request setup error: ${err.message}`; }
      } else { errorMsg = `An unexpected error occurred: ${err.message}`; }
      const errorMessage = { role: 'error', content: errorMsg };
      setChatMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoadingReply(false);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isLoadingReply, isNewChatView, currentChatId, chatMessages]);

  const handleFaqClick = (faqText) => {
    setIsFaqSidebarOpen(false);
    handleSendPrompt(faqText);
  };

  const confirmDeletion = useCallback(async () => {
    const chatId = confirmationState.chatIdToDelete;
    if (!chatId) return;
    setConfirmationState({ isOpen: false, message: '', chatIdToDelete: null });
    setDeletingChatId(chatId);
    setError('');
    try {
        await axiosInstance.delete(`/api/chats/${chatId}`);
        setPreviousChats(prev => prev.filter(chat => chat.id !== chatId));
        if (chatId === currentChatId) {
            handleNewChat();
        }
    } catch (err) {
        console.error(`Failed to delete chat ${chatId}:`, err);
        let errorMsg = "Could not delete chat.";
        if (axios.isAxiosError(err) && err.response?.status === 404) {
            errorMsg = "Chat not found or already deleted.";
        } else if (axios.isAxiosError(err) && err.response?.status === 403) {
            errorMsg = "You don't have permission to delete this chat.";
        } else { errorMsg = err.message || errorMsg; }
        setError(errorMsg);
    } finally {
        setDeletingChatId(null);
    }
}, [confirmationState.chatIdToDelete, currentChatId, handleNewChat]);

 const cancelDeletion = useCallback(() => {
  setConfirmationState({ isOpen: false, message: '', chatIdToDelete: null });
}, []);


  // --- Effects ---

  // ★ MODIFICATION: This entire useEffect block is replaced with robust, one-time auth check.
  useEffect(() => {
    // Prevent the fetch from running if it has already been attempted.
    if (fetchAttempted.current) {
        return;
    }
    // Mark that we are attempting the fetch.
    fetchAttempted.current = true;

    const fetchUserData = async () => {
      try {
        console.log("Fetching user data (one-time attempt)...");
        const response = await axiosInstance.get('/api/user');
        
        if (!response.data || typeof response.data.name !== 'string') {
          throw new Error("User data format incorrect from API.");
        }
        
        const fetchedName = response.data.name.trim();
        setUsername(fetchedName || 'User');
        setIsLoadingUser(false); // Success, so stop loading.

      } catch (err) {
        console.error("Effect: Failed to fetch user:", err.message);
        
        // This is the critical part for handling auth failure.
        if (axios.isAxiosError(err) && err.response?.status === 401) {
            console.error("Authentication failed (401). Cleaning up and redirecting to login.");
            // 1. Clean up invalid token and user info to break the redirect loop.
            localStorage.removeItem('token');
            localStorage.removeItem('userInfo'); // Or any other user data key
            
            // 2. Redirect to the login page.
            navigate('/login');
        } else {
            // For other errors (network, server 500, etc.), just show an error.
            setError("Could not load user data. Please refresh the page.");
            setIsLoadingUser(false); // Stop loading even on failure.
        }
      }
    };

    fetchUserData();
  }, [navigate]); // navigate is a stable dependency.

  // Scroll to bottom when new messages are added
  useEffect(() => {
    if (!isNewChatView && chatMessages.length > 0) {
      scrollToBottom();
    }
  }, [chatMessages, isNewChatView, scrollToBottom]);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (event) => {
      const targetTagName = event.target.tagName.toLowerCase();
      if (targetTagName === 'input' || targetTagName === 'textarea') {
          if (!((event.ctrlKey || event.metaKey) && (event.key === 'i' || event.key === 'h'))) {
              return;
          }
      }
      if ((event.ctrlKey || event.metaKey) && event.key === 'i') {
        event.preventDefault();
        handleNewChat();
      }
      else if ((event.ctrlKey || event.metaKey) && event.key === 'h') {
        event.preventDefault();
        togglePrevChatsSidebar();
      }
       else if (event.key === '?' && targetTagName !== 'input' && targetTagName !== 'textarea') {
            event.preventDefault();
           toggleFaqSidebar();
       }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleNewChat, togglePrevChatsSidebar, toggleFaqSidebar]);

  const handleMouseEnterButton = useCallback((type, event) => {
    clearTimeout(leaveTimeoutRef.current);
    const rect = event.currentTarget.getBoundingClientRect();
    let dataToShow = [];
    let pos = { top: 0, left: 0 };
    if (type === 'faq') {
        dataToShow = faqs.slice(0, 5);
        pos = { top: rect.bottom + 8, left: rect.left };
    } else if (type === 'history') {
        if (previousChats.length === 0 && !isLoadingPrevChats) {
             fetchPreviousChats();
        }
        dataToShow = previousChats.slice(0, 5);
         pos = { top: rect.top - 190, left: rect.left };
    }
    setPreviewData(dataToShow);
    setPreviewPosition(pos);
    setActivePreview(type);
}, [faqs, previousChats, isLoadingPrevChats, fetchPreviousChats]);

const handleMouseLeaveWithDelay = useCallback(() => {
    leaveTimeoutRef.current = setTimeout(() => { setActivePreview(null); }, 200);
}, []);

const handleMouseEnterPreview = useCallback(() => {
    clearTimeout(leaveTimeoutRef.current);
}, []);

  // --- Helper ---
   const generateTitleFromPrompt = (prompt) => {
       const trimmed = prompt.trim();
       if (!trimmed) return "New Chat";
       return trimmed.substring(0, 40) + (trimmed.length > 40 ? '...' : '');
   };

  // --- Render Logic ---
  const isLogoVisible = isNewChatView || (!isNewChatView && !isInputFocused);

  // --- JSX ---
  return (
    <div className={styles.homeContainer}>
      <div className={styles.topBar}>
        {!isLoadingUser && !isFaqSidebarOpen && (
            <button
                className={styles.faqSidebarToggle}
                onClick={toggleFaqSidebar}
                title="Show FAQs (?)"
                aria-label="Show FAQs"
                onMouseEnter={(e) => handleMouseEnterButton('faq', e)}
                onMouseLeave={handleMouseLeaveWithDelay}
            > ❔ </button>
        )}
        {!isLoadingUser && isLogoVisible && (
          <div className={styles.logoTopRight}>
            <img src={logo} alt="Logo" className={styles.logoImage} />
          </div>
        )}
      </div>

      <div
          ref={mainAreaRef}
          className={`
              ${styles.mainArea}
              ${isFaqSidebarOpen ? styles.faqSidebarActive : ''}
              ${isPrevChatsOpen ? styles.prevChatsSidebarActive : ''}
          `}
      >
        {isLoadingUser ? (
            <div className={styles.loadingView}>
                <p>Verifying user...</p>
            </div>
        ) : error && isNewChatView ? (
            <div className={styles.errorView}>
                <p style={{ color: '#ff8a8a' }}>Error: {error}</p>
            </div>
        ) : isNewChatView ? (
            <div className={styles.initialViewContent}>
                <h1 className={styles.greetingHeader}>Hello, {username}!</h1>
                <p className={styles.greetingSubtext}>How can Aurora Intel assist you today?</p>
                <p className={styles.shortcutHint}>(Ctrl+I: New Chat | Ctrl+H: History | ?: FAQs)</p>
            </div>
        ) : (
            <div className={styles.chatHistory}>
                {chatMessages.map((msg, index) => (
                    <div
                        key={`${msg.role}-${index}-${msg.content?.slice(0, 10)}`}
                        className={`${styles.messageCardWrapper} ${styles[msg.role + 'Wrapper'] || styles.defaultMessageWrapper}`}
                    >
                        <div className={`${styles.messageCard} ${styles[msg.role] || styles.defaultMessage}`}>
                           {msg.role === 'error'
                                ? <span className={styles.errorMessageContent}>{msg.content}</span>
                                : msg.content
                           }
                        </div>
                    </div>
                ))}
                {isLoadingReply && (
                    <div className={`${styles.messageCardWrapper} ${styles.botWrapper}`}>
                        <div className={`${styles.messageCard} ${styles.bot} ${styles.thinking}`}>
                            <div className={styles.typingIndicator}><span></span><span></span><span></span></div>
                        </div>
                    </div>
                )}
                <div ref={chatEndRef} className={styles.scrollAnchor} />
            </div>
        )}
      </div>

      {!isLoadingUser && (
        <div className={styles.inputAreaContainer}>
          <Input
            ref={inputRef}
            value={promptText}
            onInputChange={handleInputChange}
            onSubmit={() => handleSendPrompt(promptText)}
            placeholder={isLoadingReply ? "Aurora is thinking..." : (currentChatId ? "Continue conversation..." : "Ask Aurora Intel anything...")}
            loading={isLoadingReply}
            onFocus={handleFocus}
            onBlur={handleBlur}
          />
           <ConfirmationDialog
                isOpen={confirmationState.isOpen}
                message={confirmationState.message}
                onConfirm={confirmDeletion}
                onCancel={cancelDeletion}
                confirmText="Delete Chat"
                cancelText="Cancel"
            />
          <button
            className={styles.inputHistoryButton}
            onClick={togglePrevChatsSidebar}
            title="View Chat History (Ctrl+H)"
            aria-label="View Chat History"
            disabled={isLoadingReply || isLoadingPrevChats || deletingChatId !== null}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16">
              <path d="M8.515 1.019A7 7 0 0 0 8 1V0a8 8 0 0 1 .589.022l-.074.997zm2.004.45a7.003 7.003 0 0 0-.985-.299l.219-.976c.383.086.76.2 1.126.342l-.36.933zm1.37.71a7.01 7.01 0 0 0-.439-.27l.493-.87a8.025 8.025 0 0 1 .979.654l-.62.777zm.11.97a6.969 6.969 0 0 0-.219-.281l.767-.647a8.008 8.008 0 0 1 .741.905l-.85.524zm-.099.94a6.952 6.952 0 0 0-.033-.321l.997-.074c.018.118.03.237.039.358l-.999.038zm-.08.94l.99-.155c.022.14.038.28.047.423l-1.002.036a7.02 7.02 0 0 0-.035-.304zm-.094.94a7.043 7.043 0 0 0 .011-.39l1.004.004c-.004.13-.01.26-.02.389l-1-.003zm-.155.934c.03-.17.05-.34.059-.51l1 .017c-.007.17-.02.34-.038.504l-.995-.012zm.017.932l.984-.219a6.956 6.956 0 0 1-.089.66l-.987.243c.034-.217.06-.437.078-.658.004-.06.007-.121.007-.182zM8 8.5a.5.5 0 0 1 .5.5v1.5H10a.5.5 0 0 1 0 1H8.5V13a.5.5 0 0 1-1 0v-1.5H6a.5.5 0 0 1 0-1h1.5V9a.5.5 0 0 1 .5-.5z"/>
              <path d="M8 1a7 7 0 1 0 4.95 11.95l.707.707A8.001 8.001 0 1 1 8 0v1z"/>
            </svg>
          </button>
        </div>
      )}

      <div className={`${styles.faqSidebar} ${isFaqSidebarOpen ? styles.open : ''}`}>
         <div className={styles.faqSidebarHeader}>
             <h2>FAQs</h2>
             <button onClick={toggleFaqSidebar} className={styles.closeFaqSidebarButton} title="Close FAQs" aria-label="Close FAQs">
                 <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16"> <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/> </svg>
             </button>
         </div>
         <div className={styles.faqSidebarContent}>
             {faqs.length > 0 ? (
                 <ul className={styles.faqList}>
                     {faqs.map((faq, index) => (
                         <li key={index} className={styles.faqItem} onClick={() => handleFaqClick(faq)} tabIndex={0} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && handleFaqClick(faq)}>
                             {faq}
                         </li>
                     ))}
                 </ul>
             ) : ( <p className={styles.noFaqsText}>No FAQs available at the moment.</p> )}
         </div>
      </div>

      {!isLoadingUser && (
        <PreviousChats
          isOpen={isPrevChatsOpen}
          chats={previousChats}
          isLoading={isLoadingPrevChats}
          currentChatId={currentChatId}
          onSelectChat={handleSelectChat}
          onDeleteChat={handleDeleteChat}
          onNewChat={handleNewChat}
          onClose={togglePrevChatsSidebar}
          isDeletingId={deletingChatId}
        />
      )}
       <PreviewCard
         type={activePreview}
         data={previewData}
         isVisible={activePreview !== null}
         position={previewPosition}
         onMouseEnter={handleMouseEnterPreview}
         onMouseLeave={handleMouseLeaveWithDelay}
       />
    </div>
  );
};

export default Home;