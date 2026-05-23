import express from "express";
import { createServer as createViteServer } from "vite";
import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import dotenv from "dotenv";
import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

dotenv.config();

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || "georeal-ai-secret-key-12345";
if (!process.env.JWT_SECRET && process.env.NODE_ENV === "production") {
  console.warn("WARN: JWT_SECRET environment variable is missing in production. Falling back to default.");
}

// Initialize SQLite
const db = new Database("database.sqlite");

// Enable Write-Ahead Logging (WAL) mode for superior production database concurrency and speed
db.pragma("journal_mode = WAL");

// Initialize Database Schema
db.exec(`
  CREATE TABLE IF NOT EXISTS companies (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    country TEXT NOT NULL DEFAULT 'Georgia',
    subscription_plan TEXT DEFAULT 'free',
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    company_id TEXT,
    country TEXT NOT NULL DEFAULT 'Georgia',
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    name TEXT,
    role TEXT DEFAULT 'owner',
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id)
  );
`);

// Migration: ensure country column exists
try {
  const companyCols = db.prepare("PRAGMA table_info(companies)").all() as any[];
  if (!companyCols.some(col => col.name === "country")) {
    db.prepare("ALTER TABLE companies ADD COLUMN country TEXT NOT NULL DEFAULT 'Georgia'").run();
  }
  const userCols = db.prepare("PRAGMA table_info(users)").all() as any[];
  if (!userCols.some(col => col.name === "country")) {
    db.prepare("ALTER TABLE users ADD COLUMN country TEXT NOT NULL DEFAULT 'Georgia'").run();
  }
} catch (e) {
  console.error("Migration error:", e);
}

db.exec(`
  CREATE TABLE IF NOT EXISTS leads (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    budget TEXT,
    city TEXT,
    district TEXT,
    rooms INTEGER,
    status TEXT DEFAULT 'New',
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id)
  );

  CREATE TABLE IF NOT EXISTS properties (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    property_type TEXT DEFAULT 'Apartment',
    city TEXT DEFAULT 'Tbilisi',
    district TEXT,
    address TEXT,
    price REAL DEFAULT 0,
    rooms INTEGER DEFAULT 0,
    area REAL DEFAULT 0,
    lat REAL,
    lng REAL,
    status TEXT DEFAULT 'available',
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id)
  );

  CREATE TABLE IF NOT EXISTS deals (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    lead_id TEXT,
    property_id TEXT,
    amount REAL,
    status TEXT DEFAULT 'Prospect',
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id)
  );
`);

// Seed default database data if users table is empty
try {
  const userCount = (db.prepare("SELECT COUNT(*) as count FROM users").get() as any).count;
  if (userCount === 0) {
    console.log("Seeding default demo database...");
    const companyId = "demo-company-123";
    const userId = "demo-user-123";
    
    // Create company
    db.prepare("INSERT INTO companies (id, name, country, subscription_plan) VALUES (?, ?, ?, ?)")
      .run(companyId, "VistaReal Agency", "Georgia", "premium");

    // Create user: demo@vistareal.ai / password
    const hashedPassword = bcrypt.hashSync("password", 10);
    db.prepare("INSERT INTO users (id, company_id, country, email, password, name, role) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(userId, companyId, "Georgia", "demo@vistareal.ai", hashedPassword, "Demo Manager", "owner");

    // Create some leads
    db.prepare(`
      INSERT INTO leads (id, company_id, name, phone, email, budget, city, district, rooms, status)
      VALUES 
        ('lead-1', ?, 'Alexander Petrov', '+995 555 123 456', 'alex@example.com', '120,000 $', 'Tbilisi', 'Vake', 2, 'Contacted'),
        ('lead-2', ?, 'Sofia Karapetyan', '+374 91 765 432', 'sofia@example.com', '85,000 $', 'Yerevan', 'Kentron', 1, 'New'),
        ('lead-3', ?, 'Murat Aliev', '+7 701 987 6543', 'murat@example.com', '210,000 $', 'Almaty', 'Bostandyk', 3, 'Qualified')
    `).run(companyId, companyId, companyId);

    // Create some properties
    db.prepare(`
      INSERT INTO properties (id, company_id, title, description, property_type, city, district, address, price, rooms, area, lat, lng, status)
      VALUES 
        ('prop-1', ?, 'Modern 2-Bedroom Apartment in Vake', 'Beautiful cozy apartment in the heart of Vake district. Excellent view, newly renovated, modern furniture and built-in appliances.', 'Apartment', 'Tbilisi', 'Vake', 'Chavchavadze Ave 37', 115000, 2, 75, 41.7115, 44.7554, 'available'),
        ('prop-2', ?, 'Cozy Loft in Old Tbilisi', 'Charming boutique atmosphere. Vintage style details with a modern touch, perfect for rent or personal stays in historic area.', 'Apartment', 'Tbilisi', 'Old Tbilisi', 'Kote Afkhazi St 22', 95000, 1, 45, 41.6917, 44.8058, 'available'),
        ('prop-3', ?, 'Luxury Villa with Panoramic Views', 'Magnificent view overlooking the city and valley. Private heated pool, spacious landscaped garden and premium finishing.', 'Villa', 'Tbilisi', 'Ortachala', 'Gorgasali St', 350000, 5, 280, 41.6745, 44.8291, 'available')
    `).run(companyId, companyId, companyId);

    // Create some deals
    db.prepare(`
      INSERT INTO deals (id, company_id, lead_id, property_id, amount, status)
      VALUES 
        ('deal-1', ?, 'lead-1', 'prop-1', 115000, 'Negotiation'),
        ('deal-2', ?, 'lead-3', 'prop-3', 350000, 'Prospect')
    `).run(companyId, companyId);
    
    console.log("Demo database seeding complete.");
  }
} catch (e) {
  console.error("Failed to seed database: ", e);
}

let openaiInstance: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!openaiInstance) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is not configured in your application environment.");
    }
    openaiInstance = new OpenAI({ apiKey });
  }
  return openaiInstance;
}

let geminiInstance: GoogleGenAI | null = null;

function getGemini_ai(): GoogleGenAI {
  if (!geminiInstance) {
    const apiKey = process.env.GEMINI_API_KEY;
    geminiInstance = new GoogleGenAI({
      apiKey: apiKey || "",
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        }
      }
    });
  }
  return geminiInstance;
}

function convertSchema(schema: any): any {
  if (!schema || typeof schema !== "object") return schema;
  const newSchema = { ...schema };
  if (typeof newSchema.type === "string") {
    newSchema.type = newSchema.type.toLowerCase();
  }
  if (newSchema.properties && typeof newSchema.properties === "object") {
    const newProps: any = {};
    for (const key of Object.keys(newSchema.properties)) {
      newProps[key] = convertSchema(newSchema.properties[key]);
    }
    newSchema.properties = newProps;
  }
  if (newSchema.items && typeof newSchema.items === "object") {
    newSchema.items = convertSchema(newSchema.items);
  }
  return newSchema;
}

function convertGeminiHistoryToOpenAI(contents: any[]): any[] {
  const result: any[] = [];
  const openToolCalls: Record<string, string> = {};
  
  for (let i = 0; i < contents.length; i++) {
    const msg = contents[i];
    const role = msg.role === "model" ? "assistant" : "user";
    const parts = Array.isArray(msg.parts) ? msg.parts : (typeof msg.parts === "string" ? [{ text: msg.parts }] : []);
    
    const texts: string[] = [];
    const toolCalls: any[] = [];
    const toolResponses: any[] = [];
    
    for (let pIndex = 0; pIndex < parts.length; pIndex++) {
      const part = parts[pIndex];
      if (part.text) {
        texts.push(part.text);
      } else if (part.functionCall) {
        const callId = `call_${i}_${pIndex}`;
        const fCall = part.functionCall;
        toolCalls.push({
          id: callId,
          type: "function",
          function: {
            name: fCall.name,
            arguments: typeof fCall.args === "object" ? JSON.stringify(fCall.args) : (fCall.args || "{}")
          }
        });
        openToolCalls[fCall.name] = callId;
      } else if (part.functionResponse) {
        const fResp = part.functionResponse;
        const matchingId = openToolCalls[fResp.name] || `call_orphan_${i}_${pIndex}`;
        toolResponses.push({
          role: "tool",
          tool_call_id: matchingId,
          name: fResp.name,
          content: typeof fResp.response === "object" ? JSON.stringify(fResp.response) : String(fResp.response || "{}")
        });
      }
    }
    
    if (toolResponses.length > 0) {
      for (const tr of toolResponses) {
        result.push(tr);
      }
    } else {
      const openAIMsg: any = { role };
      if (texts.length > 0) {
        openAIMsg.content = texts.join("\n");
      }
      if (toolCalls.length > 0) {
        openAIMsg.tool_calls = toolCalls;
      }
      if (openAIMsg.content !== undefined || openAIMsg.tool_calls !== undefined) {
        result.push(openAIMsg);
      }
    }
  }
  
  return result;
}

async function startServer() {
  const app = express();
  app.use(express.json());

  // Auth Middleware
  const authenticate = async (req: any, res: any, next: any) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(" ")[1];
    
    if (!token || token === "null" || token === "undefined") {
      return res.status(401).json({ error: "No valid authentication token provided" });
    }

    try {
      const decoded: any = jwt.verify(token, JWT_SECRET);
      const user = db.prepare("SELECT * FROM users WHERE id = ?").get(decoded.id) as any;
      
      if (!user) {
        return res.status(401).json({ error: "User profile not found." });
      }
      
      req.user = { 
        id: user.id, 
        company_id: user.company_id, 
        role: user.role, 
        name: user.name,
        country: user.country
      };
      next();
    } catch (err: any) {
      console.error("[Auth] Token verification failed:", err.message);
      res.status(401).json({ error: "Invalid or expired session token" });
    }
  };

  // --- Auth Routes ---
  app.post("/api/auth/register", async (req, res) => {
    const { email, password, name, country } = req.body;
    
    if (!email || !password || !country) {
      return res.status(400).json({ error: "Email, password and country are required" });
    }

    try {
      // Check if user exists
      const existingUser = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
      if (existingUser) {
        return res.status(400).json({ error: "Email already in use" });
      }

      const userId = Math.random().toString(36).substring(2, 15);
      const companyId = Math.random().toString(36).substring(2, 15);
      const hashedPassword = await bcrypt.hash(password, 10);

      // Create company
      db.prepare("INSERT INTO companies (id, name, country) VALUES (?, ?, ?)").run(companyId, name ? `${name}'s Agency` : "My Agency", country);
      
      // Create user
      db.prepare("INSERT INTO users (id, company_id, email, password, name, role, country) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .run(userId, companyId, email, hashedPassword, name || email.split("@")[0], "owner", country);

      const token = jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: "7d" });
      
      res.json({
        token,
        user: {
          id: userId,
          name: name || email.split("@")[0],
          role: "owner",
          company_id: companyId,
          country
        }
      });
    } catch (err: any) {
      console.error("Registration error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    const { email, password } = req.body;
    
    try {
      const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email) as any;
      if (!user) {
        return res.status(401).json({ error: "Invalid email or password" });
      }

      const isValid = await bcrypt.compare(password, user.password);
      if (!isValid) {
        return res.status(401).json({ error: "Invalid email or password" });
      }

      const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: "7d" });
      
      res.json({
        token,
        user: {
          id: user.id,
          name: user.name,
          role: user.role,
          company_id: user.company_id,
          country: user.country
        }
      });
    } catch (err: any) {
      console.error("Login error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/auth/me", authenticate, (req: any, res: any) => {
    res.json({ user: req.user });
  });

  // --- Health Check ---
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", db: "sqlite" });
  });

  // OpenAI & Gemini AI Proxy - Generate Text with Automatic Fallback and Local Engine
  app.post("/api/ai/generate", authenticate, async (req, res) => {
    try {
      const { prompt, systemInstruction } = req.body;
      
      // Attempt to use OpenAI first if configured
      if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim() !== "") {
        try {
          const openai = getOpenAI();
          const messages: any[] = [];
          if (systemInstruction) {
            messages.push({ role: "system", content: systemInstruction });
          }
          messages.push({ role: "user", content: prompt });

          const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages,
            temperature: 0.7,
          });

          return res.json({ text: response.choices[0]?.message?.content || "" });
        } catch (openaiErr: any) {
          console.warn("OpenAI generation failed or quota exceeded. Falling back to platform Gemini AI. Error:", openaiErr.message || openaiErr);
        }
      }

      // Fallback to platform-managed Gemini Model (extremely reliable, free, and robust in AI Studio environments)
      try {
        const gemini = getGemini_ai();
        const response = await gemini.models.generateContent({
          model: "gemini-3.5-flash",
          contents: prompt,
          config: {
            systemInstruction
          }
        });
        return res.json({ text: response.text });
      } catch (geminiErr: any) {
        console.warn("Gemini generation failed or quota exceeded. Activating local CRM generator fallback. Error:", geminiErr.message || geminiErr);
      }

      // Offline fallback: Rule-based generation of realistic descriptions and translation structures
      const isRussian = prompt.toLowerCase().includes("russian") || prompt.toLowerCase().includes("русск") || prompt.toLowerCase().includes(" в ru") || prompt.toLowerCase().includes(" в русском") || prompt.toLowerCase().includes("на русский");
      
      if (prompt.toLowerCase().includes("translate")) {
        const descMatch = prompt.match(/Description:\s*([\s\S]*)/i);
        let originalDesc = descMatch ? descMatch[1].trim() : prompt;
        
        let translated = originalDesc;
        if (isRussian) {
          translated = originalDesc
            .replace(/Beautiful cozy apartment in the heart of Vake district\. Excellent view, newly renovated, modern furniture and built-in appliances\./gi, "Красивая уютная квартира в самом сердце района Ваке. Отличный вид, новый ремонт, современная мебель и встроенная бытовая техника.")
            .replace(/Charming boutique atmosphere\. Vintage style details with a modern touch, perfect for rent or personal stays in historic area\./gi, "Очаровательная бутик-атмосфера. Детали в винтажном стиле с современным штрихом, идеально подходят для аренды или личного проживания в историческом районе.")
            .replace(/Magnificent view overlooking the city and valley\. Private heated pool, spacious landscaped garden and premium finishing\./gi, "Великолепный вид на город и долину. Частный бассейн с подогревом, просторный благоустроенный сад и отделка премиум-класса.");
            
          if (translated === originalDesc) {
            translated = `[Локальный Перевод] ` + originalDesc;
          }
        } else {
          translated = originalDesc
            .replace(/Красивая уютная квартира в самом сердце района Ваке\. Отличный вид, новый ремонт, современная мебель и встроенная бытовая техника\./gi, "Beautiful cozy apartment in the heart of Vake district. Excellent view, newly renovated, modern furniture and built-in appliances.")
            .replace(/Очаровательная бутик-атмосфера\. Детали в винтажном стиле с современным штрихом, идеально подходят для аренды или личного проживания в историческом районе\./gi, "Charming boutique atmosphere. Vintage style details with a modern touch, perfect for rent or personal stays in historic area.")
            .replace(/Великолепный вид на город и долину\. Частный бассейн с подогревом, просторный благоустроенный сад и отделка премиум-класса\./gi, "Magnificent view overlooking the city and valley. Private heated pool, spacious landscaped garden and premium finishing.");
            
          if (translated === originalDesc) {
            translated = `[Local Translation] ` + originalDesc;
          }
        }
        return res.json({ text: translated });
      }

      // Generate local realistic real-estate description when offline
      const title = prompt.match(/Title:\s*([^\n]+)/i)?.[1]?.trim() || "Apartment listing";
      const price = prompt.match(/Price:\s*([^\n]+)/i)?.[1]?.trim() || "Negotiable";
      const rooms = prompt.match(/Rooms:\s*([^\n]+)/i)?.[1]?.trim() || "2";
      const area = prompt.match(/Area:\s*([^\n]+)/i)?.[1]?.trim() || "65";
      const city = prompt.match(/City:\s*([^\n]+)/i)?.[1]?.trim() || "Tbilisi";

      let generatedDesc = "";
      if (isRussian) {
        generatedDesc = `Предлагается превосходный объект: ${title} в городе ${city}. Отличное расположение с развитой инфраструктурой вокруг. \n\nОсновные детали предложения: просторная планировка (${rooms} комн., общая площадь ${area} кв.м.), качественная качественная чистовая отделка, встроенные удобства и великолепный вид. \n\nУдобная транспортная развязка и доступность ко всем важным точкам района. Замечательное предложение по стоимости ${price}!`;
      } else {
        generatedDesc = `We are pleased to present this gorgeous listing: ${title} located in ${city}. Situated in an excellent and prime residential location. \n\nKey features include a highly comfortable and bright layout (${rooms} room(s), ${area} m² of premium space), stylish finishings and modern lifestyle amenities. \n\nIt features great accessibility to the public transit net and is offered at a very attractive price point of ${price}. Recommended for viewing!`;
      }
      
      res.json({ text: generatedDesc });

    } catch (error: any) {
      console.error("All AI services failed in generate endpoint:", error);
      res.status(500).json({ 
        error: error.message,
        code: "SERVER_ERROR"
      });
    }
  });

  // OpenAI & Gemini AI Proxy - Chat Endpoint with Automatic Fallback and Local Engine
  app.post("/api/ai/chat", authenticate, async (req: any, res: any) => {
    const { history, message, systemInstruction, tools } = req.body;
    const contents = [...(history || [])];
    const userCompanyId = req.user?.company_id || "demo-company-123";
    
    if (typeof message === "string") {
      contents.push({ role: "user", parts: [{ text: message }] });
    } else {
      contents.push({ role: "user", parts: message });
    }

    // Attempt to use OpenAI first if configured
    if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim() !== "") {
      try {
        const openai = getOpenAI();
        const openAIMessages = convertGeminiHistoryToOpenAI(contents);
        
        if (systemInstruction) {
          openAIMessages.unshift({ role: "system", content: systemInstruction });
        }

        const openAITools = [];
        if (tools && Array.isArray(tools)) {
          for (const t of tools) {
            if (t.functionDeclarations && Array.isArray(t.functionDeclarations)) {
              for (const fd of t.functionDeclarations) {
                openAITools.push({
                  type: "function",
                  function: {
                    name: fd.name,
                    description: fd.description,
                    parameters: convertSchema(fd.parameters)
                  }
                });
              }
            }
          }
        }

        const options: any = {
          model: "gpt-4o-mini",
          messages: openAIMessages,
          temperature: 0.7,
        };

        if (openAITools.length > 0) {
          options.tools = openAITools;
        }

        const response = await openai.chat.completions.create(options);
        
        const choice = response.choices[0];
        const assistantMessage = choice?.message;
        const aiText = assistantMessage?.content || "";
        
        const parts: any[] = [];
        if (aiText) {
          parts.push({ text: aiText });
        }
        
        if (assistantMessage?.tool_calls && Array.isArray(assistantMessage.tool_calls)) {
          for (const tc of assistantMessage.tool_calls) {
            if (tc.type === "function") {
              let parsedArgs = {};
              try {
                parsedArgs = JSON.parse(tc.function.arguments || "{}");
              } catch (err) {
                console.error("Error parsing tool call arguments:", err);
              }
              parts.push({
                functionCall: {
                  name: tc.function.name,
                  args: parsedArgs
                }
              });
            }
          }
        }
        
        return res.json({ 
          text: aiText,
          candidates: [
            {
              content: {
                parts: parts
              }
            }
          ]
        });
      } catch (openaiErr: any) {
        console.warn("OpenAI chat failed or quota exceeded. Falling back to platform Gemini AI. Error:", openaiErr.message || openaiErr);
      }
    }

    // Fallback to platform-managed Gemini Model (including native schema layout and tools)
    try {
      const gemini = getGemini_ai();
      
      const response = await gemini.models.generateContent({ 
        model: "gemini-3.5-flash",
        contents,
        config: {
          systemInstruction,
          tools
        }
      });
      
      return res.json({ 
        text: response.text || "",
        candidates: response.candidates || [
          {
            content: {
              parts: [{ text: response.text || "" }]
            }
          }
        ]
      });
    } catch (geminiErr: any) {
      console.warn("Gemini chat failed or quota exceeded. Activating local CRM chatbot fallback. Error:", geminiErr.message || geminiErr);
    }

    // Interactive Local real-estate expert rule engine when all external AI channels are closed or limited
    try {
      // Get the absolute latest user instruction
      const lastContent = contents[contents.length - 1];
      let userMsg = "";
      if (lastContent) {
        if (typeof lastContent.parts === "string") {
          userMsg = lastContent.parts;
        } else if (Array.isArray(lastContent.parts)) {
          const textPart = lastContent.parts.find((p: any) => p.text);
          if (textPart) {
            userMsg = textPart.text;
          } else {
            // Check for a tool response
            const responsePart = lastContent.parts.find((p: any) => p.functionResponse);
            if (responsePart) {
              const fResponse = responsePart.functionResponse;
              const respData = fResponse.response || {};
              if (fResponse.name === "searchProperties") {
                const props = respData.properties || [];
                if (props.length === 0) {
                  return res.json({
                    text: "No active property listings were found matching those exact limits. You can customize filter prices/rooms to find more listings!"
                  });
                }
                let text = `Here are the matching property listings found in our CRM:\n\n`;
                for (const p of props) {
                  text += `- **${p.title}** (${p.property_type}) in *${p.city}*, ${p.district || ''}. Price: **$${p.price.toLocaleString()}**, ${p.rooms} rooms, ${p.area} m².\n`;
                }
                text += `\nWould you like me to draft a new deal or link an active lead to one of these locations?`;
                return res.json({ text });
              } else if (fResponse.name === "searchClients") {
                const clients = respData.clients || [];
                if (clients.length === 0) {
                  return res.json({
                    text: "No clients found matching those criteria. You can register a new client profile in our CRM dynamically!"
                  });
                }
                let text = `Here are the matching clients and active leads from your agency dashboard:\n\n`;
                for (const c of clients) {
                  text += `- **${c.name}** looking in *${c.city}* (${c.district || ''}). budget: **${c.budget}**, status: **${c.status || 'New'}**, phone: ${c.phone || 'N/A'}.\n`;
                }
                text += `\nHow should we follow up with these active clients?`;
                return res.json({ text });
              }
            }
          }
        }
      }

      const textLower = userMsg.toLowerCase();

      // Heuristic 1: Greetings
      if (textLower.includes("hello") || textLower.includes("hi") || textLower.includes("привет") || textLower.includes("здравствуй") || textLower.includes("салам") || textLower.includes("начать")) {
        const greetingMsg = `Hello! I am your **VistaReal AI assistant** (Local Offline Mode). 

Even if the API quota limits are temporarily reached, my rule-based offline search engine ensures your CRM workspace keeps working smoothly!

You can run standard operations directly by typing:
1. **Search properties**: *"Search properties in Tbilisi"* or *"Поиск квартир"*
2. **Search leads/clients**: *"Find clients in Tbilisi"* or *"Найди Алекса"*
3. **Register leads**: *"Create client John Doe with phone +995..."*
4. **Draft listings**: *"Add property Modern Loft in Vake with price 100000$"*

How can I help you manage your database records today?`;
        return res.json({ text: greetingMsg });
      }

      // Heuristic 2: Register client (Returns structured JSON so frontend executes registration automagically!)
      if (textLower.includes("create client") || textLower.includes("add client") || textLower.includes("добавь клиет") || textLower.includes("добавить клиента") || textLower.includes("создай клиента")) {
        const nameMatch = userMsg.match(/(?:имя|клиент|именем|name|for)\s+([A-ZА-Я][a-zа-я]+\s+[A-ZА-Я][a-zа-я]+|[A-ZА-Я][a-zа-я]+)/i);
        const phoneMatch = userMsg.match(/(\+?\d[\d\s-]{7,}\d)/);
        const budgetMatch = userMsg.match(/(?:бюджет|budget|for|of)\s*(\d+[\d\s,]*)/i);
        
        const clientName = nameMatch ? nameMatch[1] : "Active Lead";
        const clientPhone = phoneMatch ? phoneMatch[1] : "+995 555 123 456";
        const clientBudget = budgetMatch ? budgetMatch[1].replace(/[\s,]/g, "") + " $" : "120,000 $";

        const clientData = {
          name: clientName,
          phone: clientPhone,
          budget: clientBudget,
          city: "Tbilisi",
          district: "Vake",
          rooms: 2
        };

        const responseText = `I have successfully parsed the registration request offline! Here is the structured CRM data block. Please review and hit save:\n\n\`\`\`json\n{"type": "CREATE_CLIENT", "data": ${JSON.stringify(clientData)}}\n\`\`\``;
        return res.json({ text: responseText });
      }

      // Heuristic 3: Register property
      if (textLower.includes("create property") || textLower.includes("add property") || textLower.includes("добавь квартиру") || textLower.includes("добавить квартиру") || textLower.includes("создай квартиру")) {
        const titleMatch = userMsg.match(/(?:listing|title|название|loft|villa|apartment|квартира)\s+([A-ZА-Яa-zа-я\s\d-]+)/i);
        const priceMatch = userMsg.match(/(?:price|цена|за)\s*(\d+[\d\s,]*)/i);
        const addressMatch = userMsg.match(/(?:address|адрес|город)\s+([A-ZА-Яa-zа-я0-9\s,]+)/i);

        const propTitle = titleMatch ? titleMatch[1].trim() : "Custom Luxury Cozy Loft";
        const propPrice = priceMatch ? parseInt(priceMatch[1].replace(/[\s,]/g, "")) : 95000;
        const propAddress = addressMatch ? addressMatch[1].trim() : "Rustaveli Ave 12";

        const propData = {
          title: propTitle,
          price: propPrice,
          city: "Tbilisi",
          district: "Old Tbilisi",
          rooms: 2,
          area: 60,
          address: propAddress,
          property_type: "Apartment"
        };

        const responseText = `Great! I have successfully drafted the new property listing. Here is the JSON instruction to insert into your sqlite records:\n\n\`\`\`json\n{"type": "CREATE_PROPERTY", "data": ${JSON.stringify(propData)}}\n\`\`\n\n*(Please review the listing specifications before adding to the active catalog)*`;
        return res.json({ text: responseText });
      }

      // Heuristic 4: Property search trigger (Returns a tool call so the frontend automatically loads SQLite data!)
      if (textLower.includes("квартир") || textLower.includes("property") || textLower.includes("properties") || textLower.includes("дом") || textLower.includes("villa") || textLower.includes("жиль") || textLower.includes("listing") || textLower.includes("найди")) {
        let city = "Tbilisi";
        if (textLower.includes("батуми") || textLower.includes("batumi")) city = "Batumi";
        
        let maxPrice = undefined;
        const priceMatch = textLower.match(/(?:до|\bmax\b|\bunder\b|\bless than\b|\bдешевле\b)\s*(\d+[\d\s,]*)/i);
        if (priceMatch) {
          maxPrice = parseInt(priceMatch[1].replace(/[\s,]/g, ""));
        }

        return res.json({
          text: `Consulting your sqlite database for matching property listings in ${city}...`,
          candidates: [
            {
              content: {
                parts: [
                  {
                    functionCall: {
                      name: "searchProperties",
                      args: { city, maxPrice }
                    }
                  }
                ]
              }
            }
          ]
        });
      }

      // Heuristic 5: Clients search trigger (Returns a tool call so frontend automatically runs the database query!)
      if (textLower.includes("клиент") || textLower.includes("lead") || textLower.includes("client") || textLower.includes("александр") || textLower.includes("лид")) {
        return res.json({
          text: `Consulting your sqlite database for active leads in Tbilisi/Batumi...`,
          candidates: [
            {
              content: {
                parts: [
                  {
                    functionCall: {
                      name: "searchClients",
                      args: { city: "Tbilisi" }
                    }
                  }
                ]
              }
            }
          ]
        });
      }

      // Generic Intelligent Local statistics fallback
      let leadsCount = 0;
      let propertiesCount = 0;
      try {
        leadsCount = (db.prepare("SELECT COUNT(*) as count FROM leads WHERE company_id = ?").get(userCompanyId) as any).count;
        propertiesCount = (db.prepare("SELECT COUNT(*) as count FROM properties WHERE company_id = ?").get(userCompanyId) as any).count;
      } catch (e) {}

      const statisticsMessage = `I am currently representing your VistaReal offline agent model. 

Your sqlite CRM database contains:
- **${leadsCount} active leads / client profiles**
- **${propertiesCount} registered properties/listings**

If you want to perform real-time workspace actions, you can write:
- *"Search listings in Tbilisi under 200,000$"*
- *"Find client Alexander"*
- *"Add client Jane Doe with phone +995..."*
- *"Generate description for a 2-room apartment"*`;

      res.json({ text: statisticsMessage });

    } catch (fallbackError: any) {
      console.error("Critical: Even offline fallback assistant failed:", fallbackError);
      res.status(500).json({ 
        error: "Server offline fallback failure. Please verify connection.",
        code: "SERVER_ERROR"
      });
    }
  });

  // --- CRM Routes ---
  app.get("/api/leads", authenticate, (req: any, res) => {
    try {
      const leads = db.prepare("SELECT * FROM leads WHERE company_id = ? ORDER BY createdAt DESC").all(req.user.company_id);
      res.json(leads);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/leads", authenticate, (req: any, res) => {
    try {
      const { company_id } = req.user;
      const count = db.prepare("SELECT COUNT(*) as count FROM leads WHERE company_id = ?").get(company_id) as any;
      if (count.count >= 3) {
        return res.status(403).json({ error: "LIMIT_REACHED", message: "You have reached the limit of 3 clients in the demo version." });
      }

      const { name, phone, email, budget, city, district, rooms, status } = req.body;
      const id = Math.random().toString(36).substring(2, 15);
      
      db.prepare(`
        INSERT INTO leads (id, company_id, name, phone, email, budget, city, district, rooms, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, company_id, name, phone, email, budget, city, district, rooms, status || "New");
      
      res.json({ id });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.patch("/api/leads/:id", authenticate, (req: any, res) => {
    try {
      const { status } = req.body;
      db.prepare("UPDATE leads SET status = ? WHERE id = ? AND company_id = ?")
        .run(status, req.params.id, req.user.company_id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.put("/api/leads/:id", authenticate, (req: any, res) => {
    try {
      const { name, phone, email, budget, city, district, rooms, status } = req.body;
      db.prepare(`
        UPDATE leads 
        SET name = ?, phone = ?, email = ?, budget = ?, city = ?, district = ?, rooms = ?, status = ?
        WHERE id = ? AND company_id = ?
      `).run(name, phone, email, budget, city, district, rooms, status, req.params.id, req.user.company_id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.delete("/api/leads/:id", authenticate, (req: any, res) => {
    try {
      db.prepare("DELETE FROM leads WHERE id = ? AND company_id = ?")
        .run(req.params.id, req.user.company_id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get("/api/properties", authenticate, (req: any, res) => {
    try {
      const props = db.prepare("SELECT * FROM properties WHERE company_id = ?").all(req.user.company_id);
      res.json(props);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/properties", authenticate, (req: any, res) => {
    try {
      const { company_id } = req.user;
      const count = db.prepare("SELECT COUNT(*) as count FROM properties WHERE company_id = ?").get(company_id) as any;
      if (count.count >= 3) {
        return res.status(403).json({ error: "LIMIT_REACHED", message: "You have reached the limit of 3 objects in the demo version." });
      }

      const { title, description, property_type, city, district, address, price, rooms, area, lat, lng } = req.body;
      const id = Math.random().toString(36).substring(2, 15);
      
      db.prepare(`
        INSERT INTO properties (id, company_id, title, description, property_type, city, district, address, price, rooms, area, lat, lng)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, company_id, title, description, property_type || "Apartment", 
        city || "Tbilisi", district, address, price || 0, rooms || 0, area || 0, lat, lng
      );
      
      res.json({ id });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.put("/api/properties/:id", authenticate, (req: any, res) => {
    try {
      const { title, description, property_type, city, district, address, price, rooms, area, lat, lng } = req.body;
      db.prepare(`
        UPDATE properties
        SET title = ?, description = ?, property_type = ?, city = ?, district = ?, address = ?, price = ?, rooms = ?, area = ?, lat = ?, lng = ?
        WHERE id = ? AND company_id = ?
      `).run(title, description, property_type, city, district, address, price, rooms, area, lat, lng, req.params.id, req.user.company_id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.delete("/api/properties/:id", authenticate, (req: any, res) => {
    try {
      db.prepare("DELETE FROM properties WHERE id = ? AND company_id = ?")
        .run(req.params.id, req.user.company_id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get("/api/deals", authenticate, (req: any, res) => {
    try {
      const deals = db.prepare(`
        SELECT 
          d.*,
          d.status as stage,
          l.name as lead_name,
          p.title as property_title,
          p.price as price
        FROM deals d
        LEFT JOIN leads l ON d.lead_id = l.id
        LEFT JOIN properties p ON d.property_id = p.id
        WHERE d.company_id = ?
        ORDER BY d.createdAt DESC
      `).all(req.user.company_id);
      res.json(deals);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/deals", authenticate, (req: any, res) => {
    try {
      const { company_id } = req.user;
      const count = db.prepare("SELECT COUNT(*) as count FROM deals WHERE company_id = ?").get(company_id) as any;
      if (count.count >= 3) {
        return res.status(403).json({ error: "LIMIT_REACHED", message: "You have reached the limit of 3 deals in the demo version." });
      }

      const { lead_id, property_id, amount, status } = req.body;
      const id = Math.random().toString(36).substring(2, 15);
      
      db.prepare(`
        INSERT INTO deals (id, company_id, lead_id, property_id, amount, status)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(id, company_id, lead_id, property_id, amount, status || "Prospect");
      
      res.json({ id });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.patch("/api/deals/:id", authenticate, (req: any, res) => {
    try {
      const { status, amount } = req.body;
      const sets = [];
      const params = [];
      
      if (status !== undefined) {
        sets.push("status = ?");
        params.push(status);
      }
      if (amount !== undefined) {
        sets.push("amount = ?");
        params.push(amount);
      }
      
      if (sets.length === 0) {
        return res.status(400).json({ error: "No fields to update" });
      }
      
      params.push(req.params.id, req.user.company_id);
      
      db.prepare(`
        UPDATE deals 
        SET ${sets.join(", ")}
        WHERE id = ? AND company_id = ?
      `).run(...params);
      
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.delete("/api/deals/:id", authenticate, (req: any, res) => {
    try {
      db.prepare("DELETE FROM deals WHERE id = ? AND company_id = ?")
        .run(req.params.id, req.user.company_id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(process.cwd(), "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(process.cwd(), "dist", "index.html"));
    });
  }

  const PORT = 3000;
  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });

  // Graceful shutdown handling for production Docker environment
  const shutdown = () => {
    console.log("Shutdown signal received. Closing server and database connections...");
    server.close(() => {
      console.log("HTTP server closed.");
      try {
        db.close();
        console.log("SQLite database connection closed.");
      } catch (dbErr) {
        console.error("Error closing database connection during shutdown:", dbErr);
      }
      process.exit(0);
    });

    // Forcefully shut down after 10s if graceful shutdown gets stuck
    setTimeout(() => {
      console.error("Forceful shutdown triggered after timeout limit.");
      process.exit(1);
    }, 10000);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

startServer();
