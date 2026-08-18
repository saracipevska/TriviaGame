'use strict';

const NAME_KEY = 'trivia_player_name';
let playerName = localStorage.getItem(NAME_KEY) || '';
let hasBuzzed = false;
let pollTimer = null;

function showScreen(id) {
    document.querySelectorAll('.b-screen').forEach(el => el.classList.remove('active'));
    document.getElementById(id).classList.add('active');
}

function escHtml(str) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(String(str)));
    return div.innerHTML;
}

function enterBuzzerScreen() {
    document.getElementById('player-name-label').textContent = playerName;
    showScreen('screen-buzzer');
    resetBuzzButton();
    startPolling();
}

function joinGame() {
    const input = document.getElementById('name-input');
    const name = input.value.trim();
    if (!name) {
        input.focus();
        return;
    }
    playerName = name;
    localStorage.setItem(NAME_KEY, playerName);
    enterBuzzerScreen();
}

function changeName() {
    stopPolling();
    localStorage.removeItem(NAME_KEY);
    playerName = '';
    hasBuzzed = false;
    const input = document.getElementById('name-input');
    input.value = '';
    showScreen('screen-name');
    input.focus();
}

function resetBuzzButton() {
    hasBuzzed = false;
    const btn = document.getElementById('btn-buzz');
    btn.disabled = false;
    const status = document.getElementById('buzz-status');
    status.textContent = 'Tap the button when your team needs help!';
    status.classList.remove('waiting');
}

async function buzzIn() {
    if (hasBuzzed) return;
    const btn = document.getElementById('btn-buzz');
    const status = document.getElementById('buzz-status');
    hasBuzzed = true;
    btn.disabled = true;
    status.textContent = 'Buzzing in\u2026';
    status.classList.add('waiting');

    try {
        const res = await fetch('/api/buzz', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: playerName }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
            throw new Error(data.error || 'Failed to buzz in');
        }
        status.textContent = `You're #${data.position} in the queue!`;
        status.classList.remove('waiting');
    } catch (e) {
        hasBuzzed = false;
        btn.disabled = false;
        status.textContent = 'Could not reach the server \u2014 try again.';
        status.classList.add('waiting');
    }
}

function renderQueue(names) {
    const list = document.getElementById('queue-list');
    if (names.length === 0) {
        list.innerHTML = '<li class="b-queue-empty">No one has buzzed in yet.</li>';
        return;
    }
    list.innerHTML = names.map((n, i) => `
        <li><span class="b-rank">${i + 1}.</span> ${escHtml(n)}</li>
    `).join('');
}

async function pollQueue() {
    try {
        const res = await fetch('/api/buzz/queue');
        if (!res.ok) return;
        const data = await res.json();
        const names = data.queue || [];
        renderQueue(names);

        // If we had buzzed in but the host reset the queue, re-enable the button
        if (hasBuzzed && !names.includes(playerName)) {
            resetBuzzButton();
        }
    } catch (e) {
        // Silently ignore network hiccups; will retry on next tick
    }
}

function startPolling() {
    stopPolling();
    pollQueue();
    pollTimer = setInterval(pollQueue, 1000);
}

function stopPolling() {
    if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btn-join').addEventListener('click', joinGame);
    document.getElementById('name-input').addEventListener('keydown', e => {
        if (e.key === 'Enter') joinGame();
    });
    document.getElementById('btn-buzz').addEventListener('click', buzzIn);
    document.getElementById('btn-change-name').addEventListener('click', changeName);

    if (playerName) {
        enterBuzzerScreen();
    } else {
        showScreen('screen-name');
        document.getElementById('name-input').focus();
    }
});
