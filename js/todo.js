const input = document.getElementById('input');
const button = document.getElementById('new-task');
const tasksList = document.getElementById('list');

button.addEventListener('click', () => {
    const taskText = input.value.trim();
    if (taskText !== '') {
        const listItem = document.createElement('button');
        listItem.className = 'task';
        listItem.textContent = taskText;
        tasksList.appendChild(listItem);
        input.value = '';
    }
});

// Event delegation: clic sui task rimossi
tasksList.addEventListener('click', (e) => {
    if (e.target && e.target.classList.contains('task')) {
        tasksList.removeChild(e.target);
    }
});

input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        button.click();
    }
});
