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
        console.log('Attempting login with email:', email);
        const response = await fetch('http://localhost:3000/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await response.json();
        console.log('Login response:', data);
        if (response.ok) {
            localStorage.setItem('token', data.token);
            window.location.href = 'dashboard.html';
        } else {
            errorElement.textContent = data.message || 'Login failed';
            errorElement.classList.remove('hidden');
        }
    } catch (error) {
        console.error('Login error:', error);
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
        console.log('Attempting signup with email:', email);
        const response = await fetch('http://localhost:3000/signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await response.json();
        console.log('Signup response:', data);
        if (response.ok) {
            alert('Signup successful! Please login.');
            toggleForm();
        } else {
            errorElement.textContent = data.message || 'Signup failed';
            errorElement.classList.remove('hidden');
        }
    } catch (error) {
        console.error('Signup error:', error);
        errorElement.textContent = 'An error occurred. Please try again.';
        errorElement.classList.remove('hidden');
    }
}

// Dashboard page logic
async function loadDashboard() {
    const token = localStorage.getItem('token');
    console.log('Dashboard: Token retrieved:', token ? 'Present' : 'Missing');
    if (!token) {
        console.log('No token found, redirecting to index.html');
        window.location.href = 'index.html';
        return;
    }

    try {
        console.log('Fetching dashboard data');
        const response = await fetch('http://localhost:3000/dashboard', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        console.log('Dashboard response:', data);
        if (response.ok) {
            loadTasks();
            loadTagFilter();
            loadHeatmap();
            updateTaskStats();
            loadTaskDependencies();
        } else {
            console.log('Dashboard fetch failed:', data.message);
            localStorage.removeItem('token');
            window.location.href = 'index.html';
        }
    } catch (error) {
        console.error('Dashboard fetch error:', error);
        localStorage.removeItem('token');
        window.location.href = 'index.html';
    }
}

// Rewards page logic
async function loadRewards() {
    const token = localStorage.getItem('token');
    console.log('Rewards: Token retrieved:', token ? 'Present' : 'Missing');
    if (!token) {
        console.log('No token found, redirecting to index.html');
        showNotification('Session expired. Please log in again.');
        setTimeout(() => window.location.href = 'index.html', 2000);
        return;
    }

    try {
        console.log('Fetching user stats from http://localhost:3000/stats');
        const response = await fetch('http://localhost:3000/stats', {
            headers: { 'Authorization': `Bearer ${token}` },
            cache: 'no-cache'
        });
        console.log('Stats response status:', response.status);
        const data = await response.json();
        console.log('Stats response data:', data);
        if (response.ok) {
            document.getElementById('totalPoints').textContent = data.points;
            const badgeList = document.getElementById('badgeList');
            badgeList.innerHTML = '';
            const badges = [
                { name: 'First Task', icon: 'fa-star', condition: data.totalTasks >= 1 },
                { name: 'Task Master', icon: 'fa-crown', condition: data.totalTasks >= 10 },
                { name: 'Consistency King', icon: 'fa-trophy', condition: data.weeklyStreaks >= 3 }
            ];
            badges.forEach(badge => {
                const badgeCard = document.createElement('div');
                badgeCard.className = `badge-card ${badge.condition ? 'unlocked' : 'locked'}`;
                badgeCard.innerHTML = `
                    <i class="fas ${badge.icon} text-3xl text-yellow-500 mb-2"></i>
                    <h3 class="text-sm font-semibold text-gray-900">${badge.name}</h3>
                    <p class="text-xs text-gray-600">${badge.condition ? 'Unlocked!' : 'Locked'}</p>
                `;
                badgeList.appendChild(badgeCard);
            });
            document.getElementById('streakCount').textContent = data.currentWeekTasks;
            document.getElementById('streakProgress').style.width = `${(data.currentWeekTasks / 5) * 100}%`;
        } else {
            console.log('Stats fetch failed:', data.message);
            showNotification(`Failed to load rewards: ${data.message || 'Unknown error'}`);
            if (response.status === 401) {
                localStorage.removeItem('token');
                setTimeout(() => window.location.href = 'index.html', 2000);
            }
        }
    } catch (error) {
        console.error('Stats fetch error:', error.message);
        showNotification('Error loading rewards. Please try again.');
    }
}

async function loadTasks(filterTag = '') {
    const token = localStorage.getItem('token');
    try {
        console.log('Loading tasks, filter:', filterTag);
        const response = await fetch(`http://localhost:3000/tasks${filterTag ? `?tag=${encodeURIComponent(filterTag)}` : ''}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        const tasks = await response.json();
        console.log('Tasks loaded:', tasks);
        const taskList = document.getElementById('taskList');
        taskList.innerHTML = '';
        tasks.forEach(task => {
            console.log('Rendering task:', { id: task.id, title: task.title, deadline: task.deadline, tags: task.tags, dependency_status: task.dependency_status });
            const taskCard = document.createElement('div');
            taskCard.className = `task-card priority-${task.priority} ${task.dependency_status === 'blocked' ? 'blocked' : ''}`;
            const dependenciesHtml = task.dependencies && task.dependencies.length > 0
                ? `<div class="mt-1 flex items-center space-x-2">
                       <span class="text-sm font-medium text-gray-700">Dependencies:</span>
                       <span class="text-sm text-gray-900">${task.dependencies.map(dep => dep.title).join(', ')}</span>
                   </div>`
                : '';
            const blockedBadge = task.dependency_status === 'blocked'
                ? `<span class="blocked-badge"><i class="fas fa-lock mr-1"></i>Blocked</span>`
                : '';
            taskCard.innerHTML = `
                <h3 class="text-lg font-semibold text-gray-900">${task.title} ${blockedBadge}</h3>
                <p class="text-gray-600 text-sm mt-1">${task.description}</p>
                <div class="mt-2 flex items-center space-x-2">
                    <span class="text-sm font-medium text-gray-700">Status:</span>
                    <span class="text-sm ${task.status === 'completed' ? 'text-green-500' : 'text-yellow-500'}">${task.status}</span>
                </div>
                <div class="mt-1 flex items-center space-x-2">
                    <span class="text-sm font-medium text-gray-700">Deadline:</span>
                    <span class="text-sm text-gray-900">${task.deadline || 'None'}</span>
                </div>
                <div class="mt-1 flex items-center space-x-2">
                    <span class="text-sm font-medium text-gray-700">Tags:</span>
                    <span class="text-sm text-gray-900">${task.tags ? task.tags.split(',').map(tag => `<span class="inline-block bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full mr-1">${tag}</span>`).join('') : 'None'}</span>
                </div>
                <div class="mt-1 flex items-center space-x-2">
                    <span class="text-sm font-medium text-gray-700">Priority:</span>
                    <span class="text-sm capitalize text-gray-900">${task.priority}</span>
                </div>
                ${dependenciesHtml}
                <div class="mt-4 flex space-x-2">
                    <button class="bg-green-500 text-white px-3 py-1 rounded-md hover:bg-green-600 ${task.dependency_status === 'blocked' ? 'opacity-50 cursor-not-allowed' : ''}" 
                            onclick="${task.dependency_status === 'blocked' ? '' : `toggleTaskStatus(${task.id}, '${task.status}')`}" 
                            ${task.dependency_status === 'blocked' ? 'disabled' : ''}>
                        <i class="fas fa-check mr-1"></i> ${task.status === 'pending' ? 'Complete' : 'Undo'}
                    </button>
                    <button class="bg-red-500 text-white px-3 py-1 rounded-md hover:bg-red-600" onclick="deleteTask(${task.id})">
                        <i class="fas fa-trash mr-1"></i> Delete
                    </button>
                    <button class="bg-blue-500 text-white px-3 py-1 rounded-md hover:bg-blue-600 ${task.dependency_status === 'blocked' ? 'opacity-50 cursor-not-allowed' : ''}" 
                            onclick="${task.dependency_status === 'blocked' ? '' : `startFocusMode('${task.title}')`}" 
                            ${task.dependency_status === 'blocked' ? 'disabled' : ''}>
                        <i class="fas fa-clock mr-1"></i> Focus
                    </button>
                </div>
            `;
            taskList.appendChild(taskCard);
        });
        updateTaskStats();
    } catch (error) {
        console.error('Error loading tasks:', error.message);
        document.getElementById('taskList').innerHTML = '<p class="text-red-500 text-center">Failed to load tasks. Please try again.</p>';
    }
}

async function loadTagFilter() {
    const token = localStorage.getItem('token');
    try {
        console.log('Loading tag filter');
        const response = await fetch('http://localhost:3000/tags', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        const tags = await response.json();
        console.log('Tags loaded:', tags);
        const tagFilter = document.getElementById('tagFilter');
        tagFilter.innerHTML = '<option value="">All Tags</option>';
        tags.forEach(tag => {
            const option = document.createElement('option');
            option.value = tag;
            option.textContent = tag;
            tagFilter.appendChild(option);
        });
    } catch (error) {
        console.error('Error loading tags:', error.message);
        document.getElementById('tagFilter').innerHTML = '<option value="">No tags available</option>';
    }
}

async function loadTaskDependencies() {
    const token = localStorage.getItem('token');
    try {
        console.log('Loading tasks for dependencies dropdown');
        const response = await fetch('http://localhost:3000/tasks', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        const tasks = await response.json();
        console.log('Tasks for dependencies loaded:', tasks);
        const dependencySelect = document.getElementById('taskDependencies');
        dependencySelect.innerHTML = '';
        tasks.forEach(task => {
            if (task.status !== 'completed') {
                const option = document.createElement('option');
                option.value = task.id;
                option.textContent = task.title;
                dependencySelect.appendChild(option);
            }
        });
    } catch (error) {
        console.error('Error loading tasks for dependencies:', error.message);
        document.getElementById('taskDependencies').innerHTML = '<option value="">No tasks available</option>';
    }
}

async function loadHeatmap() {
    const token = localStorage.getItem('token');
    try {
        console.log('Loading heatmap data');
        const response = await fetch('http://localhost:3000/heatmap', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        const data = await response.json();
        console.log('Heatmap data:', data);

        const ctx = document.getElementById('heatmapCanvas').getContext('2d');
        const dates = [];
        const counts = [];
        const today = new Date();
        for (let i = 29; i >= 0; i--) {
            const date = new Date(today);
            date.setDate(today.getDate() - i);
            const dateStr = date.toISOString().split('T')[0];
            dates.push(dateStr);
            counts.push(data[dateStr] || 0);
        }

        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: dates,
                datasets: [{
                    label: 'Tasks Completed',
                    data: counts,
                    backgroundColor: counts.map(count => {
                        if (count === 0) return '#e5e7eb';
                        if (count <= 2) return '#6ee7b7';
                        if (count <= 5) return '#10b981';
                        return '#047857';
                    }),
                    borderColor: '#d1d5db',
                    borderWidth: 1
                }]
            },
            options: {
                scales: {
                    x: { display: true, title: { display: true, text: 'Date' } },
                    y: { display: true, title: { display: true, text: 'Tasks Completed' }, beginAtZero: true }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: { enabled: true }
                }
            }
        });
    } catch (error) {
        console.error('Error loading heatmap:', error.message);
        document.getElementById('heatmapSection').innerHTML = '<p class="text-red-500 text-center">Failed to load heatmap. Please try again.</p>';
    }
}

async function handleAddTask(event) {
    event.preventDefault();
    const title = document.getElementById('taskTitle').value.trim();
    const description = document.getElementById('taskDescription').value.trim();
    const deadline = document.getElementById('taskDeadline').value;
    const tagSelect = document.getElementById('taskTags');
    const tags = Array.from(tagSelect.selectedOptions).map(option => option.value).filter(tag => tag).join(',');
    const dependencySelect = document.getElementById('taskDependencies');
    const dependencies = Array.from(dependencySelect.selectedOptions).map(option => option.value).filter(id => id);
    const errorElement = document.getElementById('taskError');
    const successElement = document.getElementById('taskSuccess');

    // Reset messages
    errorElement.classList.add('hidden');
    successElement.classList.add('hidden');

    if (!title || !description) {
        errorElement.textContent = 'Title and description are required';
        errorElement.classList.remove('hidden');
        return;
    }

    const taskData = {
        title,
        description,
        deadline: deadline || null,
        tags: tags || '',
        dependencies
    };
    const token = localStorage.getItem('token');
    console.log('Adding task with data:', taskData);

    try {
        const response = await fetch('http://localhost:3000/tasks', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(taskData)
        });
        const data = await response.json();
        console.log('Task add response:', data);
        if (response.ok) {
            document.getElementById('taskForm').reset();
            document.getElementById('taskFormContainer').classList.add('hidden');
            successElement.textContent = 'Task added successfully!';
            successElement.classList.remove('hidden');
            setTimeout(() => successElement.classList.add('hidden'), 3000);
            loadTasks();
            loadTagFilter();
            loadTaskDependencies();
            showNotification('Task added! +10 points earned.');
        } else {
            errorElement.textContent = data.message || 'Failed to add task';
            errorElement.classList.remove('hidden');
        }
    } catch (error) {
        console.error('Error adding task:', error.message);
        errorElement.textContent = 'An error occurred. Please try again.';
        errorElement.classList.remove('hidden');
    }
}

async function toggleTaskStatus(taskId, currentStatus) {
    const newStatus = currentStatus === 'pending' ? 'completed' : 'pending';
    const token = localStorage.getItem('token');
    console.log('Toggling status for task:', taskId);

    try {
        const response = await fetch(`http://localhost:3000/tasks/${taskId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ status: newStatus })
        });
        const data = await response.json();
        console.log('Toggle status response:', data);
        if (response.ok) {
            loadTasks();
            loadHeatmap();
            loadTaskDependencies();
            if (newStatus === 'completed') {
                const statsResponse = await fetch('http://localhost:3000/stats', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const stats = await statsResponse.json();
                let message = 'Task completed! +10 points earned.';
                if (stats.newBadges.length > 0) {
                    message += ` New badge(s): ${stats.newBadges.join(', ')}!`;
                }
                if (stats.bonusPoints > 0) {
                    message += ` Weekly streak bonus: +${stats.bonusPoints} points!`;
                }
                if (data.unblockedTasks && data.unblockedTasks.length > 0) {
                    message += ` Unblocked: ${data.unblockedTasks.join(', ')}!`;
                }
                showNotification(message);
            }
        } else {
            alert('Failed to update task: ' + (data.message || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error updating task:', error.message);
        alert('An error occurred while updating task.');
    }
}

async function deleteTask(taskId) {
    const token = localStorage.getItem('token');
    console.log('Deleting task:', taskId);

    try {
        const response = await fetch(`http://localhost:3000/tasks/${taskId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        console.log('Delete task response:', data);
        if (response.ok) {
            loadTasks();
            loadHeatmap();
            loadTaskDependencies();
        } else {
            alert('Failed to delete task');
        }
    } catch (error) {
        console.error('Error deleting task:', error.message);
        alert('An error occurred while deleting task.');
    }
}

async function updateTaskStats() {
    const token = localStorage.getItem('token');
    try {
        const tasksResponse = await fetch('http://localhost:3000/tasks', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const tasks = await tasksResponse.json();
        const totalTasks = tasks.length;
        const completedTasks = tasks.filter(task => task.status === 'completed').length;
        document.getElementById('totalTasks').textContent = totalTasks;
        document.getElementById('completedTasks').textContent = completedTasks;

        const statsResponse = await fetch('http://localhost:3000/stats', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const stats = await statsResponse.json();
        document.getElementById('userPoints').textContent = stats.points;
    } catch (error) {
        console.error('Error updating task stats:', error);
    }
}

function handleLogout() {
    console.log('Logging out');
    localStorage.removeItem('token');
    window.location.href = 'index.html';
}

function handleTagFilterChange() {
    const tagFilter = document.getElementById('tagFilter').value;
    console.log('Filtering tasks by tag:', tagFilter);
    loadTasks(tagFilter);
}

function startFocusMode(taskTitle) {
    const modal = document.getElementById('pomodoroModal');
    const timerDisplay = document.getElementById('pomodoroTimer');
    const statusDisplay = document.getElementById('pomodoroStatus');
    const taskDisplay = document.getElementById('pomodoroTask');
    let timeLeft = 25 * 60; // 25 minutes in seconds
    let isWorkSession = true;
    let timerInterval;

    taskDisplay.textContent = `Task: ${taskTitle}`;
    statusDisplay.textContent = 'Work Session';
    modal.classList.remove('hidden');

    function updateTimer() {
        const minutes = Math.floor(timeLeft / 60);
        const seconds = timeLeft % 60;
        timerDisplay.textContent = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
        timeLeft--;

        if (timeLeft < 0) {
            isWorkSession = !isWorkSession;
            timeLeft = isWorkSession ? 25 * 60 : 5 * 60;
            statusDisplay.textContent = isWorkSession ? 'Work Session' : 'Break';
        }
    }

    timerInterval = setInterval(updateTimer, 1000);

    function closeModal() {
        modal.classList.add('hidden');
        clearInterval(timerInterval);
    }

    document.getElementById('pomodoroClose').onclick = closeModal;
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeModal();
    }, { once: true });
}

function showNotification(message) {
    const notification = document.getElementById('notification');
    const notificationMessage = document.getElementById('notificationMessage');
    notificationMessage.textContent = message;
    notification.classList.remove('hidden');
    setTimeout(() => {
        notification.classList.add('hidden');
    }, 5000);
}

function closeNotification() {
    document.getElementById('notification').classList.add('hidden');
}