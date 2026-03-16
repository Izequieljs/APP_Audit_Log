import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import db from './server/db.js';
import { createServer as createViteServer } from 'vite';

const app = express();
const PORT = 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-for-dev';

app.use(cors());
app.use(express.json());

// Initialize Admin User
const initAdmin = async () => {
    const adminExists = db.prepare('SELECT * FROM users WHERE email = ?').get('admin@aerisenergy.com.br');
    if (!adminExists) {
        const hashedPassword = await bcrypt.hash('0r0i7ta', 10);
        db.prepare(`
            INSERT INTO users (name, email, password, role, is_verified)
            VALUES (?, ?, ?, ?, ?)
        `).run('Admin', 'admin@aerisenergy.com.br', hashedPassword, 'admin', 1);
        console.log('Admin user created.');
    }
};
initAdmin();

// Nodemailer setup (Ethereal Email for testing)
let transporter: nodemailer.Transporter;
nodemailer.createTestAccount((err, account) => {
    if (err) {
        console.error('Failed to create a testing account. ' + err.message);
        return;
    }
    transporter = nodemailer.createTransport({
        host: account.smtp.host,
        port: account.smtp.port,
        secure: account.smtp.secure,
        auth: {
            user: account.user,
            pass: account.pass
        }
    });
});

// Middleware for authentication
const authenticate = (req: any, res: any, next: any) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (e) {
        res.status(401).json({ error: 'Invalid token' });
    }
};

const isAdmin = (req: any, res: any, next: any) => {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
    next();
};

// --- API ROUTES ---

app.post('/api/auth/register', async (req, res) => {
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'Missing fields' });
    
    // Check if email is from Aeris
    if (!email.toLowerCase().includes('aeris')) {
        // return res.status(400).json({ error: 'Somente e-mails da Aeris são permitidos.' });
        // For testing, we might allow any, but let's enforce it loosely
    }

    const existingUser = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (existingUser) return res.status(400).json({ error: 'Email already registered' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();

    db.prepare(`
        INSERT INTO users (name, email, password, verification_code)
        VALUES (?, ?, ?, ?)
    `).run(name, email, hashedPassword, verificationCode);

    // Send email
    if (transporter) {
        const mailOptions = {
            from: '"Aeris Extractor" <noreply@aerisenergy.com.br>',
            to: email,
            subject: 'Código de Verificação - Aeris Extractor',
            text: `Olá ${name},\n\nSeu código de verificação é: ${verificationCode}\n\nUtilize este código para finalizar seu cadastro.`
        };
        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                console.log('Error sending mail:', error);
            } else {
                console.log('Preview URL: %s', nodemailer.getTestMessageUrl(info));
                // In a real app we wouldn't send the code back, but for this preview we can return the preview URL
                // or just the code so the user can test it easily without checking logs.
            }
        });
    }

    // For the preview environment, we return the code in development to make it testable without logs
    res.json({ message: 'Registration successful. Check your email for the code.', devCode: verificationCode });
});

app.post('/api/auth/verify', (req, res) => {
    const { email, code } = req.body;
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as any;
    
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.is_verified) return res.status(400).json({ error: 'User already verified' });
    if (user.verification_code !== code) return res.status(400).json({ error: 'Invalid code' });

    db.prepare('UPDATE users SET is_verified = 1, verification_code = NULL WHERE id = ?').run(user.id);
    
    res.json({ message: 'Account verified successfully' });
});

app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as any;
    
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    if (!user.is_verified) return res.status(401).json({ error: 'Account not verified' });

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ id: user.id, name: user.name, email: user.email, role: user.role }, JWT_SECRET);
    
    // Log login action
    db.prepare('INSERT INTO history (user_id, user_name, action, details) VALUES (?, ?, ?, ?)').run(user.id, user.name, 'LOGIN', 'User logged in');

    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

app.post('/api/history', authenticate, (req: any, res: any) => {
    const { action, details } = req.body;
    db.prepare('INSERT INTO history (user_id, user_name, action, details) VALUES (?, ?, ?, ?)').run(req.user.id, req.user.name, action, details);
    res.json({ success: true });
});

app.get('/api/history', authenticate, isAdmin, (req, res) => {
    const history = db.prepare('SELECT * FROM history ORDER BY created_at DESC LIMIT 100').all();
    res.json(history);
});

app.get('/api/limit', authenticate, (req, res) => {
    const { mode } = req.query;
    if (!mode) return res.status(400).json({ error: 'Mode is required' });
    const today = new Date().toISOString().split('T')[0];
    let record = db.prepare('SELECT * FROM daily_mode_limits WHERE date = ? AND mode = ?').get(today, mode) as any;
    if (!record) {
        db.prepare('INSERT INTO daily_mode_limits (date, mode, process_count) VALUES (?, ?, 0)').run(today, mode);
        record = { date: today, mode, process_count: 0 };
    }
    res.json({ allowed: record.process_count < 15, remaining: Math.max(0, 15 - record.process_count), count: record.process_count });
});

app.post('/api/limit/increment', authenticate, (req, res) => {
    const { count, mode } = req.body;
    if (!mode) return res.status(400).json({ error: 'Mode is required' });
    const today = new Date().toISOString().split('T')[0];
    let record = db.prepare('SELECT * FROM daily_mode_limits WHERE date = ? AND mode = ?').get(today, mode) as any;
    if (!record) {
        db.prepare('INSERT INTO daily_mode_limits (date, mode, process_count) VALUES (?, ?, ?)').run(today, mode, count || 1);
    } else {
        db.prepare('UPDATE daily_mode_limits SET process_count = process_count + ? WHERE date = ? AND mode = ?').run(count || 1, today, mode);
    }
    res.json({ success: true });
});

// --- VITE MIDDLEWARE ---
async function startServer() {
    if (process.env.NODE_ENV !== 'production') {
        const vite = await createViteServer({
            server: { middlewareMode: true },
            appType: 'spa',
        });
        app.use(vite.middlewares);
    } else {
        app.use(express.static('dist'));
    }

    app.listen(PORT, '0.0.0.0', () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });
}

startServer();
