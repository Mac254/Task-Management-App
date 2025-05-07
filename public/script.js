function toggleForm() {
    const loginForm = document.getElementById('loginForm');
    const signupForm = document.getElementById('signupForm');
    loginForm.classList.toggle('hidden');
    signupForm.classList.toggle('hidden');
    document.getElementById('loginError').classList.add('hidden');
    document.getElementById('signupError').classList.add('hidden');
}

async function handleLogin(event) {
    event.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const errorElement = document.getElementById('loginError');

    try {
        const response = await fetch('http://localhost:3000/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await response.json();
        if (response.ok) {
            localStorage.setItem('token', data.token);
            window.location.href = 'dashboard.html';
        } else {
            errorElement.textContent = data.message || 'Login failed';
            errorElement.classList.remove('hidden');
        }
    } catch (error) {
        errorElement.textContent = 'An error occurred. Please try again.';
        errorElement.classList.remove('hidden');
    }
}

async function handleSignup(event) {
    event.preventDefault();
    const email = document.getElementById('signupEmail').value;
    const password = document.getElementById('signupPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    const errorElement = document.getElementById('signupError');

    if (password !== confirmPassword) {
        errorElement.textContent = 'Passwords do not match';
        errorElement.classList.remove('hidden');
        return;
    }

    try {
        const response = await fetch('http://localhost:3000/signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await response.json();
        if (response.ok) {
            alert('Signup successful! Please login.');
            toggleForm();
        } else {
            errorElement.textContent = data.message || 'Signup failed';
            errorElement.classList.remove('hidden');
        }
    } catch (error) {
        errorElement.textContent = 'An error occurred. Please try again.';
        errorElement.classList.remove('hidden');
    }
}

// Dashboard page logic
async function loadDashboard() {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = 'index.html';
        return;
    }

    try {
        const response = await fetch('http://localhost:3000/dashboard', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        if (response.ok) {
            document.getElementById('userEmail').textContent = data.email;
            loadTasks();
        } else {
            localStorage.removeItem('token');
            window.location.href = 'index.html';
        }
    } catch (error) {
        localStorage.removeItem('token');
        window.location.href = 'index.html';
    }
}

async function loadTasks() {
    const token = localStorage.getItem('token');
    try {
        const response = await fetch('http://localhost:3000/tasks', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const tasks = await response.json();
        const taskList = document.getElementById('taskList');
        taskList.innerHTML = '';
        tasks.forEach(task => {
            const taskCard = document.createElement('div');
            taskCard.className = 'task-card';
            taskCard.innerHTML = `
                <h3 class="text-lg font-semibold">${task.title}</h3>
                <p>${task.description}</p>
                <p>Status: ${task.status}</p>
                <button class="bg-green-500 text-white px-2 py-1 rounded hover:bg-green-600" onclick="toggleTaskStatus(${task.id}, '${task.status}')">
                    ${task.status === 'pending' ? 'Mark as Completed' : 'Mark as Pending'}
                </button>
                <button class="bg-red-500 text-white px-2 py-1 rounded hover:bg-red-600" onclick="deleteTask(${task.id})">Delete</button>
            `;
            taskList.appendChild(taskCard);
        });
    } catch (error) {
        console.error('Error loading tasks:', error);
    }
}

async function handleAddTask(event) {
    event.preventDefault();
    const title = document.getElementById('taskTitle').value;
    const description = document.getElementById('taskDescription').value;
    const token = localStorage.getItem('token');

    try {
        const response = await fetch('http://localhost:3000/tasks', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ title, description })
        });
        if (response.ok) {
            document.getElementById('taskForm').reset();
            loadTasks();
        } else {
            alert('Failed to add task');
        }
    } catch (error) {
        console.error('Error adding task:', error);
    }
}

async function toggleTaskStatus(taskId, currentStatus) {
    const newStatus = currentStatus === 'pending' ? 'completed' : 'pending';
    const token = localStorage.getItem('token');

    try {
        const response = await fetch(`http://localhost:3000/tasks/${taskId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ status: newStatus })
        });
        if (response.ok) {
            loadTasks();
        } else {
            alert('Failed to update task');
        }
    } catch (error) {
        console.error('Error updating task:', error);
    }
}

async function deleteTask(taskId) {
    const token = localStorage.getItem('token');

    try {
        const response = await fetch(`http://localhost:3000/tasks/${taskId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
            loadTasks();
        } else {
            alert('Failed to delete task');
        }
    } catch (error) {
        console.error('Error deleting task:', error);
    }
}

function handleLogout() {
    localStorage.removeItem('token');
    window.location.href = 'index.html';
}