const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const pdf = require("pdf-parse");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

// Create HTTP server
const server = http.createServer(app);

// Initialize Socket.IO
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// Initialize Google Generative AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// Configure multer for file uploads
const upload = multer({
  storage: multer.diskStorage({
    destination: function (req, file, cb) {
      const uploadsDir = path.join(__dirname, "uploads");
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir);
      }
      cb(null, uploadsDir);
    },
    filename: function (req, file, cb) {
      cb(null, Date.now() + "-" + file.originalname);
    },
  }),
});

// Store uploaded PDF content
const uploadedDocuments = {};

// Handle file uploads
app.post("/upload", upload.single("pdf"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const filePath = req.file.path;
    const dataBuffer = fs.readFileSync(filePath);

    // Extract text from PDF
    const data = await pdf(dataBuffer);
    const pdfText = data.text;

    // Generate unique document ID
    const documentId = Date.now().toString();
    uploadedDocuments[documentId] = pdfText;

    return res.status(200).json({
      success: true,
      documentId: documentId,
      filename: req.file.originalname,
    });
  } catch (error) {
    console.error("Error processing PDF:", error);
    return res.status(500).json({ error: "Failed to process PDF" });
  }
});

// Socket.IO connection handling
io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);

  socket.on("sendMessage", async (data) => {
    try {
      const { message, documentId, language = "en" } = data;
      let prompt = message;

      // Add document context if provided
      if (documentId && uploadedDocuments[documentId]) {
        prompt = `Context from the uploaded document: ${uploadedDocuments[documentId]}\n\nUser query: ${message}`;
      }

      // Add language instruction if not English
      if (language !== "en") {
        prompt = `Please respond in ${language} language to the following query: ${prompt}`;
      }

      // Create a system prompt for NGO context
      const systemPrompt = `You are an AI assistant specialized in NGO operations, governance, funding, and impact assessment. 
      Provide helpful, accurate, and concise information on topics like grant applications, government regulations, 
      financial reporting for donors, impact assessment, and other NGO-related queries. 
      If you don't know something, be honest about it.`;

      // Stream response
      const result = await model.generateContentStream({
        contents: [
          { role: "user", parts: [{ text: systemPrompt + "\n\n" + prompt }] },
        ],
      });

      // Send response chunks as they arrive
      for await (const chunk of result.stream) {
        const chunkText = chunk.text();
        if (chunkText) {
          socket.emit("message", {
            text: chunkText,
            isUser: false,
            isPartial: true,
          });
        }
      }

      // Signal end of response
      socket.emit("message", {
        text: "",
        isUser: false,
        isPartial: false,
        isComplete: true,
      });
    } catch (error) {
      console.error("Error generating response:", error);
      socket.emit("message", {
        text: "Sorry, I encountered an error processing your request. Please try again.",
        isUser: false,
      });
    }
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
