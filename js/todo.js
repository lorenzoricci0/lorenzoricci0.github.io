const input = document.getElementById('input');
const button = document.getElementById('new-task');
const tasksList = document.getElementById('list');

// Carica le task salvate
window.addEventListener('DOMContentLoaded', () => {
    const saved = localStorage.getItem('tasks');
    if (saved) {
        tasksList.innerHTML = saved;
    }
});

button.addEventListener('click', () => {
    const taskText = input.value.trim();
    if (taskText !== '') {
        const listItem = document.createElement('button');
        listItem.className = 'task';
        listItem.textContent = taskText;
        tasksList.appendChild(listItem);
        localStorage.setItem('tasks', tasksList.innerHTML);
        input.value = '';
    }
});

// Event delegation: clic sui task rimossi
tasksList.addEventListener('click', (e) => {
    if (e.target && e.target.classList.contains('task')) {
        tasksList.removeChild(e.target);
        localStorage.setItem('tasks', tasksList.innerHTML);
    }
});

input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        button.click();
    }
});
