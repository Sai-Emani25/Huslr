import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("huslr.db");

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    is_banned INTEGER DEFAULT 0,
    is_verified INTEGER DEFAULT 0,
    balance REAL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS listings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    type TEXT CHECK(type IN ('task', 'rental')),
    title TEXT NOT NULL,
    description TEXT,
    price REAL NOT NULL,
    category TEXT,
    status TEXT DEFAULT 'active',
    commission_paid REAL,
    image_url TEXT,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    listing_id INTEGER,
    buyer_id INTEGER,
    amount REAL,
    fee REAL,
    duration TEXT,
    due_date TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(listing_id) REFERENCES listings(id),
    FOREIGN KEY(buyer_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id INTEGER,
    receiver_id INTEGER,
    listing_id INTEGER,
    content TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(sender_id) REFERENCES users(id),
    FOREIGN KEY(receiver_id) REFERENCES users(id),
    FOREIGN KEY(listing_id) REFERENCES listings(id)
  );
`);

// Seed initial user if empty
const userCount = db.prepare("SELECT COUNT(*) as count FROM users").get() as { count: number };
if (userCount.count === 0) {
  const userResult = db.prepare("INSERT INTO users (name, email, balance, is_verified) VALUES (?, ?, ?, ?)").run("Demo User", "demo@huslr.app", 1000, 1);
  const userId = userResult.lastInsertRowid;

  // Seed some listings
  const seedListings = [
    { type: 'task', title: 'Professional Dog Walking', description: 'I will walk your dog for 1 hour in the local park. Experienced with all breeds.', price: 250, category: 'Pet Care', image_url: 'https://picsum.photos/seed/golden-retriever/800/600' },
    { type: 'task', title: 'House Cleaning Service', description: 'Deep cleaning for apartments and houses. All supplies included.', price: 1500, category: 'Home Assistance', image_url: 'https://picsum.photos/seed/cleaning-service/800/600' },
    { type: 'task', title: 'Furniture Assembly', description: 'Expert IKEA furniture assembly. Fast and reliable.', price: 800, category: 'Home Assistance', image_url: 'https://picsum.photos/seed/furniture-assembly/800/600' },
    { type: 'task', title: 'Baby Sitting', description: 'Responsible and caring babysitter available for evenings and weekends.', price: 500, category: 'Child Minding', image_url: 'https://picsum.photos/seed/baby-sitting/800/600' },
    { type: 'rental', title: 'Sony A7III Camera Kit', description: 'Full frame mirrorless camera with 24-70mm f2.8 lens. Perfect for events.', price: 2500, category: 'Equipment', image_url: 'https://picsum.photos/seed/sony-camera/800/600' },
    { type: 'rental', title: 'Electric Mountain Bike', description: 'High-performance e-bike with 50-mile range. Helmet included.', price: 1200, category: 'Other', image_url: 'https://picsum.photos/seed/ebike/800/600' },
    { type: 'rental', title: 'Camping Tent (4 Person)', description: 'Waterproof 4-person tent. Easy setup. Includes ground sheet.', price: 500, category: 'Other', image_url: 'https://picsum.photos/seed/camping-tent/800/600' },
    { type: 'rental', title: 'Power Drill Set', description: 'Professional grade cordless power drill with multiple bits.', price: 300, category: 'Equipment', image_url: 'https://picsum.photos/seed/power-drill/800/600' },
  ];

  const insertListing = db.prepare(`
    INSERT INTO listings (user_id, type, title, description, price, category, commission_paid, image_url)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  seedListings.forEach(l => {
    insertListing.run(userId, l.type, l.title, l.description, l.price, l.category, l.price * 0.05, l.image_url);
  });
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.get("/api/users/me", (req, res) => {
    const user = db.prepare("SELECT * FROM users LIMIT 1").get();
    res.json(user);
  });

  app.get("/api/listings", (req, res) => {
    const listings = db.prepare(`
      SELECT l.*, u.name as owner_name 
      FROM listings l 
      JOIN users u ON l.user_id = u.id 
      WHERE l.status = 'active' AND u.is_banned = 0
    `).all();
    res.json(listings);
  });

  app.post("/api/listings", (req, res) => {
    const { user_id, type, title, description, price, category } = req.body;
    
    // Check if user is banned
    const user = db.prepare("SELECT is_banned FROM users WHERE id = ?").get(user_id) as { is_banned: number };
    if (user?.is_banned) {
      return res.status(403).json({ error: "User is banned" });
    }

    const commission = price * 0.05;
    const result = db.prepare(`
      INSERT INTO listings (user_id, type, title, description, price, category, commission_paid)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(user_id, type, title, description, price, category, commission);

    res.json({ id: result.lastInsertRowid, commission });
  });

  app.post("/api/users/ban", (req, res) => {
    const { user_id } = req.body;
    db.prepare("UPDATE users SET is_banned = 1 WHERE id = ?").run(user_id);
    res.json({ success: true });
  });

  app.get("/api/my-stuff", (req, res) => {
    const userId = req.query.userId;
    if (!userId) return res.status(400).json({ error: "User ID required" });

    const stuff = db.prepare(`
      SELECT t.*, l.title, l.type, l.image_url, u.name as owner_name
      FROM transactions t
      JOIN listings l ON t.listing_id = l.id
      JOIN users u ON l.user_id = u.id
      WHERE t.buyer_id = ?
      ORDER BY t.timestamp DESC
    `).all(userId);
    res.json(stuff);
  });

  app.post("/api/transactions", (req, res) => {
    const { listing_id, buyer_id, amount, duration, due_date } = req.body;
    const fee = amount * 0.05;
    
    const result = db.prepare(`
      INSERT INTO transactions (listing_id, buyer_id, amount, fee, duration, due_date)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(listing_id, buyer_id, amount, fee, duration, due_date);

    res.json({ id: result.lastInsertRowid });
  });

  app.get("/api/messages", (req, res) => {
    const { listing_id, user1_id, user2_id } = req.query;
    if (!listing_id || !user1_id || !user2_id) {
      return res.status(400).json({ error: "Missing parameters" });
    }

    const messages = db.prepare(`
      SELECT m.*, u.name as sender_name
      FROM messages m
      JOIN users u ON m.sender_id = u.id
      WHERE m.listing_id = ? 
      AND ((m.sender_id = ? AND m.receiver_id = ?) OR (m.sender_id = ? AND m.receiver_id = ?))
      ORDER BY m.timestamp ASC
    `).all(listing_id, user1_id, user2_id, user2_id, user1_id);
    res.json(messages);
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  const httpServer = createServer(app);
  const wss = new WebSocketServer({ server: httpServer });

  const clients = new Map<number, WebSocket>();

  wss.on("connection", (ws, req) => {
    const userId = parseInt(new URL(req.url!, `http://${req.headers.host}`).searchParams.get("userId") || "0");
    if (userId) {
      clients.set(userId, ws);
    }

    ws.on("message", (data) => {
      const message = JSON.parse(data.toString());
      const { sender_id, receiver_id, listing_id, content } = message;

      const result = db.prepare(`
        INSERT INTO messages (sender_id, receiver_id, listing_id, content)
        VALUES (?, ?, ?, ?)
      `).run(sender_id, receiver_id, listing_id, content);

      const savedMessage = db.prepare(`
        SELECT m.*, u.name as sender_name
        FROM messages m
        JOIN users u ON m.sender_id = u.id
        WHERE m.id = ?
      `).get(result.lastInsertRowid);

      // Send to receiver if online
      const receiverWs = clients.get(receiver_id);
      if (receiverWs && receiverWs.readyState === WebSocket.OPEN) {
        receiverWs.send(JSON.stringify(savedMessage));
      }
      
      // Send back to sender for confirmation
      ws.send(JSON.stringify(savedMessage));
    });

    ws.on("close", () => {
      if (userId) {
        clients.delete(userId);
      }
    });
  });

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
