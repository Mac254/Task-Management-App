const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

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
            console.log('No token provided');
            return res.status(401).json({ message: 'No token provided' });
        }

        const token = authHeader.split(' ')[1];
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            req.user = decoded;
            next();
        } catch (error) {
            console.error('Token verification failed:', error.message);
            res.status(401).json({ message: 'Invalid or expired token' });
        }
    };

    // Helper function to detect circular dependencies
    async function hasCircularDependency(taskId, prerequisiteId, visited = new Set()) {
        if (visited.has(prerequisiteId)) return true;
        visited.add(prerequisiteId);
        const [rows] = await db.execute(
            'SELECT prerequisite_task_id FROM task_dependencies WHERE task_id = ?',
            [prerequisiteId]
        );
        for (const row of rows) {
            if (row.prerequisite_task_id === taskId || await hasCircularDependency(taskId, row.prerequisite_task_id, new Set(visited))) {
                return true;
            }
        }
        return false;
    }

    // Signup
    app.post('/signup', async (req, res) => {
        const { email, password } = req.body;
        console.log('Signup request for email:', email);
        try {
            const [rows] = await db.execute('SELECT * FROM users WHERE email = ?', [email]);
            if (rows.length > 0) {
                console.log('Email already exists:', email);
                return res.status(400).json({ message: 'Email already exists' });
            }

            const hashedPassword = await bcrypt.hash(password, 10);
            const [result] = await db.execute('INSERT INTO users (email, password) VALUES (?, ?)', [email, hashedPassword]);
            await db.execute('INSERT INTO user_stats (user_id, points, total_tasks, weekly_streaks, current_week_tasks) VALUES (?, 0, 0, 0, 0)', [result.insertId]);
            console.log('User created:', email);
            res.status(201).json({ message: 'User created' });
        } catch (error) {
            console.error('Signup error:', error);
            res.status(500).json({ message: 'Server error' });
        }
    });

    // Login
    app.post('/login', async (req, res) => {
        const { email, password } = req.body;
        console.log('Login request for email:', email);
        try {
            const [rows] = await db.execute('SELECT * FROM users WHERE email = ?', [email]);
            if (rows.length === 0) {
                console.log('Invalid email:', email);
                return res.status(401).json({ message: 'Invalid email or password' });
            }

            const user = rows[0];
            const match = await bcrypt.compare(password, user.password);
            if (!match) {
                console.log('Invalid password for email:', email);
                return res.status(401).json({ message: 'Invalid email or password' });
            }

            const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '1h' });
            console.log('Login successful, token generated');
            res.status(200).json({ message: 'Login successful', token });
        } catch (error) {
            console.error('Login error:', error);
            res.status(500).json({ message: 'Server error' });
        }
    });

    // Dashboard
    app.get('/dashboard', authenticateToken, async (req, res) => {
        console.log('Dashboard request for user:', req.user.email);
        res.status(200).json({ email: req.user.email });
    });

    // Get all tasks for user
    app.get('/tasks', authenticateToken, async (req, res) => {
        try {
            const tag = req.query.tag;
            let query = 'SELECT t.*, GROUP_CONCAT(DISTINCT d.prerequisite_task_id) as prerequisite_ids FROM tasks t LEFT JOIN task_dependencies d ON t.id = d.task_id WHERE t.user_id = ?';
            let params = [req.user.userId];
            if (tag) {
                query += ' AND t.tags LIKE ?';
                params.push(`%${tag}%`);
            }
            query += ' GROUP BY t.id';
            console.log('Fetching tasks for user:', req.user.userId, 'with query:', query, 'params:', params);
            const [rows] = await db.execute(query, params);
            const tasks = await Promise.all(rows.map(async task => {
                let prerequisitesDependencyStatus = task.prerequisite_ids ? task.prerequisite_ids.split(',').map(id => parseInt(id)) : [];
                let dependencies = [];
                if (task.prerequisite_ids) {
                    const [depRows] = await db.execute(
                        'SELECT id, title FROM tasks WHERE id IN (?) AND user_id = ?',
                        [prerequisitesDependencyStatus, req.user.userId]
                    );
                    dependencies = depRows;
                }
                return { ...task, dependencies };
            }));
            console.log('Tasks fetched:', tasks);
            res.status(200).json(tasks);
        } catch (error) {
            console.error('Error fetching tasks:', error);
            res.status(500).json({ message: 'Server error' });
        }
    });

    // Get unique tags
    app.get('/tags', authenticateToken, async (req, res) => {
        try {
            console.log('Fetching tags for user:', req.user.userId);
            const [rows] = await db.execute('SELECT tags FROM tasks WHERE user_id = ?', [req.user.userId]);
            const tags = [...new Set(rows.flatMap(row => (row.tags || '').split(',').filter(tag => tag)))];
            console.log('Tags fetched:', tags);
            res.status(200).json(tags);
        } catch (error) {
            console.error('Error fetching tags:', error);
            res.status(500).json({ message: 'Server error' });
        }
    });

    // Get heatmap data
    app.get('/heatmap', authenticateToken, async (req, res) => {
        try {
            console.log('Fetching heatmap data for user:', req.user.userId);
            const [rows] = await db.execute(
                'SELECT DATE(completed_at) as date, COUNT(*) as count FROM tasks WHERE user_id = ? AND status = ? AND completed_at IS NOT NULL GROUP BY DATE(completed_at)',
                [req.user.userId, 'completed']
            );
            const heatmapData = {};
            rows.forEach(row => {
                heatmapData[row.date] = row.count;
            });
            console.log('Heatmap data fetched:', heatmapData);
            res.status(200).json(heatmapData);
        } catch (error) {
            console.error('Error fetching heatmap data:', error);
            res.status(500).json({ message: 'Server error' });
        }
    });

    // Create a task
    app.post('/tasks', authenticateToken, async (req, res) => {
        const { title, description, deadline, tags, dependencies } = req.body;
        console.log('Creating task for user:', req.user.userId, 'with data:', { title, description, deadline, tags, dependencies });
        if (!title || !description) {
            console.log('Validation failed: Title or description missing');
            return res.status(400).json({ message: 'Title and description are required' });
        }

        // Validate deadline
        let validatedDeadline = null;
        if (deadline && !isNaN(new Date(deadline).getTime())) {
            validatedDeadline = deadline;
        } else if (deadline) {
            console.log('Invalid deadline format:', deadline);
            return res.status(400).json({ message: 'Invalid deadline format' });
        }

        // Validate tags
        const validatedTags = tags && tags.trim() !== '' ? tags : '';

        // Validate dependencies
        const validatedDependencies = Array.isArray(dependencies) ? dependencies.map(id => parseInt(id)).filter(id => !isNaN(id)) : [];
        const dependencyStatus = validatedDependencies.length > 0 ? 'blocked' : 'unblocked';

        // Simple priority logic: High if deadline is within 2 days, else Medium or Low
        let priority = 'low';
        if (validatedDeadline) {
            const deadlineDate = new Date(validatedDeadline);
            const now = new Date();
            const daysUntil = (deadlineDate - now) / (1000 * 60 * 60 * 24);
            if (daysUntil <= 2) priority = 'high';
            else if (daysUntil <= 7) priority = 'medium';
        }

        try {
            // Start transaction
            await db.execute('START TRANSACTION');

            // Insert task
            const [result] = await db.execute(
                'INSERT INTO tasks (user_id, title, description, status, deadline, priority, tags, dependency_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [req.user.userId, title, description, 'pending', validatedDeadline, priority, validatedTags, dependencyStatus]
            );
            const taskId = result.insertId;

            // Validate and insert dependencies
            for (const prereqId of validatedDependencies) {
                if (prereqId === taskId) {
                    await db.execute('ROLLBACK');
                    console.log('Validation failed: Task cannot depend on itself');
                    return res.status(400).json({ message: 'Task cannot depend on itself' });
                }
                const [prereqRows] = await db.execute('SELECT status FROM tasks WHERE id = ? AND user_id = ?', [prereqId, req.user.userId]);
                if (prereqRows.length === 0) {
                    await db.execute('ROLLBACK');
                    console.log('Validation failed: Invalid prerequisite task ID:', prereqId);
                    return res.status(400).json({ message: 'Invalid prerequisite task ID' });
                }
                if (prereqRows[0].status === 'completed') {
                    await db.execute('ROLLBACK');
                    console.log('Validation failed: Prerequisite task is already completed:', prereqId);
                    return res.status(400).json({ message: 'Prerequisite task is already completed' });
                }
                if (await hasCircularDependency(taskId, prereqId)) {
                    await db.execute('ROLLBACK');
                    console.log('Validation failed: Circular dependency detected');
                    return res.status(400).json({ message: 'Circular dependency detected' });
                }
                await db.execute(
                    'INSERT INTO task_dependencies (task_id, prerequisite_task_id) VALUES (?, ?)',
                    [taskId, prereqId]
                );
            }

            // Update user stats
            await db.execute('UPDATE user_stats SET points = points + 10, total_tasks = total_tasks + 1 WHERE user_id = ?', [req.user.userId]);

            // Commit transaction
            await db.execute('COMMIT');

            console.log('Task created, ID:', taskId);
            const [newTask] = await db.execute('SELECT * FROM tasks WHERE id = ?', [taskId]);
            console.log('Returning new task:', newTask[0]);
            res.status(201).json({ message: 'Task created', task: newTask[0] });
        } catch (error) {
            await db.execute('ROLLBACK');
            console.error('Error creating task:', error);
            res.status(500).json({ message: 'Server error: ' + error.message });
        }
    });

    // Update task status
    app.put('/tasks/:id', authenticateToken, async (req, res) => {
        const { id } = req.params;
        const { status } = req.body;
        console.log('Updating task:', id, 'for user:', req.user.userId);
        if (!status || !['pending', 'completed'].includes(status)) {
            console.log('Validation failed: Invalid status');
            return res.status(400).json({ message: 'Invalid status' });
        }

        try {
            await db.execute('START TRANSACTION');

            // Check if task is blocked
            const [taskRows] = await db.execute('SELECT dependency_status FROM tasks WHERE id = ? AND user_id = ?', [id, req.user.userId]);
            if (taskRows.length === 0) {
                await db.execute('ROLLBACK');
                console.log('Task not found or unauthorized');
                return res.status(404).json({ message: 'Task not found or unauthorized' });
            }
            if (status === 'completed' && taskRows[0].dependency_status === 'blocked') {
                await db.execute('ROLLBACK');
                console.log('Validation failed: Task is blocked by dependencies');
                return res.status(400).json({ message: 'Task is blocked by dependencies' });
            }

            // Update task status
            const completedAt = status === 'completed' ? new Date().toISOString().slice(0, 19).replace('T', ' ') : null;
            const [result] = await db.execute(
                'UPDATE tasks SET status = ?, completed_at = ? WHERE id = ? AND user_id = ?',
                [status, completedAt, id, req.user.userId]
            );
            if (result.affectedRows === 0) {
                await db.execute('ROLLBACK');
                console.log('Task not found or unauthorized');
                return res.status(404).json({ message: 'Task not found or unauthorized' });
            }

            let unblockedTasks = [];
            if (status === 'completed') {
                // Update user stats
                const [stats] = await db.execute('SELECT * FROM user_stats WHERE user_id = ?', [req.user.userId]);
                let points = stats[0].points + 10;
                let totalTasks = stats[0].total_tasks;
                let weeklyStreaks = stats[0].weekly_streaks;
                let currentWeekTasks = stats[0].current_week_tasks + 1;
                let bonusPoints = 0;
                let newBadges = [];

                // Check badges
                if (totalTasks === 0) newBadges.push('First Task');
                if (totalTasks + 1 >= 10 && !stats[0].badges.includes('Task Master')) newBadges.push('Task Master');
                if (currentWeekTasks >= 5) {
                    bonusPoints = 50;
                    points += bonusPoints;
                    weeklyStreaks += 1;
                    currentWeekTasks = 0;
                    if (weeklyStreaks >= 3 && !stats[0].badges.includes('Consistency King')) newBadges.push('Consistency King');
                }

                const updatedBadges = [...new Set([...stats[0].badges.split(',').filter(b => b), ...newBadges])].join(',');
                await db.execute(
                    'UPDATE user_stats SET points = ?, total_tasks = ?, weekly_streaks = ?, current_week_tasks = ?, badges = ? WHERE user_id = ?',
                    [points, totalTasks + 1, weeklyStreaks, currentWeekTasks, updatedBadges, req.user.userId]
                );

                // Check for tasks that can be unblocked
                const [depRows] = await db.execute(
                    'SELECT td.task_id, t.title FROM task_dependencies td JOIN tasks t ON td.task_id = t.id WHERE td.prerequisite_task_id = ? AND t.user_id = ?',
                    [id, req.user.userId]
                );
                for (const dep of depRows) {
                    const [prereqRows] = await db.execute(
                        'SELECT COUNT(*) as count FROM task_dependencies td JOIN tasks t ON td.prerequisite_task_id = t.id WHERE td.task_id = ? AND t.status != ?',
                        [dep.task_id, 'completed']
                    );
                    if (prereqRows[0].count === 0) {
                        await db.execute('UPDATE tasks SET dependency_status = ? WHERE id = ?', ['unblocked', dep.task_id]);
                        unblockedTasks.push(dep.title);
                    }
                }
            }

            await db.execute('COMMIT');
            console.log('Task updated:', id, 'Unblocked tasks:', unblockedTasks);
            res.status(200).json({ message: 'Task updated', unblockedTasks });
        } catch (error) {
            await db.execute('ROLLBACK');
            console.error('Error updating task:', error);
            res.status(500).json({ message: 'Server error' });
        }
    });

    // Delete a task
    app.delete('/tasks/:id', authenticateToken, async (req, res) => {
        const { id } = req.params;
        console.log('Deleting task:', id, 'for user:', req.user.userId);
        try {
            await db.execute('START TRANSACTION');

            // Check if task is a prerequisite
            const [depRows] = await db.execute('SELECT task_id FROM task_dependencies WHERE prerequisite_task_id = ?', [id]);
            if (depRows.length > 0) {
                await db.execute('ROLLBACK');
                console.log('Validation failed: Task is a prerequisite for other tasks');
                return res.status(400).json({ message: 'Cannot delete task that other tasks depend on' });
            }

            // Delete task
            const [result] = await db.execute('DELETE FROM tasks WHERE id = ? AND user_id = ?', [id, req.user.userId]);
            if (result.affectedRows === 0) {
                await db.execute('ROLLBACK');
                console.log('Task not found or unauthorized');
                return res.status(404).json({ message: 'Task not found or unauthorized' });
            }

            // Delete associated dependencies
            await db.execute('DELETE FROM task_dependencies WHERE task_id = ?', [id]);
            await db.execute('UPDATE user_stats SET total_tasks = total_tasks - 1 WHERE user_id = ?', [req.user.userId]);

            await db.execute('COMMIT');
            console.log('Task deleted:', id);
            res.status(200).json({ message: 'Task deleted' });
        } catch (error) {
            await db.execute('ROLLBACK');
            console.error('Error deleting task:', error);
            res.status(500).json({ message: 'Server error' });
        }
    });

    // Get user stats
    app.get('/stats', authenticateToken, async (req, res) => {
        try {
            console.log('Fetching stats for user ID:', req.user.userId);
            const [rows] = await db.execute('SELECT points, total_tasks, weekly_streaks, current_week_tasks, badges FROM user_stats WHERE user_id = ?', [req.user.userId]);
            if (rows.length === 0) {
                console.log('No stats found for user:', req.user.userId);
                return res.status(404).json({ message: 'User stats not found' });
            }
            const stats = rows[0];
            stats.badges = stats.badges ? stats.badges.split(',').filter(b => b) : [];
            stats.newBadges = [];
            stats.bonusPoints = 0;
            console.log('Stats fetched successfully:', stats);
            res.status(200).json(stats);
        } catch (error) {
            console.error('Error fetching stats for user:', req.user.userId, 'Error:', error.message);
            res.status(500).json({ message: 'Server error: ' + error.message });
        }
    });

    app.listen(3000, () => console.log('Server running on port 3000'));
}

startServer();