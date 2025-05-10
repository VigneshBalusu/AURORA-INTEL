// src/components/Home.jsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';

// --- Component Imports ---
// Ensure these paths are correct for your project structure
import Input from './Input';
import PreviousChats from './PreviousChats';
import PreviewCard from './PreviewCard'; // ★ Import PreviewCard
import ConfirmationDialog from './ConfirmationDialog'; // ★ Import ConfirmationDialog


// --- Asset Imports ---
// Ensure these paths are correct for your project structure
import logo from '../assets/images/logo.jpeg';
import styles from '../assets/styles/Home.module.css'; // Main styles for Home
// Note: PreviousChats should import its own PreviousChats.module.css

// --- Constants ---
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000"; // Your backend URL

// --- Axios Instance ---
// Create an axios instance once when the module loads
const axiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 25000, // Increased timeout slightly (25 seconds)
});

// Axios Request Interceptor (Adds Auth Token)
axiosInstance.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token'); // Or however you store your token
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    } else {
      console.warn("No token found for API request to:", config.url);
      // Optional: Cancel request or trigger logout/redirect if token is mandatory
      // return Promise.reject(new axios.Cancel('No token available'));
    }
    return config;
  },
  (error) => {
    console.error("Axios request interceptor error:", error);
    return Promise.reject(error);
  }
);

// --- Hardcoded FAQs (Replace/Fetch as needed) ---
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
  const [isLoadingUser, setIsLoadingUser] = useState(true); // Loading initial user data
  const [error, setError] = useState(''); // Persistent errors shown (e.g., user load failed)
  const [promptText, setPromptText] = useState(''); // Value of the text input field
  const [isInputFocused, setIsInputFocused] = useState(false); // For UI adjustments (e.g., logo visibility)
  const [isNewChatView, setIsNewChatView] = useState(true); // Controls initial view vs active chat view
  const [chatMessages, setChatMessages] = useState([]); // Current chat message history: { role: 'user'|'bot'|'error', content: string }[]
  const [isLoadingReply, setIsLoadingReply] = useState(false); // Shows bot "thinking" indicator
  const [isFaqSidebarOpen, setIsFaqSidebarOpen] = useState(false); // FAQ Sidebar visibility
  const [faqs, setFaqs] = useState(hardcodedFaqs); // FAQs data
  const [confirmationState, setConfirmationState] = useState({
    isOpen: false,
    message: '',
    chatIdToDelete: null, // Store the ID here when confirming
});
 // ★★★ State for Hover Previews ★★★
 const [activePreview, setActivePreview] = useState(null); // 'history' | 'faq' | null
 const [previewPosition, setPreviewPosition] = useState({ top: 0, left: 0 });
 const [previewData, setPreviewData] = useState([]);
 const leaveTimeoutRef = useRef(null); // Ref to store the timeout ID
  // --- State for Previous Chats ---
  const [currentChatId, setCurrentChatId] = useState(null); // ID of the active chat session, null for new chat
  const [isPrevChatsOpen, setIsPrevChatsOpen] = useState(false); // Previous Chats sidebar visibility
  const [previousChats, setPreviousChats] = useState([]); // List of available chats: { id, title, lastUpdate }[]
  const [isLoadingPrevChats, setIsLoadingPrevChats] = useState(false); // Loading indicator for Previous Chats list
  const [deletingChatId, setDeletingChatId] = useState(null); // ID of chat currently being deleted (for UI feedback)

  // --- Refs ---
  const inputRef = useRef(null); // Ref for the Input component's textarea/input element
  const mainAreaRef = useRef(null); // Ref for the scrollable main chat area container
  const chatEndRef = useRef(null); // Ref to an empty div at the end of chat for auto-scrolling

  // --- Utility Callbacks ---

  // Scroll to the bottom of the chat area smoothly
  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, 50); // Short delay ensures content is rendered before scrolling
  }, []);

  // --- Event Handlers ---

  // Update input field state when Input component changes
  const handleInputChange = (newValue) => {
    setPromptText(newValue);
  };
  

  // Handle focus/blur events from the Input component
  const handleFocus = () => setIsInputFocused(true);
  const handleBlur = () => setIsInputFocused(false);

  // Toggle FAQ Sidebar visibility
  const toggleFaqSidebar = () => {
    setIsFaqSidebarOpen(prev => {
      const opening = !prev;
      if (opening) setIsPrevChatsOpen(false); // Close other sidebar if opening this one
      return opening;
    });
  };

      // ★★★ Toggle Previous Chats Sidebar ★★★
      const togglePrevChatsSidebar = useCallback(() => {
        setIsPrevChatsOpen(prev => {
            const opening = !prev;
            // Fetch chats only when opening the sidebar for the first time or if list is empty
            if (opening && previousChats.length === 0 && !isLoadingPrevChats) {
                 fetchPreviousChats(); // This call is fine
            }
            // Optional: Re-fetch every time it opens to get latest
            // else if (opening) {
            //   fetchPreviousChats();
            // }
             if (opening) setIsFaqSidebarOpen(false); // Close other sidebar
            return opening;
        });
    // Dependencies ensure fetchPreviousChats is available and state checks are up-to-date
    // }, [previousChats.length, fetchPreviousChats, isLoadingPrevChats]); // <--- OLD DEPENDENCY ARRAY
    // CHANGE THE DEPENDENCY ARRAY ON THE LINE ABOVE TO THE LINE BELOW:
    }, [previousChats.length, isLoadingPrevChats]); // ★★★ CORRECTED DEPENDENCY ARRAY ★★★

  // --- Core Action Callbacks ---

  // Start a completely new chat session
  const handleNewChat = useCallback(() => {
    console.log("Starting New Chat");
    setChatMessages([]); // Clear message history
    setPromptText('');    // Clear input field
    setError('');         // Clear persistent errors
    setIsLoadingReply(false); // Reset loading state
    setCurrentChatId(null);   // ★ Crucial: Reset current chat ID
    setIsNewChatView(true);   // Switch back to the initial greeting view
    setIsFaqSidebarOpen(false); // Ensure sidebars are closed
    setIsPrevChatsOpen(false);
    // Focus input after UI updates, slight delay can help
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []); // No external dependencies needed for a reset function

  // Fetch the list of previous chat sessions for the sidebar
  const fetchPreviousChats = useCallback(async () => {
    console.log("Fetching previous chats list...");
    setIsLoadingPrevChats(true);
    setError(''); // Clear previous errors
    try {
      const response = await axiosInstance.get('/api/chats'); // Endpoint for chat list
      // Ensure data is an array, sort by lastUpdate descending (most recent first)
      const sortedChats = Array.isArray(response.data)
         ? response.data.sort((a, b) => new Date(b.lastUpdate) - new Date(a.lastUpdate))
         : [];
      console.log("Fetched chats list:", sortedChats);
      setPreviousChats(sortedChats);
    } catch (err) {
      console.error("Failed to fetch previous chats list:", err);
      setError("Could not load chat history list."); // Set persistent error
      setPreviousChats([]); // Set to empty array on error
    } finally {
      setIsLoadingPrevChats(false);
    }
  }, []); // Depends only on axiosInstance (stable)

  // Load the full message history for a selected chat
  const loadChatHistory = useCallback(async (chatId) => {
    if (!chatId || isLoadingReply) return; // Prevent loading if busy or no ID
    console.log("Loading chat history for ID:", chatId);

    setIsLoadingReply(true); // Use main loading indicator while fetching history
    setError('');
    setIsPrevChatsOpen(false); // Close sidebar after selection
    setIsNewChatView(false); // Ensure we are in active chat view

    try {
      // Endpoint to get a specific chat's details including messages
      const response = await axiosInstance.get(`/api/chats/${chatId}`);

      if (!response.data || !Array.isArray(response.data.messages)) {
        console.error("Invalid chat history structure received:", response.data);
        throw new Error("Invalid chat history structure from API.");
      }

      console.log("Loaded messages:", response.data.messages);
      setChatMessages(response.data.messages); // Replace current messages with loaded history
      setCurrentChatId(chatId);               // Set the active chat ID

      // Optional: If the API response includes title/metadata, update the sidebar list item
      // This ensures the title in the sidebar matches if it was updated server-side
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
      // Revert to a stable state on failure
      setChatMessages([]);
      setCurrentChatId(null);
      setIsNewChatView(true); // Go back to new chat view on error
    } finally {
      setIsLoadingReply(false); // Turn off loading indicator
      setTimeout(() => inputRef.current?.focus(), 100); // Re-focus input
    }
  // Dependencies: Need isLoadingReply to prevent concurrent loads
  }, [isLoadingReply]);

  // Handle selecting a chat from the PreviousChats sidebar
  const handleSelectChat = useCallback((chatId) => {
    if (chatId === currentChatId) {
      // If clicking the already active chat, just close the sidebar
      setIsPrevChatsOpen(false);
      return;
    }
    // Otherwise, load the selected chat's history
    loadChatHistory(chatId);
  // Dependencies: currentChatId to check if it's already active, loadChatHistory function
  }, [currentChatId, loadChatHistory]);

  // Handle deleting a chat from the PreviousChats sidebar
  const handleDeleteChat = useCallback((chatId) => {
    // Prevent initiating delete if:
    // - No chatId is provided
    // - A deletion is already in progress (deletingChatId is set)
    // - The confirmation dialog is already open
    if (!chatId || deletingChatId || confirmationState.isOpen) {
        // Optional: Log why it's returning early
        // console.log("handleDeleteChat called but returning early:", { chatId, deletingChatId, confirmationStateIsOpen: confirmationState.isOpen });
        return;
    }

    console.log(`Requesting confirmation to delete chat ID: ${chatId}`);

    // Set state to SHOW the confirmation dialog
    // This assumes you have a state variable like 'confirmationState'
    // and a state setter 'setConfirmationState' defined elsewhere in your component.
    setConfirmationState({
        isOpen: true,                                       // Make the dialog visible
        message: `Are you sure you want to delete this chat? This action cannot be undone.`, // Message for the dialog
        chatIdToDelete: chatId,                             // Store the ID for the confirmation function to use
    });

    // IMPORTANT: The original logic (API call, setPreviousChats, handleNewChat, setError, setDeletingChatId)
    // has been REMOVED from this function. It must be moved to the function
    // that gets called when the user clicks "Confirm" on your custom dialog component.

// Dependencies: This callback now only depends on the states needed to prevent
// multiple triggers, not on the functions/states involved in the actual deletion.
}, [deletingChatId, confirmationState.isOpen]); // Dependency check: is a deletion already happening or is dialog open?
  // Send the user's prompt (or clicked FAQ) to the backend chatbot endpoint
  const handleSendPrompt = useCallback(async (messageToSend) => {
    const trimmedMessage = messageToSend?.trim();
    if (!trimmedMessage || isLoadingReply) return; // Ignore empty/whitespace prompts or if already loading

    console.log("Submitting prompt:", trimmedMessage, "for chat ID:", currentChatId);
    setError(''); // Clear previous transient errors
    const currentHistory = chatMessages; // Capture history *before* adding new user message
    const wasNewChat = isNewChatView; // Check if we are starting a new chat
    setIsNewChatView(false); // Switch to active chat view immediately
    setIsLoadingReply(true); // Show "thinking" indicator
    setIsFaqSidebarOpen(false); // Ensure sidebars are closed
    setIsPrevChatsOpen(false);

    const newUserMessage = { role: 'user', content: trimmedMessage };
    // Use functional update for state based on previous state
    setChatMessages(prev => [...prev, newUserMessage]);
    setPromptText(''); // Clear the input field

    try {
      // Construct payload for the backend
      const payload = {
        prompt: trimmedMessage,
        // Send history for context (optional, depends on backend needs)
        history: currentHistory.map(msg => ({ role: msg.role, content: msg.content })), // Send simplified history
        chatId: currentChatId // Send current chat ID (null if new chat)
      };
      console.log("Sending payload to /api/chatbot:", payload);

      // Make the API call to the chatbot endpoint
      const response = await axiosInstance.post('/api/chatbot', payload);

      // Validate response structure
      if (!response.data || typeof response.data.answer !== 'string') {
        console.error("Invalid response structure from /api/chatbot:", response.data);
        throw new Error("Invalid response from server (missing answer).");
      }

      // Create the bot message object from the response
      const newBotMessage = { role: 'bot', content: response.data.answer };
      setChatMessages(prev => [...prev, newBotMessage]); // Add bot response to chat

      // --- Handle backend response for chat state ---
      if (wasNewChat && response.data.newChatId) {
        // If it was a new chat and backend confirmed creation
        const newId = response.data.newChatId;
        const newTitle = response.data.title || generateTitleFromPrompt(trimmedMessage); // Use title from backend or generate
        console.log(`New chat created with ID: ${newId}, Title: "${newTitle}"`);
        setCurrentChatId(newId); // Set the ID for subsequent messages

        // Add the new chat to the top of the sidebar list
        const newChatItem = {
          id: newId,
          title: newTitle,
          lastUpdate: new Date().toISOString() // Use current time for sorting
        };
        // Prepend and potentially re-sort (though prepending keeps it at top initially)
        setPreviousChats(prev => [newChatItem, ...prev]);

      } else if (currentChatId && response.data.updatedChat) {
        // If an existing chat was updated, update its metadata in the sidebar
        const updatedInfo = response.data.updatedChat; // Expects { id, lastUpdate, [title] }
         console.log("Updating chat metadata in sidebar for ID:", currentChatId, updatedInfo);
        setPreviousChats(prev => prev
          .map(chat =>
            chat.id === currentChatId
              ? { ...chat, ...updatedInfo } // Merge updates (use lastUpdate from server)
              : chat
          )
          // Re-sort the list to reflect the new lastActivity time
          .sort((a, b) => new Date(b.lastUpdate) - new Date(a.lastUpdate))
        );
      }

    } catch (err) {
      console.error("Failed to get bot response:", err);
      let errorMsg = "Sorry, failed to get a response.";
      // Provide more specific feedback based on Axios error types
      if (axios.isAxiosError(err)) {
        if (err.response) {
          // Server responded with a status code outside 2xx range
          errorMsg = err.response.data?.error || err.response.data?.message || `Error ${err.response.status}`;
          if (err.response.status === 401 || err.response.status === 403) {
            errorMsg = "Authentication may have expired. Please log in again.";
          } else if (err.response.status === 408 || err.code === 'ECONNABORTED') {
             errorMsg = "The request timed out. Please try again.";
          }
        } else if (err.request) {
          // Request was made but no response received (network error)
          errorMsg = "Network error: Could not reach the server.";
        } else {
          // Error setting up the request
          errorMsg = `Request setup error: ${err.message}`;
        }
      } else {
        // Non-Axios error (e.g., client-side logic error)
        errorMsg = `An unexpected error occurred: ${err.message}`;
      }

      // Add an error message directly into the chat history
      const errorMessage = { role: 'error', content: errorMsg };
      setChatMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoadingReply(false); // Stop the "thinking" indicator
      // Re-focus the input field after processing is complete
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  // Dependencies needed for the callback's logic
  }, [isLoadingReply, isNewChatView, currentChatId, chatMessages]); // Added handleNewChat dependency

  // Handle clicking an FAQ item - sends it as a prompt
  const handleFaqClick = (faqText) => {
    console.log("FAQ Clicked:", faqText);
    setIsFaqSidebarOpen(false); // Close sidebar
    handleSendPrompt(faqText); // Treat FAQ text as a user prompt
  };
  const confirmDeletion = useCallback(async () => {
    const chatId = confirmationState.chatIdToDelete; // Get ID from state
    if (!chatId) return; // Safety check

    console.warn(`Confirmed deletion for chat ID: ${chatId}`);
    setConfirmationState({ isOpen: false, message: '', chatIdToDelete: null }); // Close dialog
    setDeletingChatId(chatId); // ★ Set deleting indicator AFTER confirmation
    setError('');

    try {
        await axiosInstance.delete(`/api/chats/${chatId}`);
        console.log(`Chat ${chatId} deleted successfully.`);

        setPreviousChats(prev => prev.filter(chat => chat.id !== chatId));

        if (chatId === currentChatId) {
            handleNewChat(); // Reset to new chat view if current chat was deleted
        }

    } catch (err) {
        console.error(`Failed to delete chat ${chatId}:`, err);
        let errorMsg = "Could not delete chat.";
        if (axios.isAxiosError(err) && err.response?.status === 404) {
            errorMsg = "Chat not found or already deleted.";
        } else if (axios.isAxiosError(err) && err.response?.status === 403) {
            errorMsg = "You don't have permission to delete this chat.";
        } else {
             errorMsg = err.message || errorMsg;
        }
        setError(errorMsg);
    } finally {
        setDeletingChatId(null); // Remove deleting feedback state
    }
// Dependencies: Need access to confirmation state, current chat ID, and new chat handler
}, [confirmationState.chatIdToDelete, currentChatId, handleNewChat]);

 // ★★★ Function to cancel deletion ★★★
 const cancelDeletion = useCallback(() => {
  console.log("Deletion cancelled.");
  setConfirmationState({ isOpen: false, message: '', chatIdToDelete: null });
}, []); // No dependencies


  // --- Effects ---

  // Fetch User Data on Initial Mount
  useEffect(() => {
    setIsLoadingUser(true);
    setError('');
    const fetchUserData = async () => {
      try {
        console.log("Fetching user data...");
        const response = await axiosInstance.get('/api/user'); // Endpoint to get user info

        if (!response.data || typeof response.data.name !== 'string') {
          console.warn("User data format incorrect from API:", response.data);
          throw new Error("User data format incorrect from API.");
        }
        const fetchedName = response.data.name.trim();
        console.log("Effect: Fetched user name:", fetchedName);
        setUsername(fetchedName || 'User'); // Use fetched name or fallback

      } catch (err) {
        console.error("Effect: Failed to fetch user:", err);
        let errorMsg = "Could not load user data.";
        if (axios.isAxiosError(err) && (err.response?.status === 401 || err.response?.status === 403)) {
          errorMsg = "Session expired or invalid. Please log in.";
          // Optional: Redirect to login page here
        } else if (axios.isAxiosError(err) && !err.response) {
          errorMsg = "Network Error: Cannot connect to fetch user data.";
        } else {
          errorMsg = err.message || errorMsg;
        }
        setError(errorMsg); // Set persistent error message
        setUsername('User'); // Fallback username on error
      } finally {
        console.log("Effect: Setting isLoadingUser to false.");
        setIsLoadingUser(false);
        // Ensure input is focused if starting fresh
        setTimeout(() => inputRef.current?.focus(), 150);
      }
    };
    fetchUserData();
  // Empty dependency array means this runs only once on mount
  }, []);

  // Scroll to bottom when new messages are added in active chat view
  useEffect(() => {
    if (!isNewChatView && chatMessages.length > 0) {
      scrollToBottom();
    }
  // Runs whenever messages change, view state changes, or scroll function reference changes
  }, [chatMessages, isNewChatView, scrollToBottom]);

  // Keyboard Shortcuts (Ctrl+I for New Chat, Ctrl+H for History)
  useEffect(() => {
    const handleKeyDown = (event) => {
      // Check if focus is inside an input/textarea to avoid conflicts
      const targetTagName = event.target.tagName.toLowerCase();
      if (targetTagName === 'input' || targetTagName === 'textarea') {
          // Allow default behavior within inputs unless it's our specific shortcut combo
          if (!((event.ctrlKey || event.metaKey) && (event.key === 'i' || event.key === 'h'))) {
              return;
          }
      }

      // Ctrl+I or Cmd+I for New Chat
      if ((event.ctrlKey || event.metaKey) && event.key === 'i') {
        event.preventDefault();
        console.log("Shortcut: Ctrl+I detected");
        handleNewChat();
      }
      // Ctrl+H or Cmd+H for History Sidebar
      else if ((event.ctrlKey || event.metaKey) && event.key === 'h') {
        event.preventDefault();
         console.log("Shortcut: Ctrl+H detected");
        togglePrevChatsSidebar();
      }
       // '?' for FAQ sidebar (consider if this conflicts with typing)
       else if (event.key === '?' && targetTagName !== 'input' && targetTagName !== 'textarea') {
            event.preventDefault();
            console.log("Shortcut: ? detected");
           toggleFaqSidebar();
       }
    };

    window.addEventListener('keydown', handleKeyDown);
    // Cleanup function to remove listener when component unmounts
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  // Add dependencies for the handlers used inside the effect
  }, [handleNewChat, togglePrevChatsSidebar, toggleFaqSidebar]); // Added toggleFaqSidebar

  const handleMouseEnterButton = useCallback((type, event) => {
    clearTimeout(leaveTimeoutRef.current); // Clear any pending leave timeout

    const rect = event.currentTarget.getBoundingClientRect();
    let dataToShow = [];
    let pos = { top: 0, left: 0 };

    if (type === 'faq') {
        dataToShow = faqs.slice(0, 5); // Show top 5 FAQs
        pos = {
            top: rect.bottom + 8, // Position below the FAQ button
            left: rect.left,      // Align left edge with FAQ button
        };
    } else if (type === 'history') {
        // Ensure previous chats are loaded for the preview
        if (previousChats.length === 0 && !isLoadingPrevChats) {
             fetchPreviousChats(); // Fetch if needed, but might be slow for hover
        }
        dataToShow = previousChats.slice(0, 5); // Show top 5 recent chats
         pos = {
            top: rect.top - 190, // Position above the history button (adjust 190 based on card height)
            left: rect.left,     // Align left edge
        };
    }

    setPreviewData(dataToShow);
    setPreviewPosition(pos);
    setActivePreview(type); // Show the preview

}, [faqs, previousChats, isLoadingPrevChats, fetchPreviousChats]); // Add dependencies

const handleMouseLeaveWithDelay = useCallback(() => {
    // Set a timeout to hide the preview card
    leaveTimeoutRef.current = setTimeout(() => {
        setActivePreview(null);
    }, 200); // 200ms delay before hiding
}, []);

const handleMouseEnterPreview = useCallback(() => {
    // If mouse enters the preview card itself, cancel the hide timeout
    clearTimeout(leaveTimeoutRef.current);
}, []);
  // --- Helper ---
   // Simple title generation fallback
   const generateTitleFromPrompt = (prompt) => {
       const trimmed = prompt.trim();
       if (!trimmed) return "New Chat";
       return trimmed.substring(0, 40) + (trimmed.length > 40 ? '...' : '');
   };

  // --- Render Logic ---

  // Determine if the logo should be visible
  const isLogoVisible = isNewChatView || (!isNewChatView && !isInputFocused);

  // --- JSX ---
  return (
    <div className={styles.homeContainer}>

      {/* === Top Bar Elements === */}
      <div className={styles.topBar}>
         {/* History Sidebar Toggle Button */}
        

        {/* FAQ Sidebar Toggle Button */}
        {!isLoadingUser && !isFaqSidebarOpen && (
                <button
                    className={styles.faqSidebarToggle}
                    onClick={toggleFaqSidebar}
                    title="Show FAQs (?)"
                    aria-label="Show FAQs"
                    // ★ Add hover handlers ★
                    onMouseEnter={(e) => handleMouseEnterButton('faq', e)}
                    onMouseLeave={handleMouseLeaveWithDelay}
                > ❔
                   {/* FAQ Icon */}
                   {/* ... svg ... */}
                </button>
            )}

        {/* Logo Area */}
        {!isLoadingUser && isLogoVisible && (
          <div className={styles.logoTopRight}>
            <img src={logo} alt="Logo" className={styles.logoImage} />
          </div>
        )}
      </div>


      {/* === Main Content Area (Conditional Rendering) === */}
      {/* Apply CSS classes to adjust layout if sidebars are open */}
      <div
          ref={mainAreaRef}
          className={`
              ${styles.mainArea}
              ${isFaqSidebarOpen ? styles.faqSidebarActive : ''}
              ${isPrevChatsOpen ? styles.prevChatsSidebarActive : ''}
          `}
      >
        {/* --- Conditional Rendering Logic --- */}
        {isLoadingUser ? (
            // --- Loading State ---
            <div className={styles.loadingView}>
                <p>Loading user data...</p>
                {/* Optional: Add a spinner animation here */}
            </div>
        ) : error && isNewChatView ? (
            // --- Error State (Only show persistent errors in initial view) ---
            // Transient chat errors are shown within the chat history itself
            <div className={styles.errorView}>
                <p style={{ color: '#ff8a8a' }}>Error: {error}</p>
                {/* Optional: Add a retry button? */}
            </div>
        ) : isNewChatView ? (
            // --- Initial New Chat View ---
            <div className={styles.initialViewContent}>
                <h1 className={styles.greetingHeader}>Hello, {username}!</h1>
                <p className={styles.greetingSubtext}>How can Aurora Intel assist you today?</p>
                <p className={styles.shortcutHint}>(Ctrl+I: New Chat | Ctrl+H: History | ?: FAQs)</p>
            </div>
        ) : (
            // --- Active Chat History View ---
            <div className={styles.chatHistory}>
                {chatMessages.map((msg, index) => (
                    // Use a more robust key if messages have unique IDs from backend
                    <div
                        key={`${msg.role}-${index}-${msg.content?.slice(0, 10)}`}
                        className={`${styles.messageCardWrapper} ${styles[msg.role + 'Wrapper'] || styles.defaultMessageWrapper}`}
                    >
                        <div className={`${styles.messageCard} ${styles[msg.role] || styles.defaultMessage}`}>
                           {/* Render error messages distinctly (e.g., different style/color) */}
                           {msg.role === 'error'
                                ? <span className={styles.errorMessageContent}>{msg.content}</span>
                                : msg.content // Render normal user/bot content as string
                           }
                        </div>
                    </div>
                ))}
                {/* Bot Thinking Indicator */}
                {isLoadingReply && (
                    <div className={`${styles.messageCardWrapper} ${styles.botWrapper}`}>
                        <div className={`${styles.messageCard} ${styles.bot} ${styles.thinking}`}>
                            <div className={styles.typingIndicator}><span></span><span></span><span></span></div>
                        </div>
                    </div>
                )}
                {/* Scroll Anchor: Empty div at the end to scroll into view */}
                <div ref={chatEndRef} className={styles.scrollAnchor} />
            </div>
        )}
        {/* --- End Conditional Rendering Logic --- */}
      </div>
      {/* === End Main Content Area === */}


      {/* === Input Area === */}
           {/* === Input Area Container === */}
           {!isLoadingUser && (
        <div className={styles.inputAreaContainer}>
          {/* Input Component */}
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
                onConfirm={confirmDeletion} // ★ Pass the confirm handler
                onCancel={cancelDeletion}   // ★ Pass the cancel handler
                confirmText="Delete Chat"   // Customize button text
                cancelText="Cancel"
            />

          {/* ★★★ ADD THIS BUTTON ★★★ */}
          {/* Button to open Previous Chats sidebar */}
          <button
            className={styles.inputHistoryButton} /* New class for styling */
            onClick={togglePrevChatsSidebar}
            title="View Chat History (Ctrl+H)"
            aria-label="View Chat History"
            // Disable button while replies/chats are loading or deleting
            disabled={isLoadingReply || isLoadingPrevChats || deletingChatId !== null}
          >
            {/* History Icon */}
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16">
              <path d="M8.515 1.019A7 7 0 0 0 8 1V0a8 8 0 0 1 .589.022l-.074.997zm2.004.45a7.003 7.003 0 0 0-.985-.299l.219-.976c.383.086.76.2 1.126.342l-.36.933zm1.37.71a7.01 7.01 0 0 0-.439-.27l.493-.87a8.025 8.025 0 0 1 .979.654l-.62.777zm.11.97a6.969 6.969 0 0 0-.219-.281l.767-.647a8.008 8.008 0 0 1 .741.905l-.85.524zm-.099.94a6.952 6.952 0 0 0-.033-.321l.997-.074c.018.118.03.237.039.358l-.999.038zm-.08.94l.99-.155c.022.14.038.28.047.423l-1.002.036a7.02 7.02 0 0 0-.035-.304zm-.094.94a7.043 7.043 0 0 0 .011-.39l1.004.004c-.004.13-.01.26-.02.389l-1-.003zm-.155.934c.03-.17.05-.34.059-.51l1 .017c-.007.17-.02.34-.038.504l-.995-.012zm.017.932l.984-.219a6.956 6.956 0 0 1-.089.66l-.987.243c.034-.217.06-.437.078-.658.004-.06.007-.121.007-.182zM8 8.5a.5.5 0 0 1 .5.5v1.5H10a.5.5 0 0 1 0 1H8.5V13a.5.5 0 0 1-1 0v-1.5H6a.5.5 0 0 1 0-1h1.5V9a.5.5 0 0 1 .5-.5z"/>
              <path d="M8 1a7 7 0 1 0 4.95 11.95l.707.707A8.001 8.001 0 1 1 8 0v1z"/>
            </svg>
          </button>
          {/* ★★★ END OF ADDED BUTTON ★★★ */}

        </div>
      )}
      {/* === End Input Area === */}
      {/* === End Input Area === */}


      {/* === Sidebars (Rendered outside main flow, controlled by state) === */}

      {/* FAQ Sidebar */}
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
                         <li
                             key={index}
                             className={styles.faqItem}
                             onClick={() => handleFaqClick(faq)}
                             tabIndex={0} // Make focusable
                             onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && handleFaqClick(faq)}
                         >
                             {faq}
                         </li>
                     ))}
                 </ul>
             ) : (
                <p className={styles.noFaqsText}>No FAQs available at the moment.</p>
             )}
         </div>
      </div>

      {/* Previous Chats Sidebar */}
      {/* Only render if user is loaded, to avoid potential issues before auth state is known */}
      {!isLoadingUser && (
                <PreviousChats
                  isOpen={isPrevChatsOpen}
                  chats={previousChats}
                  isLoading={isLoadingPrevChats}
                  currentChatId={currentChatId}
                  onSelectChat={handleSelectChat}
                  onDeleteChat={handleDeleteChat} // ★ Ensure this uses the updated handler
                  onNewChat={handleNewChat}
                  onClose={togglePrevChatsSidebar}
                  isDeletingId={deletingChatId} // Keep using this for UI feedback
                />
            )}
      {/* === End Sidebars === */}
                   {/* === ★★★ Render the Preview Card ★★★ === */}
                   <PreviewCard
                 type={activePreview}
                 data={previewData}
                 isVisible={activePreview !== null}
                 position={previewPosition}
                 onMouseEnter={handleMouseEnterPreview} // Keep open when hovering card
                 onMouseLeave={handleMouseLeaveWithDelay} // Close when leaving card
             />
             {/* === End Preview Card Render === */}



    </div> // End Home Container
  );
};

export default Home;