'use strict';

// ══════════════════════════════════════════════════════════
// Game State
// ══════════════════════════════════════════════════════════
const state = {
    /** All topics loaded from JSON: { topicName: [{question, answer}, ...] } */
    allTopics: {},
    /** Topic names for this game session (all topics from the loaded JSON) */
    selectedTopics: [],
    /** Topic name currently being viewed on the questions board */
    currentTopic: null,
    /** Index of the question currently open (0-based) */
    currentQIdx: null,
    /** Answered tracking: { topicName: boolean[] } */
    answered: {},
    /** Teams and their scores: { teamName: score } */
    teams: {},
};

// ══════════════════════════════════════════════════════════
// Timer State
// ══════════════════════════════════════════════════════════
let timerInterval = null;
let timerSeconds  = 0;

// ══════════════════════════════════════════════════════════
// Screen Navigation
// ══════════════════════════════════════════════════════════
function showScreen(id) {
    document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    // Scroll back to top on each screen transition
    document.getElementById(id).scrollTop = 0;
}

// ══════════════════════════════════════════════════════════
// SCREEN 1 — Setup Handlers
// ══════════════════════════════════════════════════════════

/** Load the default questions.json served by Flask */
async function loadDefault() {
    setStatus('Loading\u2026', 'neutral');
    try {
        const res = await fetch('/api/questions');
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            setStatus('Error: ' + (err.error || res.statusText), 'error');
            return;
        }
        const data = await res.json();
        onDataLoaded(data);
    } catch (e) {
        setStatus('Could not reach the server: ' + e.message, 'error');
    }
}

/** Read a user-selected local JSON file via FileReader */
function loadFile(file) {
    if (!file) return;
    setStatus('Reading file\u2026', 'neutral');
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            onDataLoaded(data);
        } catch (err) {
            setStatus('Invalid JSON file: ' + err.message, 'error');
        }
    };
    reader.onerror = () => setStatus('Failed to read the file.', 'error');
    reader.readAsText(file, 'UTF-8');
}

/**
 * Validate and store loaded data, then show topic checkboxes.
 * Expected JSON shape: { "topics": { "TopicName": [{question, answer}, ...] } }
 */
function onDataLoaded(data) {
    if (!data || typeof data.topics !== 'object' || Array.isArray(data.topics)) {
        setStatus('Invalid format \u2014 JSON must have a top-level "topics" object.', 'error');
        return;
    }
    const topicNames = Object.keys(data.topics);
    if (topicNames.length === 0) {
        setStatus('No topics found in the file.', 'error');
        return;
    }
    // Validate each topic has at least one question
    for (const name of topicNames) {
        const qs = data.topics[name];
        if (!Array.isArray(qs) || qs.length === 0) {
            setStatus(`Topic "${name}" has no questions. Please check the JSON.`, 'error');
            return;
        }
    }

    state.allTopics = data.topics;
    setStatus(
        `\u2714 Loaded ${topicNames.length} topic${topicNames.length !== 1 ? 's' : ''} successfully! Press Start Game to begin.`,
        'success'
    );
}

function setStatus(msg, type) {
    const el = document.getElementById('load-status');
    el.textContent = msg;
    el.className = 'load-status ' + type;
}

function startGame() {
    if (Object.keys(state.allTopics).length === 0) {
        alert('Please load a questions file first.');
        return;
    }
    // Use every topic present in the loaded JSON
    state.selectedTopics = Object.keys(state.allTopics);

    // Initialise answered tracking arrays
    state.answered = {};
    state.selectedTopics.forEach(topic => {
        state.answered[topic] = new Array(state.allTopics[topic].length).fill(false);
    });

    // Reset team scores to 0
    Object.keys(state.teams).forEach(name => { state.teams[name] = 0; });
    renderScoreboard();

    renderTopicsScreen();
    showScreen('screen-topics');
}

// ══════════════════════════════════════════════════════════
// SCREEN 2 — Topics Overview
// ══════════════════════════════════════════════════════════
function renderTopicsScreen() {
    const grid = document.getElementById('topics-grid');
    grid.innerHTML = '';

    state.selectedTopics.forEach(topic => {
        const answeredArr = state.answered[topic];
        const total   = answeredArr.length;
        const done    = answeredArr.filter(Boolean).length;
        const isComplete = done === total;

        const card = document.createElement('div');
        card.className = 'topic-card' + (isComplete ? ' topic-completed' : '');
        card.innerHTML = `
            <div class="tc-name">${escHtml(topic)}</div>
            <div class="tc-progress">${done} / ${total} answered</div>
            ${isComplete ? '<div class="tc-badge">Completed</div>' : ''}
        `;
        if (!isComplete) {
            card.addEventListener('click', () => openTopic(topic));
        }
        grid.appendChild(card);
    });
}

// ══════════════════════════════════════════════════════════
// Timer Functions
// ══════════════════════════════════════════════════════════
function startTimer(seconds, isInitial = false) {
    stopTimer();
    timerSeconds = seconds;
    updateTimerDisplay();
    document.getElementById('timer-section').classList.remove('hidden');
    document.getElementById('btn-plus5').classList.add('hidden');
    // Skip only shown for the initial 15-sec countdown
    const skipBtn = document.getElementById('btn-skip');
    if (isInitial) {
        skipBtn.classList.remove('hidden');
    } else {
        skipBtn.classList.add('hidden');
    }

    timerInterval = setInterval(() => {
        timerSeconds--;
        updateTimerDisplay();
        if (timerSeconds <= 0) {
            stopTimer();
            skipBtn.classList.add('hidden');
            document.getElementById('btn-plus5').classList.remove('hidden');
        }
    }, 1000);
}

function stopTimer() {
    clearInterval(timerInterval);
    timerInterval = null;
}

function updateTimerDisplay() {
    const el = document.getElementById('timer-display');
    el.textContent = timerSeconds;
    if (timerSeconds <= 5) {
        el.classList.add('timer-urgent');
    } else {
        el.classList.remove('timer-urgent');
    }
}

// ══════════════════════════════════════════════════════════
// SCREEN 3 — Questions Board
// ══════════════════════════════════════════════════════════
function openTopic(topic) {
    state.currentTopic = topic;
    document.getElementById('current-topic-name').textContent = topic;
    renderQuestionsBoard();
    showScreen('screen-questions');
}

function renderQuestionsBoard() {
    const topic    = state.currentTopic;
    const questions = state.allTopics[topic];
    const answered  = state.answered[topic];
    const grid = document.getElementById('questions-grid');
    grid.innerHTML = '';

    questions.forEach((_q, idx) => {
        const sq = document.createElement('div');
        sq.className = 'q-square' + (answered[idx] ? ' q-answered' : '');
        sq.textContent = idx + 1;
        if (!answered[idx]) {
            sq.addEventListener('click', () => openQuestion(idx));
        }
        grid.appendChild(sq);
    });
}

// ══════════════════════════════════════════════════════════
// SCREEN 4 — Single Question View
// ══════════════════════════════════════════════════════════
function openQuestion(idx) {
    state.currentQIdx = idx;
    const q = state.allTopics[state.currentTopic][idx];

    document.getElementById('q-topic-label').textContent  = state.currentTopic;
    document.getElementById('q-number-label').textContent = `Question ${idx + 1}`;
    document.getElementById('q-text').textContent = q.question;
    document.getElementById('a-text').textContent = q.answer;

    // Reset view: answer hidden, Finish hidden, Reveal visible
    document.getElementById('answer-section').classList.add('hidden');
    document.getElementById('btn-reveal-answer').classList.remove('hidden');
    document.getElementById('btn-finish').classList.add('hidden');
    document.getElementById('timer-section').classList.add('hidden');
    document.getElementById('btn-plus5').classList.add('hidden');

    // Fresh buzzer queue for each new question
    clearBuzzerQueue();

    showScreen('screen-question');
    startTimer(15, true);
}

function revealAnswer() {
    stopTimer();
    // Hide timer UI when answer is revealed
    document.getElementById('timer-section').classList.add('hidden');

    // Show the answer with its fade-in animation
    const section = document.getElementById('answer-section');
    section.classList.remove('hidden');
    // Re-trigger CSS animation by cloning the element
    section.style.animation = 'none';
    // Force reflow
    void section.offsetWidth;
    section.style.animation = '';

    document.getElementById('btn-reveal-answer').classList.add('hidden');
    document.getElementById('btn-finish').classList.remove('hidden');
}

/** Mark question as answered — opens award modal if teams are active */
function finishQuestion() {
    stopTimer();
    if (Object.keys(state.teams).length > 0) {
        openAwardModal();
    } else {
        doFinishQuestion();
    }
}

function doFinishQuestion() {
    state.answered[state.currentTopic][state.currentQIdx] = true;
    renderQuestionsBoard();
    showScreen('screen-questions');
}

/** Go back to the questions board WITHOUT marking the question answered */
function backToQuestionsBoard() {
    stopTimer();
    renderQuestionsBoard();
    showScreen('screen-questions');
}

// ══════════════════════════════════════════════════════════
// Teams & Scoreboard
// ══════════════════════════════════════════════════════════
function openTeamsModal() {
    renderTeamsList();
    document.getElementById('modal-teams').classList.remove('hidden');
    document.getElementById('team-name-input').value = '';
    document.getElementById('team-name-input').focus();
}

function closeTeamsModal() {
    document.getElementById('modal-teams').classList.add('hidden');
}

function addTeam() {
    const input = document.getElementById('team-name-input');
    const name = input.value.trim();
    if (!name) return;
    if (Object.prototype.hasOwnProperty.call(state.teams, name)) {
        input.select();
        return;
    }
    state.teams[name] = 0;
    input.value = '';
    input.focus();
    renderTeamsList();
    renderScoreboard();
}

function removeTeam(name) {
    delete state.teams[name];
    renderTeamsList();
    renderScoreboard();
}

function renderTeamsList() {
    const list = document.getElementById('teams-list');
    const names = Object.keys(state.teams);
    if (names.length === 0) {
        list.innerHTML = '<p class="teams-empty">No teams added yet.</p>';
        return;
    }
    list.innerHTML = names.map(n => `
        <div class="team-list-item">
            <span class="team-list-name">${escHtml(n)}</span>
            <button class="btn-remove-team" data-team="${escHtml(n)}">&#10005;</button>
        </div>
    `).join('');
    list.querySelectorAll('.btn-remove-team').forEach(btn => {
        btn.addEventListener('click', () => removeTeam(btn.dataset.team));
    });
}

function renderScoreboard() {
    const bar = document.getElementById('scoreboard-bar');
    const container = document.getElementById('scoreboard-teams');
    const names = Object.keys(state.teams);
    if (names.length === 0) {
        bar.classList.add('hidden');
        return;
    }
    bar.classList.remove('hidden');
    container.innerHTML = names.map(n => `
        <div class="score-entry">
            <span class="score-name">${escHtml(n)}</span>
            <span class="score-pts">${state.teams[n]}</span>
        </div>
    `).join('');
}

// ══════════════════════════════════════════════════════════
// Award Point Modal
// ══════════════════════════════════════════════════════════
function openAwardModal() {
    const btns = document.getElementById('award-teams-btns');
    const names = Object.keys(state.teams);
    btns.innerHTML = names.map(n => `
        <div class="award-team-row">
            <span class="award-team-name">${escHtml(n)}</span>
            <div class="award-team-actions">
                <button class="btn-award-minus" data-team="${escHtml(n)}" title="Deduct a point">&#8722;1</button>
                <button class="btn-award-team" data-team="${escHtml(n)}">+1</button>
            </div>
        </div>
    `).join('');
    btns.querySelectorAll('.btn-award-team').forEach(btn => {
        btn.addEventListener('click', () => awardPoint(btn.dataset.team, 1));
    });
    btns.querySelectorAll('.btn-award-minus').forEach(btn => {
        btn.addEventListener('click', () => awardPoint(btn.dataset.team, -1));
    });
    document.getElementById('modal-award').classList.remove('hidden');
}

function awardPoint(teamName, delta = 1) {
    if (teamName && Object.prototype.hasOwnProperty.call(state.teams, teamName)) {
        state.teams[teamName] += delta;
        renderScoreboard();
    }
}

/** Close the Award Point modal and mark the question as answered */
function closeAwardModal() {
    document.getElementById('modal-award').classList.add('hidden');
    doFinishQuestion();
}

// ══════════════════════════════════════════════════════════
// Buzzer Queue (players scan a QR code on their phones)
// ══════════════════════════════════════════════════════════
let buzzerPollTimer = null;

async function fetchBuzzerQueue() {
    try {
        const res = await fetch('/api/buzz/queue');
        if (!res.ok) return;
        const data = await res.json();
        renderBuzzerQueue(data.queue || []);
    } catch (e) {
        // Server may be briefly unreachable — ignore and retry on next tick
    }
}

function renderBuzzerQueue(names) {
    const list = document.getElementById('buzzer-queue-list');
    if (names.length === 0) {
        list.innerHTML = '<p class="buzzer-queue-empty">No one has buzzed in yet.</p>';
        return;
    }
    list.innerHTML = names.map((n, i) => `
        <div class="buzzer-queue-item${i === 0 ? ' bq-first' : ''}">
            <span class="bq-rank">${i + 1}.</span> ${escHtml(n)}
        </div>
    `).join('');
}

function startBuzzerPolling() {
    if (buzzerPollTimer) return;
    fetchBuzzerQueue();
    buzzerPollTimer = setInterval(fetchBuzzerQueue, 1000);
}

async function clearBuzzerQueue() {
    try {
        await fetch('/api/buzz/reset', { method: 'POST' });
    } catch (e) {
        // Ignore — next poll will just show whatever the server has
    }
    renderBuzzerQueue([]);
}

async function openQrModal() {
    document.getElementById('modal-qr').classList.remove('hidden');
    document.getElementById('qr-image').src = `/api/qr.png?t=${Date.now()}`;
    try {
        const res = await fetch('/api/join-info');
        const data = await res.json();
        document.getElementById('join-url-text').textContent = data.url || '';
    } catch (e) {
        document.getElementById('join-url-text').textContent = '';
    }
}

function closeQrModal() {
    document.getElementById('modal-qr').classList.add('hidden');
}

// ══════════════════════════════════════════════════════════
// Utility
// ══════════════════════════════════════════════════════════

/** Safe HTML escaping to prevent XSS from JSON data */
function escHtml(str) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(String(str)));
    return div.innerHTML;
}

// ══════════════════════════════════════════════════════════
// Wire up event listeners once DOM is ready
// ══════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {

    // ── Setup screen ─────────────────────────────────────
    document.getElementById('btn-load-default')
        .addEventListener('click', loadDefault);

    document.getElementById('file-input')
        .addEventListener('change', e => loadFile(e.target.files[0]));

    document.getElementById('btn-start-game')
        .addEventListener('click', startGame);

    // ── Topics screen ─────────────────────────────────────
    document.getElementById('btn-new-game')
        .addEventListener('click', () => showScreen('screen-setup'));

    // ── Questions board screen ────────────────────────────
    document.getElementById('btn-back-to-topics')
        .addEventListener('click', () => {
            renderTopicsScreen();   // refresh greyed-out topics if any completed
            showScreen('screen-topics');
        });

    // ── Question view screen ──────────────────────────────
    document.getElementById('btn-back-no-answer')
        .addEventListener('click', backToQuestionsBoard);

    document.getElementById('btn-reveal-answer')
        .addEventListener('click', revealAnswer);

    document.getElementById('btn-finish')
        .addEventListener('click', finishQuestion);

    // ── Teams & modals ────────────────────────────────────
    document.getElementById('btn-manage-teams')
        .addEventListener('click', openTeamsModal);

    document.getElementById('btn-teams-done')
        .addEventListener('click', closeTeamsModal);

    document.getElementById('btn-add-team')
        .addEventListener('click', addTeam);

    document.getElementById('team-name-input')
        .addEventListener('keydown', e => { if (e.key === 'Enter') addTeam(); });

    document.getElementById('modal-teams')
        .addEventListener('click', e => { if (e.target === document.getElementById('modal-teams')) closeTeamsModal(); });

    document.getElementById('btn-award-none')
        .addEventListener('click', closeAwardModal);

    document.getElementById('btn-award-finish')
        .addEventListener('click', closeAwardModal);

    document.getElementById('btn-reset-scores')
        .addEventListener('click', () => document.getElementById('modal-reset').classList.remove('hidden'));

    document.getElementById('btn-reset-cancel')
        .addEventListener('click', () => document.getElementById('modal-reset').classList.add('hidden'));

    document.getElementById('btn-reset-confirm')
        .addEventListener('click', () => {
            Object.keys(state.teams).forEach(name => { state.teams[name] = 0; });
            renderScoreboard();
            document.getElementById('modal-reset').classList.add('hidden');
        });

    document.getElementById('btn-plus5')
        .addEventListener('click', () => startTimer(5, false));

    document.getElementById('btn-skip')
        .addEventListener('click', () => {
            // Jump straight to 0 — triggers expiry on next tick
            stopTimer();
            timerSeconds = 0;
            updateTimerDisplay();
            document.getElementById('btn-skip').classList.add('hidden');
            document.getElementById('btn-plus5').classList.remove('hidden');
        });

    // ── Buzzer ────────────────────────────────────────────
    document.getElementById('btn-show-qr')
        .addEventListener('click', openQrModal);

    document.getElementById('btn-qr-close')
        .addEventListener('click', closeQrModal);

    document.getElementById('modal-qr')
        .addEventListener('click', e => { if (e.target === document.getElementById('modal-qr')) closeQrModal(); });

    document.getElementById('btn-clear-buzzer')
        .addEventListener('click', clearBuzzerQueue);

    startBuzzerPolling();
});
