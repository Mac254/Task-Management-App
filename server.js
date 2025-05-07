const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const dbConfig = {
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'auth_db'
};

const JWT_SECRET = 'your_secure_jwt_secret_key_1234567890'; // Replace with a secure key in production

async function startServer() {
    let db;
    try {
        db = await mysql.createConnection(dbConfig);
        console.log('Connected to MySQL database');
    } catch (error) {
        console.error('Database connection failed:', error);
        process.exit(1);
    }

    // Middleware to verify JWT
    const authenticateToken = (req, res, next) => {
        const authHeader = req.headers['authorization'];
        if (!authHeader) {
            return res.status(401).json({ message: 'No token provided' });
        }

        const token = authHeader.split(' ')[1];
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            req.user = decoded;
            next();
        } catch (error) {
            res.status(401).json({ message: 'Invalid token' });
        }
    };

    // Signup
    app.post('/signup', async (req, res) => {
        const { email, password } = req.body;
        try {
            const [rows] = await db.execute('SELECT * FROM users WHERE email = ?', [email]);
            if (rows.length > 0) {
                return res.status(400).json({ message: 'Email already exists' });
            }

            const hashedPassword = await bcrypt.hash(password, 10);
            await db.execute('INSERT INTO users (email, password) VALUES (?, ?)', [email, hashedPassword]);
            res.status(201).json({ message: 'User created' });
        } catch (error) {
            console.error('Signup error:', error);
            res.status(500).json({ message: 'Server error' });
        }
    });

    // Login
    app.post('/login', async (req, res) => {
        const { email, password } = req.body;
        try {
            const [rows] = await db.execute('SELECT * FROM users WHERE email = ?', [email]);
            if (rows.length === 0) {
                return res.status(401).json({ message: 'Invalid email or password' });
            }

            const user = rows[0];
            const match = await bcrypt.compare(password, user.password);
            if (!match) {
                return res.status(401).json({ message: 'Invalid email or password' });
            }

            const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '1h' });
            res.status(200).json({ message: 'Login successful', token });
        } catch (error) {
            console.error('Login error:', error);
            res.status(500).json({ message: 'Server error' });
        }
    });

    // Dashboard
    app.get('/dashboard', authenticateToken, async (req, res) => {
        res.status(200).json({ email: req.user.email });
    });

    // Get all tasks for user
    app.get('/tasks', authenticateToken, async (req, res) => {
        try {
            const [rows] = await db.execute('SELECT * FROM tasks WHERE user_id = ?', [req.user.userId]);
            res.status(200).json(rows);
        } catch (error) {
            console.error('Error fetching tasks:', error);
            res.status(500).json({ message: 'Server error' });
        }
    });

    // Create a task
    app.post('/tasks', authenticateToken, async (req, res) => {
        const { title, description } = req.body;
        if (!title || !description) {
            return res.status(400).json({ message: 'Title and description are required' });
        }

        try {
            await db.execute(
                'INSERT INTO tasks (user_id, title, description, status) VALUES (?, ?, ?, ?)',
                [req.user.userId, title, description, 'pending']
            );
            res.status(201).json({ message: 'Task created' });
        } catch (error) {
            console.error('Error creating task:', error);
            res.status(500).json({ message: 'Server error' });
        }
    });

    // Update task status
    app.put('/tasks/:id', authenticateToken, async (req, res) => {
        const { id } = req.params;
        const { status } = req.body;
        if (!status || !['pending', 'completed'].includes(status)) {
            return res.status(400).json({ message: 'Invalid status' });
        }

        try {
            const [result] = await db.execute(
                'UPDATE tasks SET status = ? WHERE id = ? AND user_id = ?',
                [status, id, req.user.userId]
            );
            if (result.affectedRows === 0) {
                return res.status(404).json({ message: 'Task not found or unauthorized' });
            }
            res.status(200).json({ message: 'Task updated' });
        } catch (error) {
            console.error('Error updating task:', error);
            res.status(500).json({ message: 'Server error' });
        }
    });

    // Delete a task
    app.delete('/tasks/:id', authenticateToken, async (req, res) => {
        const { id } = req.params;
        try {
            const [result] = await db.execute('DELETE FROM tasks WHERE id = ? AND user_id = ?', [id, req.user.userId]);
            if (result.affectedRows === 0) {
                return res.status(404).json({ message: 'Task not found or unauthorized' });
            }
            res.status(200).json({ message: 'Task deleted' });
        } catch (error) {
            console.error('Error deleting task:', error);
            res.status(500).json({ message: 'Server error' });
        }
    });

    app.listen(3000, () => console.log('Server running on port 3000'));
}

startServer();