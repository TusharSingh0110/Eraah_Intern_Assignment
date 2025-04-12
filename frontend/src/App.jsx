import { useState, useEffect, useRef } from "react";
import io from "socket.io-client";
import "./App.css";

const BACKEND_URL = "http://localhost:5000";
const socket = io(BACKEND_URL);

function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [currentLanguage, setCurrentLanguage] = useState("en");
  const [availableLanguages] = useState([
    { code: "en", name: "English" },
    { code: "es", name: "Spanish" },
    { code: "fr", name: "French" },
    { code: "de", name: "German" },
    { code: "hi", name: "Hindi" },
    { code: "zh", name: "Chinese" },
  ]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadedDocuments, setUploadedDocuments] = useState([]);
  const [activeDocumentId, setActiveDocumentId] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const messagesEndRef = useRef(null);

  // Handle socket connection
  useEffect(() => {
    socket.on("connect", () => {
      setIsConnected(true);
      console.log("Connected to server");
    });

    socket.on("disconnect", () => {
      setIsConnected(false);
      console.log("Disconnected from server");
    });

    // Process incoming messages
    socket.on("message", (message) => {
      if (message.isPartial) {
        // Update the last message if it's from the bot and not complete
        setMessages((prevMessages) => {
          const lastMessage = prevMessages[prevMessages.length - 1];
          if (lastMessage && !lastMessage.isUser && !lastMessage.isComplete) {
            const updatedMessages = [...prevMessages];
            updatedMessages[updatedMessages.length - 1] = {
              ...lastMessage,
              text: lastMessage.text + message.text,
            };
            return updatedMessages;
          } else {
            // Start a new bot message
            return [...prevMessages, { ...message, text: message.text }];
          }
        });
      } else if (message.isComplete) {
        // Mark the last message as complete
        setMessages((prevMessages) => {
          const updatedMessages = [...prevMessages];
          if (updatedMessages.length > 0) {
            updatedMessages[updatedMessages.length - 1].isComplete = true;
          }
          return updatedMessages;
        });
        setIsLoading(false);
      } else {
        // Regular complete message
        setMessages((prevMessages) => [...prevMessages, message]);
        setIsLoading(false);
      }
    });

    return () => {
      socket.off("connect");
      socket.off("disconnect");
      socket.off("message");
    };
  }, []);

  // Auto-scroll to bottom when messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Handle message submission
  const handleSubmit = (e) => {
    e.preventDefault();
    if (input.trim() === "") return;

    // Add user message to chat
    const userMessage = { text: input, isUser: true };
    setMessages((prevMessages) => [...prevMessages, userMessage]);

    // Start loading state and clear input
    setIsLoading(true);
    setInput("");

    // Send message to server with language and document context
    socket.emit("sendMessage", {
      message: input,
      language: currentLanguage,
      documentId: activeDocumentId,
    });

    // Initialize an empty bot message to be filled by stream
    setMessages((prevMessages) => [
      ...prevMessages,
      { text: "", isUser: false, isComplete: false },
    ]);
  };

  // Handle file upload
  const handleFileUpload = async (e) => {
    e.preventDefault();
    if (!selectedFile) return;

    const formData = new FormData();
    formData.append("pdf", selectedFile);

    try {
      const response = await fetch(`${BACKEND_URL}/upload`, {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (data.success) {
        const newDocument = {
          id: data.documentId,
          name: data.filename,
        };

        setUploadedDocuments((prev) => [...prev, newDocument]);
        setActiveDocumentId(data.documentId);
        setSelectedFile(null);

        // Add system message about document activation
        setMessages((prevMessages) => [
          ...prevMessages,
          {
            text: `Document "${data.filename}" has been uploaded and activated. You can now ask questions about it.`,
            isSystem: true,
          },
        ]);
      }
    } catch (error) {
      console.error("Error uploading file:", error);
    }
  };

  // Render messages with proper styling
  const renderMessage = (message, index) => {
    const messageClass = message.isUser
      ? "user-message"
      : message.isSystem
      ? "system-message"
      : "bot-message";

    return (
      <div key={index} className={`message ${messageClass}`}>
        <div className="message-content">
          {message.text}
          {!message.isComplete && !message.isUser && !message.isSystem && (
            <span className="cursor"></span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="app">
      <header className="header">
        <h1>NGO Assistant</h1>
        <div className="language-selector">
          <label htmlFor="language">Language: </label>
          <select
            id="language"
            value={currentLanguage}
            onChange={(e) => setCurrentLanguage(e.target.value)}
          >
            {availableLanguages.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.name}
              </option>
            ))}
          </select>
        </div>
      </header>

      <div className="main-container">
        <aside className="sidebar">
          <div className="document-upload">
            <h3>Upload Documents</h3>
            <form onSubmit={handleFileUpload}>
              <input
                type="file"
                accept=".pdf"
                onChange={(e) => setSelectedFile(e.target.files[0])}
              />
              <button type="submit" disabled={!selectedFile}>
                Upload PDF
              </button>
            </form>
          </div>

          <div className="documents-list">
            <h3>Your Documents</h3>
            {uploadedDocuments.length > 0 ? (
              <ul>
                {uploadedDocuments.map((doc) => (
                  <li
                    key={doc.id}
                    className={activeDocumentId === doc.id ? "active" : ""}
                    onClick={() => setActiveDocumentId(doc.id)}
                  >
                    {doc.name}
                  </li>
                ))}
              </ul>
            ) : (
              <p>No documents uploaded yet</p>
            )}
          </div>

          {activeDocumentId && (
            <button
              className="clear-document-btn"
              onClick={() => {
                setActiveDocumentId(null);
                setMessages((prevMessages) => [
                  ...prevMessages,
                  {
                    text: "Document context cleared. I will now answer general questions.",
                    isSystem: true,
                  },
                ]);
              }}
            >
              Clear Active Document
            </button>
          )}
        </aside>

        <main className="chat-container">
          <div className="messages">
            <div className="welcome-message">
              <h2>Welcome to the NGO Assistant!</h2>
              <p>
                Ask me anything about NGO operations, funding, regulations, or
                impact assessment.
              </p>
              <p>
                You can also upload PDF documents for context-aware answers.
              </p>
            </div>

            {messages.map(renderMessage)}
            <div ref={messagesEndRef} />
          </div>

          <form className="input-form" onSubmit={handleSubmit}>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type your message here..."
              disabled={isLoading}
            />
            <button type="submit" disabled={isLoading || input.trim() === ""}>
              {isLoading ? "Sending..." : "Send"}
            </button>
          </form>
        </main>
      </div>

      <div className="connection-status">
        {isConnected ? "Connected to server" : "Disconnected from server"}
      </div>
    </div>
  );
}

export default App;
