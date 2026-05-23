import express from "express";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import dotenv from "dotenv";
import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || "georeal-ai-secret-key-12345";

// Initialize SQLite
const db = new Database("database.sqlite");

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

let ai: GoogleGenAI;

async function startServer() {
  const app = express();
  app.use(express.json());

  ai = new GoogleGenAI({ 
    apiKey: process.env.GEMINI_API_KEY || "",
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      }
    }
  });

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

  // Gemini AI Proxy
  app.post("/api/ai/generate", authenticate, async (req, res) => {
    try {
      const { prompt, systemInstruction } = req.body;
      const response = await ai.models.generateContent({ 
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          systemInstruction
        }
      });
      res.json({ text: response.text });
    } catch (error: any) {
      console.error("Gemini proxy error:", error);
      const isQuotaError = error.message?.includes("quota") || error.message?.includes("429") || error.status === 429;
      
      let retryAfter = null;
      if (isQuotaError && error.details) {
        const retryInfo = error.details.find((d: any) => d["@type"]?.includes("RetryInfo"));
        if (retryInfo) retryAfter = retryInfo.retryDelay;
      }

      res.status(isQuotaError ? 429 : 500).json({ 
        error: error.message,
        code: isQuotaError ? "QUOTA_EXCEEDED" : "SERVER_ERROR",
        retryAfter
      });
    }
  });

  app.post("/api/ai/chat", authenticate, async (req, res) => {
    try {
      const { history, message, systemInstruction, tools } = req.body;
      const contents = [...(history || [])];
      
      if (typeof message === "string") {
        contents.push({ role: "user", parts: [{ text: message }] });
      } else {
        contents.push({ role: "user", parts: message });
      }

      const response = await ai.models.generateContent({ 
        model: "gemini-3-flash-preview",
        contents,
        config: {
          systemInstruction,
          tools
        }
      });
      
      res.json({ 
        text: response.text,
        candidates: response.candidates
      });
    } catch (error: any) {
      console.error("Gemini chat proxy error:", error);
      const isQuotaError = error.message?.includes("quota") || error.message?.includes("429") || error.status === 429;
      
      let retryAfter = null;
      if (isQuotaError && error.details) {
        const retryInfo = error.details.find((d: any) => d["@type"]?.includes("RetryInfo"));
        if (retryInfo) retryAfter = retryInfo.retryDelay;
      }

      res.status(isQuotaError ? 429 : 500).json({ 
        error: error.message,
        code: isQuotaError ? "QUOTA_EXCEEDED" : "SERVER_ERROR",
        retryAfter
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
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
