import './style.css';
import { auth, db, loginWithGoogle, logout, handleFirestoreError, storage, rtdb, rtdbRef, rtdbSet, onValue, push, ref, uploadBytes, getDownloadURL, addDoc, updateDoc } from './firebase-config.js';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, getDocs, setDoc, serverTimestamp, collection, query, where, orderBy, limit, increment } from 'firebase/firestore';
import { GoogleGenAI } from "@google/genai";

// Initialize Gemini
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// App State
let currentUser = null;

// DOM Elements
const authNav = document.getElementById('auth-nav');
const heroSection = document.getElementById('hero');
const viewContainer = document.getElementById('view-container');
const modalOverlay = document.getElementById('modal-overlay');
const modalBody = document.getElementById('modal-body');
const modalClose = document.getElementById('modal-close');

// --- Initialization ---
function init() {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            currentUser = user;
            await syncUserProfile(user);
            updateAuthUI(true);
        } else {
            currentUser = null;
            updateAuthUI(false);
        }
    });

    setupEventListeners();
    handleRouting();
}

function handleRouting() {
    const params = new URLSearchParams(window.location.search);
    const quizId = params.get('quizId');
    if (quizId) {
        document.body.classList.add('quiz-only');
        loadQuizOnly(quizId);
    }
}

async function loadQuizOnly(quizId) {
    viewContainer.classList.remove('hidden');
    heroSection.classList.add('hidden');
    viewContainer.innerHTML = '<div class="flex justify-center py-24"><div class="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div></div>';
    
    try {
        const quizRef = doc(db, 'quizzes', quizId);
        const quizSnap = await getDoc(quizRef);
        if (quizSnap.exists()) {
            renderQuizPlay({ quizId, quizData: quizSnap.data() });
        } else {
            viewContainer.innerHTML = '<div class="text-center py-24"><h2 class="text-3xl font-display mb-4">Quiz Not Found</h2><button onclick="window.location.href=\'./\'" class="btn-primary">Go Home</button></div>';
        }
    } catch (error) {
        console.error(error);
        viewContainer.innerHTML = '<div class="text-center py-24"><h2 class="text-3xl font-display mb-4">Error Loading Quiz</h2></div>';
    }
}

// --- Auth Logic ---
async function syncUserProfile(user) {
    const userRef = doc(db, 'users', user.uid);
    try {
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) {
            await setDoc(userRef, {
                uid: user.uid,
                displayName: user.displayName,
                email: user.email,
                photoURL: user.photoURL,
                stats: {
                    quizzesTaken: 0,
                    totalScore: 0,
                    achievements: []
                },
                createdAt: serverTimestamp(),
                lastLogin: serverTimestamp()
            });
        } else {
            await setDoc(userRef, { lastLogin: serverTimestamp() }, { merge: true });
        }
    } catch (error) {
        handleFirestoreError(error, 'WRITE', `users/${user.uid}`);
    }
}

function updateAuthUI(isLoggedIn) {
    if (isLoggedIn) {
        authNav.innerHTML = `
            <div class="flex items-center gap-4">
                <div class="text-right hidden sm:block">
                    <p class="text-xs text-white/40 uppercase tracking-widest font-bold">Welcome back</p>
                    <p class="text-sm font-semibold">${currentUser.displayName}</p>
                </div>
                <button id="profile-btn" class="w-10 h-10 rounded-full border border-white/20 overflow-hidden hover:border-orange-500 transition-all">
                    <img src="${currentUser.photoURL}" alt="Profile" class="w-full h-full object-cover">
                </button>
                <button id="logout-btn" class="text-white/40 hover:text-white transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                </button>
            </div>
        `;
        document.getElementById('logout-btn').onclick = logout;
        document.getElementById('profile-btn').onclick = () => showView('profile');
    } else {
        authNav.innerHTML = `
            <button id="login-btn" class="text-sm font-medium hover:text-orange-500 transition-colors">Login</button>
            <button id="signup-btn" class="bg-white text-black px-5 py-2 rounded-full text-sm font-semibold hover:bg-orange-500 hover:text-white transition-all">Get Started</button>
        `;
        document.getElementById('login-btn').onclick = loginWithGoogle;
        document.getElementById('signup-btn').onclick = loginWithGoogle;
    }
}

// --- Routing / View Management ---
function showView(viewName, data = {}) {
    heroSection.classList.add('hidden');
    viewContainer.classList.remove('hidden');
    viewContainer.innerHTML = '<div class="flex justify-center py-24"><div class="w-12 h-12 border-4 border-orange-600 border-t-transparent rounded-full animate-spin"></div></div>';

    switch(viewName) {
        case 'home':
            renderHome();
            break;
        case 'profile':
            renderProfile();
            break;
        case 'generate':
            renderGenerate();
            break;
        case 'multiplayer':
            renderMultiplayer();
            break;
        case 'quiz-ready':
            renderQuizReady(data);
            break;
        case 'quiz-play':
            renderQuizPlay(data);
            break;
        case 'quiz-results':
            renderQuizResults(data);
            break;
        case 'leaderboard':
            renderLeaderboard();
            break;
        default:
            renderHome();
    }
    lucide.createIcons();
}

function renderQuizReady({ quizId, quizData }) {
    viewContainer.innerHTML = `
        <div class="animate-fade-in max-w-2xl mx-auto text-center">
            <div class="w-24 h-24 bg-primary/10 rounded-3xl flex items-center justify-center mx-auto mb-8 rotate-3">
                <svg class="text-primary" xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="m9 12 2 2 4-4"/></svg>
            </div>
            <h2 class="text-5xl font-display mb-4">${quizData.title}</h2>
            <p class="text-white/60 mb-12">${quizData.description}</p>
            
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-12">
                <div class="glass">
                    <p class="text-xs uppercase tracking-widest text-white/30 font-bold mb-1">Questions</p>
                    <p class="text-2xl font-semibold">${quizData.questions.length}</p>
                </div>
                <div class="glass">
                    <p class="text-xs uppercase tracking-widest text-white/30 font-bold mb-1">Difficulty</p>
                    <p class="text-2xl font-semibold uppercase">${quizData.difficulty || 'Adaptive'}</p>
                </div>
            </div>

            <div class="flex flex-col gap-4">
                <button id="start-quiz" class="btn-generate">
                    Start Learning Session
                </button>
                <div class="flex gap-4">
                    <button id="share-link" class="btn-outline flex-grow flex items-center justify-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
                        Copy Link
                    </button>
                    <button id="share-qr" class="btn-outline px-6">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="5" height="5" x="3" y="3" rx="1"/><rect width="5" height="5" x="16" y="3" rx="1"/><rect width="5" height="5" x="3" y="16" rx="1"/><path d="M21 16h-3a2 2 0 0 0-2 2v3"/><path d="M21 21v-4"/><path d="M11 3h2"/><path d="M11 8h2"/><path d="M3 11v2"/><path d="M8 11v2"/><path d="M11 11h2"/><path d="M11 16h2"/><path d="M16 11h2"/><path d="M16 16h2"/><path d="M16 21h2"/><path d="M21 11h2"/></svg>
                    </button>
                </div>
            </div>
        </div>
    `;

    document.getElementById('start-quiz').onclick = () => showView('quiz-play', { quizId, quizData });
    document.getElementById('share-link').onclick = () => {
        const url = `${window.location.origin}${window.location.search.includes('quizId') ? window.location.pathname : window.location.pathname + '?quizId=' + quizId}`;
        navigator.clipboard.writeText(url);
        showModal('Link Copied', `<p class="text-white/60">Share this link with your friends: <br><br> <span class="text-primary break-all">${url}</span></p>`);
    };
    document.getElementById('share-qr').onclick = () => {
        const url = `${window.location.origin}${window.location.search.includes('quizId') ? window.location.pathname : window.location.pathname + '?quizId=' + quizId}`;
        const qrUrl = generateQRCode(url);
        showModal('Scan to Join', `<div class="flex flex-col items-center gap-6"><img src="${qrUrl}" class="w-48 h-48 rounded-2xl border-4 border-white shadow-xl"><p class="text-white/60 text-center">Scan this code to join the quiz instantly.</p></div>`);
    };
}

function renderQuizPlay({ quizId, quizData }) {
    let currentIdx = 0;
    let score = 0;
    let answers = [];
    let startTime = Date.now();

    function renderQuestion() {
        const q = quizData.questions[currentIdx];
        const progress = ((currentIdx + 1) / quizData.questions.length) * 100;

        viewContainer.innerHTML = `
            <div class="animate-fade-in max-w-3xl mx-auto">
                <div class="flex justify-between items-center mb-8">
                    <span class="text-xs uppercase tracking-widest text-white/40 font-bold">Question ${currentIdx + 1} of ${quizData.questions.length}</span>
                    <span id="timer" class="font-mono text-primary">00:00</span>
                </div>
                <div class="w-full h-1 bg-white/5 rounded-full mb-12 overflow-hidden">
                    <div class="h-full bg-primary transition-all duration-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]" style="width: ${progress}%"></div>
                </div>

                <h3 class="text-3xl font-display mb-12 leading-tight">${q.question}</h3>

                <div id="options-container" class="grid grid-cols-1 gap-4">
                    ${renderOptions(q)}
                </div>
            </div>
        `;

        startTimer();
    }

    function renderOptions(q) {
        if (q.type === 'multiple-choice') {
            return q.options.map((opt, i) => `
                <button class="option-btn group flex justify-between items-center" data-idx="${i}">
                    <span>${opt}</span>
                    <div class="w-6 h-6 rounded-full border border-white/20 group-hover:border-primary transition-all"></div>
                </button>
            `).join('');
        } else if (q.type === 'true-false') {
            return `
                <button class="option-btn group flex justify-between items-center" data-idx="true">
                    <span>True</span>
                    <div class="w-6 h-6 rounded-full border border-white/20 group-hover:border-primary transition-all"></div>
                </button>
                <button class="option-btn group flex justify-between items-center" data-idx="false">
                    <span>False</span>
                    <div class="w-6 h-6 rounded-full border border-white/20 group-hover:border-primary transition-all"></div>
                </button>
            `;
        } else if (q.type === 'fill-in-the-blank') {
            return `
                <div class="space-y-4">
                    <input type="text" id="blank-input" class="w-full p-6 bg-white/5 border border-white/10 rounded-2xl focus:border-primary outline-none transition-all" placeholder="Type your answer here...">
                    <button id="submit-blank" class="btn-generate w-full">Submit Answer</button>
                </div>
            `;
        }
    }

    function startTimer() {
        const timerEl = document.getElementById('timer');
        const start = Date.now();
        const interval = setInterval(() => {
            const elapsed = Math.floor((Date.now() - start) / 1000);
            const mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
            const secs = String(elapsed % 60).padStart(2, '0');
            if (timerEl) timerEl.innerText = `${mins}:${secs}`;
            else clearInterval(interval);
        }, 1000);
    }

    function handleAnswer(answer) {
        const q = quizData.questions[currentIdx];
        let isCorrect = false;

        if (q.type === 'multiple-choice') {
            isCorrect = parseInt(answer) === parseInt(q.answer);
        } else if (q.type === 'true-false') {
            isCorrect = String(answer) === String(q.answer);
        } else if (q.type === 'fill-in-the-blank') {
            isCorrect = answer.toLowerCase().trim() === q.answer.toLowerCase().trim();
        }

        if (isCorrect) score++;
        answers.push({ questionIdx: currentIdx, answer, isCorrect });

        if (currentIdx < quizData.questions.length - 1) {
            currentIdx++;
            renderQuestion();
            attachListeners();
        } else {
            const timeTaken = Math.floor((Date.now() - startTime) / 1000);
            showView('quiz-results', { quizId, quizData, score, answers, timeTaken });
        }
    }

    function attachListeners() {
        const btns = document.querySelectorAll('.option-btn');
        btns.forEach(btn => {
            btn.onclick = () => handleAnswer(btn.dataset.idx);
        });

        const submitBlank = document.getElementById('submit-blank');
        if (submitBlank) {
            submitBlank.onclick = () => {
                const input = document.getElementById('blank-input').value;
                if (input.trim()) handleAnswer(input);
            };
        }
    }

    renderQuestion();
    attachListeners();
}

async function renderQuizResults({ quizId, quizData, score, answers, timeTaken }) {
    const percentage = Math.round((score / quizData.questions.length) * 100);
    const failedQuestions = answers.filter(a => !a.isCorrect).map(a => quizData.questions[a.questionIdx]);

    viewContainer.innerHTML = `
        <div class="animate-fade-in max-w-2xl mx-auto text-center">
            <h2 class="text-6xl font-display mb-4">Session Complete</h2>
            <div class="text-8xl font-bold text-primary mb-8">${percentage}%</div>
            
            <div class="grid grid-cols-3 gap-4 mb-12">
                <div class="glass">
                    <p class="text-xs uppercase tracking-widest text-white/30 font-bold mb-1">Score</p>
                    <p class="text-2xl font-semibold">${score}/${quizData.questions.length}</p>
                </div>
                <div class="glass">
                    <p class="text-xs uppercase tracking-widest text-white/30 font-bold mb-1">Time</p>
                    <p class="text-2xl font-semibold">${timeTaken}s</p>
                </div>
                <div class="glass">
                    <p class="text-xs uppercase tracking-widest text-white/30 font-bold mb-1">Accuracy</p>
                    <p class="text-2xl font-semibold">${percentage}%</p>
                </div>
            </div>

            <div class="flex flex-col gap-4">
                <button id="retake-quiz" class="btn-primary py-5 text-xl">
                    Retake Session
                </button>
                ${failedQuestions.length > 0 ? `
                    <button id="adaptive-retake" class="btn-generate">
                        Adaptive Focus
                    </button>
                ` : ''}
                <button id="back-home" class="btn-outline">
                    Back to Dashboard
                </button>
            </div>
        </div>
    `;

    // Save Score to History
    if (currentUser) {
        await addDoc(collection(db, 'history'), {
            userId: currentUser.uid,
            quizId,
            score,
            totalQuestions: quizData.questions.length,
            timeTaken,
            timestamp: serverTimestamp()
        });
        
        // Update user stats
        const userRef = doc(db, 'users', currentUser.uid);
        await updateDoc(userRef, {
            'stats.quizzesTaken': increment(1),
            'stats.totalScore': increment(score)
        });
    }

    document.getElementById('back-home').onclick = () => showView('home');
    document.getElementById('retake-quiz').onclick = () => showView('quiz-play', { quizId, quizData });
    
    if (document.getElementById('adaptive-retake')) {
        document.getElementById('adaptive-retake').onclick = async () => {
            const btn = document.getElementById('adaptive-retake');
            btn.disabled = true;
            btn.innerText = 'Generating focused questions...';
            
            try {
                const newQuizData = await generateAdaptiveQuiz(failedQuestions);
                showView('quiz-play', { quizId, quizData: newQuizData });
            } catch (error) {
                console.error(error);
                showModal('Error', '<p class="text-white/60">Failed to generate adaptive quiz.</p>');
                btn.disabled = false;
                btn.innerText = 'Adaptive Focus';
            }
        };
    }
}

async function generateAdaptiveQuiz(failedQuestions) {
    const concepts = failedQuestions.map(q => q.question).join(', ');
    const prompt = `
        The user failed the following questions/concepts: ${concepts}.
        Generate a new quiz of 5 questions focusing specifically on these concepts to help them learn.
        Do NOT use the exact same questions.
        Strictly include a mix of Multiple Choice, True/False, and Fill-in-the-Blank.
        Return as JSON (same structure as before).
    `;

    const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [{ parts: [{ text: prompt }] }],
        config: { responseMimeType: "application/json" }
    });

    return JSON.parse(response.text);
}

// --- Feature Modules (Stubs for now, will expand in next steps) ---
function renderProfile() {
    viewContainer.innerHTML = `
        <div class="animate-fade-in">
            <h2 class="text-5xl font-display mb-12">Intelligence Profile</h2>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div class="glass col-span-2">
                    <h3 class="text-xl font-bold mb-6">Learning History</h3>
                    <p class="text-white/40 italic">No sessions recorded yet. Start your journey!</p>
                </div>
                <div class="space-y-8">
                    <div class="glass">
                        <h3 class="text-xs uppercase tracking-widest text-white/30 font-bold mb-4">Global Stats</h3>
                        <div class="flex justify-between items-end">
                            <span class="text-4xl font-display">${currentUser.stats?.quizzesTaken || 0}</span>
                            <span class="text-white/40 text-sm">Sessions</span>
                        </div>
                    </div>
                    <div class="glass">
                        <h3 class="text-xs uppercase tracking-widest text-white/30 font-bold mb-4">Achievements</h3>
                        <div class="flex gap-2">
                            <div class="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center opacity-20">
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// --- Feature Modules ---
async function renderGenerate() {
    if (!currentUser) {
        showModal('Identity Required', '<p class="text-white/60 mb-6">Please authenticate to access the generation engine.</p><button id="modal-login" class="btn-primary w-full">Authenticate with Google</button>');
        document.getElementById('modal-login').onclick = () => {
            loginWithGoogle();
            closeModal();
        };
        return;
    }
    viewContainer.innerHTML = `
        <div class="animate-fade-in max-w-2xl mx-auto">
            <h2 class="text-5xl font-display mb-4">Generate Engine</h2>
            <p class="text-white/60 mb-12">Upload your source material and let the engine architect a custom learning path.</p>
            
            <div class="space-y-8">
                <div id="drop-zone" class="border-2 border-dashed border-white/10 rounded-3xl p-12 text-center hover:border-primary/50 transition-all cursor-pointer bg-white/5 group">
                    <svg class="mx-auto mb-4 text-white/20 group-hover:text-primary transition-colors" xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                    <p id="file-status" class="font-semibold">Drop document or click to browse</p>
                    <p class="text-xs text-white/40 mt-2 uppercase tracking-widest">PDF, TXT (Max 10MB)</p>
                    <input type="file" id="file-input" class="hidden" accept=".pdf,.txt">
                </div>

                <div class="grid grid-cols-2 gap-4">
                    <div class="space-y-2">
                        <label class="text-xs uppercase tracking-widest text-white/40 font-bold">Complexity</label>
                        <select id="q-diff" class="w-full bg-white/5 border border-white/10 rounded-xl p-3 outline-none focus:border-primary">
                            <option value="easy">Foundational</option>
                            <option value="medium">Intermediate</option>
                            <option value="hard">Advanced</option>
                        </select>
                    </div>
                    <div class="space-y-2">
                        <label class="text-xs uppercase tracking-widest text-white/40 font-bold">Volume</label>
                        <select id="q-count" class="w-full bg-white/5 border border-white/10 rounded-xl p-3 outline-none focus:border-primary">
                            <option value="5">5 Nodes</option>
                            <option value="10">10 Nodes</option>
                            <option value="20">20 Nodes</option>
                        </select>
                    </div>
                </div>

                <button id="start-gen" class="btn-generate w-full">
                    Initialize Generation
                </button>
            </div>
        </div>
    `;

    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const fileStatus = document.getElementById('file-status');
    const startGenBtn = document.getElementById('start-gen');
    let selectedFile = null;

    dropZone.onclick = () => fileInput.click();
    fileInput.onchange = (e) => {
        if (e.target.files.length > 0) {
            selectedFile = e.target.files[0];
            fileStatus.innerText = `Selected: ${selectedFile.name}`;
            dropZone.classList.add('border-orange-500');
        }
    };

    startGenBtn.onclick = async () => {
        if (!selectedFile) {
            showModal('Error', '<p class="text-white/60">Please select a file first.</p>');
            return;
        }

        startGenBtn.disabled = true;
        startGenBtn.innerText = 'Parsing Document...';

        try {
            const text = await parseFile(selectedFile);
            startGenBtn.innerText = 'Crafting your session...';
            
            const qCount = document.getElementById('q-count').value;
            const qDiff = document.getElementById('q-diff').value;

            const quizData = await generateQuizWithAI(text, qCount, qDiff);
            const quizId = await saveQuizToFirestore(quizData);
            
            showView('quiz-ready', { quizId, quizData });
        } catch (error) {
            console.error(error);
            showModal('Generation Failed', `<p class="text-white/60">${error.message}</p>`);
            startGenBtn.disabled = false;
            startGenBtn.innerText = 'Initialize Generation';
        }
    };
}

async function parseFile(file) {
    if (file.type === 'text/plain') {
        return await file.text();
    } else if (file.type === 'application/pdf') {
        const arrayBuffer = await file.arrayBuffer();
        const pdfjsLib = await import('pdfjs-dist/build/pdf');
        const workerUrl = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
        console.log('Loading PDF worker from:', workerUrl);
        pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
        
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let fullText = '';
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            fullText += textContent.items.map(item => item.str).join(' ') + '\n';
        }
        return fullText;
    } else {
        throw new Error('Unsupported file type. Please upload PDF or TXT.');
    }
}

async function generateQuizWithAI(content, count, difficulty) {
    const prompt = `
        Generate a quiz based on the following content.
        Count: ${count} questions.
        Difficulty: ${difficulty}.
        Strictly include a mix of:
        - Multiple Choice (4 options)
        - True/False
        - Fill-in-the-Blank
        
        Return the result as a JSON object with the following structure:
        {
            "title": "Quiz Title",
            "description": "Brief description",
            "questions": [
                {
                    "type": "multiple-choice",
                    "question": "...",
                    "options": ["A", "B", "C", "D"],
                    "answer": "Correct Option Index (0-3)"
                },
                {
                    "type": "true-false",
                    "question": "...",
                    "answer": true/false
                },
                {
                    "type": "fill-in-the-blank",
                    "question": "...",
                    "answer": "correct word"
                }
            ]
        }
        
        Content:
        ${content.substring(0, 15000)} // Limit content for token constraints
    `;

    const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [{ parts: [{ text: prompt }] }],
        config: {
            responseMimeType: "application/json"
        }
    });

    return JSON.parse(response.text);
}

async function saveQuizToFirestore(quizData) {
    const quizRef = await addDoc(collection(db, 'quizzes'), {
        ...quizData,
        creatorId: currentUser.uid,
        createdAt: serverTimestamp(),
        shareCount: 0
    });
    return quizRef.id;
}

function renderMultiplayer() {
    if (!currentUser) {
        showModal('Identity Required', '<p class="text-white/60 mb-6">Please authenticate to access the Live Arena.</p><button id="modal-login" class="btn-primary w-full">Authenticate with Google</button>');
        document.getElementById('modal-login').onclick = () => { loginWithGoogle(); closeModal(); };
        return;
    }

    viewContainer.innerHTML = `
        <div class="animate-fade-in">
            <div class="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-12">
                <div>
                    <h2 class="text-5xl font-display mb-2">Live Arena</h2>
                    <p class="text-white/60">Join a neural link or architect your own lobby.</p>
                </div>
                <div class="flex gap-4 w-full md:w-auto">
                    <button id="create-lobby" class="btn-primary px-8">Create Lobby</button>
                    <button id="view-leaderboard" class="btn-outline px-8">Rankings</button>
                </div>
            </div>

            <div id="lobby-list" class="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div class="flex justify-center py-12 col-span-full">
                    <div class="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                </div>
            </div>
        </div>
    `;

    const lobbyList = document.getElementById('lobby-list');
    const lobbiesRef = rtdbRef(rtdb, 'lobbies');

    onValue(lobbiesRef, (snapshot) => {
        const data = snapshot.val();
        if (!data) {
            lobbyList.innerHTML = '<p class="text-white/40 italic col-span-full text-center py-12">No active links. Architect one to start!</p>';
            return;
        }

        lobbyList.innerHTML = Object.entries(data).map(([id, lobby]) => `
            <div class="glass group relative overflow-hidden">
                ${lobby.status === 'live' ? '<div class="absolute top-0 right-0 bg-primary px-4 py-1 text-[10px] font-bold uppercase tracking-widest shadow-[0_0_10px_rgba(59,130,246,0.5)]">Live</div>' : ''}
                <h3 class="text-xl font-bold mb-2">${lobby.name}</h3>
                <p class="text-sm text-white/40 mb-6">${Object.keys(lobby.players || {}).length} Nodes • ${lobby.quizTitle}</p>
                <button class="join-lobby-btn w-full py-3 bg-white/5 border border-white/10 rounded-xl font-bold group-hover:bg-primary group-hover:text-white transition-all" data-id="${id}">
                    ${lobby.status === 'waiting' ? 'Establish Link' : 'Spectate'}
                </button>
            </div>
        `).join('');

        document.querySelectorAll('.join-lobby-btn').forEach(btn => {
            btn.onclick = () => joinLobby(btn.dataset.id);
        });
    });

    document.getElementById('create-lobby').onclick = showCreateLobbyModal;
    document.getElementById('view-leaderboard').onclick = renderLeaderboard;
}

async function showCreateLobbyModal() {
    // Fetch user's quizzes to choose from
    const q = query(collection(db, 'quizzes'), where('creatorId', '==', currentUser.uid));
    const snap = await getDocs(q);
    
    const quizOptions = snap.docs.map(doc => `
        <option value="${doc.id}">${doc.data().title}</option>
    `).join('') || '<option value="default">General Knowledge Blitz</option>';
    
    showModal('Create Live Lobby', `
        <div class="space-y-6">
            <div class="space-y-2">
                <label class="text-xs uppercase tracking-widest text-white/40 font-bold">Lobby Name</label>
                <input type="text" id="lobby-name" class="w-full" placeholder="e.g. Friday Night Trivia">
            </div>
            <div class="space-y-2">
                <label class="text-xs uppercase tracking-widest text-white/40 font-bold">Select Quiz</label>
                <select id="lobby-quiz" class="w-full">
                    ${quizOptions}
                </select>
            </div>
            <button id="confirm-create" class="w-full py-4 bg-orange-600 rounded-xl font-bold">Launch Lobby</button>
        </div>
    `);

    document.getElementById('confirm-create').onclick = async () => {
        const name = document.getElementById('lobby-name').value;
        const quizSelect = document.getElementById('lobby-quiz');
        const selectedOption = quizSelect.options[quizSelect.selectedIndex];
        const quizTitle = selectedOption.text;
        
        if (!name) return;

        const newLobbyRef = push(rtdbRef(rtdb, 'lobbies'));
        await rtdbSet(newLobbyRef, {
            name,
            hostId: currentUser.uid,
            quizTitle: quizTitle,
            status: 'waiting',
            createdAt: Date.now(),
            players: {
                [currentUser.uid]: {
                    name: currentUser.displayName,
                    photo: currentUser.photoURL,
                    score: 0,
                    ready: true
                }
            }
        });
        closeModal();
        joinLobby(newLobbyRef.key);
    };
}

function joinLobby(lobbyId) {
    const lobbyRef = rtdbRef(rtdb, `lobbies/${lobbyId}`);
    
    // Add player to lobby
    rtdbSet(rtdbRef(rtdb, `lobbies/${lobbyId}/players/${currentUser.uid}`), {
        name: currentUser.displayName,
        photo: currentUser.photoURL,
        score: 0,
        ready: true
    });

    viewContainer.innerHTML = `
        <div class="animate-fade-in grid grid-cols-1 lg:grid-cols-4 gap-8">
            <div class="lg:col-span-3 space-y-8">
                <div class="glass p-8 rounded-3xl flex justify-between items-center">
                    <div>
                        <h2 id="lobby-title" class="text-3xl font-display italic">Lobby Name</h2>
                        <p class="text-white/40">Waiting for host to start...</p>
                    </div>
                    <div class="text-right">
                        <p class="text-xs uppercase tracking-widest text-white/30 font-bold">Players</p>
                        <p id="player-count" class="text-2xl font-bold">1</p>
                    </div>
                </div>

                <div id="players-grid" class="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <!-- Players will be injected here -->
                </div>
            </div>

            <div class="glass rounded-3xl flex flex-col h-[600px] overflow-hidden">
                <div class="p-4 border-b border-white/10 bg-white/5">
                    <h3 class="text-xs uppercase tracking-widest font-bold">Live Chat</h3>
                </div>
                <div id="chat-messages" class="flex-grow overflow-y-auto p-4 space-y-4">
                    <!-- Messages -->
                </div>
                <div class="p-4 border-t border-white/10 flex gap-2">
                    <input type="text" id="chat-input" class="flex-grow bg-white/5 border-none text-sm" placeholder="Type a message...">
                    <button id="send-chat" class="p-2 bg-orange-600 rounded-lg">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                    </button>
                </div>
            </div>
        </div>
    `;

    // Sync Lobby State
    onValue(lobbyRef, (snapshot) => {
        const lobby = snapshot.val();
        if (!lobby) return;

        document.getElementById('lobby-title').innerText = lobby.name;
        const players = Object.values(lobby.players || {});
        document.getElementById('player-count').innerText = players.length;

        document.getElementById('players-grid').innerHTML = players.map(p => `
            <div class="glass p-4 rounded-2xl flex flex-col items-center text-center gap-3">
                <img src="${p.photo}" class="w-12 h-12 rounded-full border-2 border-orange-500">
                <p class="text-sm font-semibold truncate w-full">${p.name}</p>
                <div class="px-2 py-0.5 bg-green-500/20 text-green-500 text-[10px] font-bold uppercase rounded">Ready</div>
            </div>
        `).join('');
    });

    // Chat Logic
    const chatRef = rtdbRef(rtdb, `chats/${lobbyId}`);
    const chatInput = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-chat');
    const chatMessages = document.getElementById('chat-messages');

    // Add image upload button to chat UI
    const chatInputContainer = chatInput.parentElement;
    const imgUploadBtn = document.createElement('button');
    imgUploadBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>';
    imgUploadBtn.className = 'p-2 text-white/40 hover:text-white transition-colors';
    chatInputContainer.insertBefore(imgUploadBtn, chatInput);

    const chatImgInput = document.createElement('input');
    chatImgInput.type = 'file';
    chatImgInput.accept = 'image/*';
    chatImgInput.className = 'hidden';
    document.body.appendChild(chatImgInput);

    imgUploadBtn.onclick = () => chatImgInput.click();
    chatImgInput.onchange = async (e) => {
        if (e.target.files.length > 0) {
            const file = e.target.files[0];
            const storageRef = ref(storage, `chat_images/${lobbyId}/${Date.now()}_${file.name}`);
            await uploadBytes(storageRef, file);
            const url = await getDownloadURL(storageRef);
            push(chatRef, {
                uid: currentUser.uid,
                name: currentUser.displayName,
                image: url,
                timestamp: Date.now()
            });
        }
    };

    sendBtn.onclick = () => {
        const msg = chatInput.value;
        if (!msg) return;
        push(chatRef, {
            uid: currentUser.uid,
            name: currentUser.displayName,
            text: msg,
            timestamp: Date.now()
        });
        chatInput.value = '';
    };

    onValue(chatRef, (snapshot) => {
        const data = snapshot.val();
        if (!data) return;
        chatMessages.innerHTML = Object.values(data).map(m => `
            <div class="chat-bubble ${m.uid === currentUser.uid ? 'me' : 'them'}">
                <p class="text-[10px] opacity-50 mb-1">${m.name}</p>
                ${m.image ? `<img src="${m.image}" class="rounded-lg max-w-full mt-2 cursor-pointer" onclick="window.open('${m.image}')">` : `<p>${m.text}</p>`}
            </div>
        `).join('');
        chatMessages.scrollTop = chatMessages.scrollHeight;
    });
}

// --- Home Logic ---
function renderHome() {
    heroSection.classList.remove('hidden');
    viewContainer.classList.add('hidden');
}

// --- QR Helper ---
function generateQRCode(data) {
    return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(data)}`;
}

async function renderLeaderboard() {
    showView('leaderboard');
    viewContainer.innerHTML = `
        <div class="animate-fade-in max-w-3xl mx-auto">
            <h2 class="text-5xl font-display mb-12">Global Rankings</h2>
            <div class="glass overflow-hidden">
                <table class="w-full text-left">
                    <thead class="bg-white/5 border-b border-white/10">
                        <tr>
                            <th class="p-6 text-xs uppercase tracking-widest text-white/30">Rank</th>
                            <th class="p-6 text-xs uppercase tracking-widest text-white/30">Node</th>
                            <th class="p-6 text-xs uppercase tracking-widest text-white/30">Sessions</th>
                            <th class="p-6 text-xs uppercase tracking-widest text-white/30">Score</th>
                        </tr>
                    </thead>
                    <tbody id="leaderboard-body">
                        <!-- Rankings -->
                    </tbody>
                </table>
            </div>
        </div>
    `;

    const leaderboardBody = document.getElementById('leaderboard-body');
    leaderboardBody.innerHTML = `
        <tr class="border-b border-white/5 hover:bg-white/5 transition-all">
            <td class="p-6 font-display text-2xl text-primary">01</td>
            <td class="p-6 flex items-center gap-4">
                <img src="${currentUser.photoURL}" class="w-8 h-8 rounded-full border border-primary/50">
                <span class="font-semibold">${currentUser.displayName}</span>
            </td>
            <td class="p-6 text-white/60">42</td>
            <td class="p-6 font-mono font-bold">12,450</td>
        </tr>
    `;
}

// --- Event Listeners ---
function setupEventListeners() {
    document.getElementById('cta-generate').onclick = () => showView('generate');
    document.getElementById('cta-multiplayer').onclick = () => showView('multiplayer');
    
    modalClose.onclick = closeModal;
    modalOverlay.onclick = (e) => { if (e.target === modalOverlay) closeModal(); };
}

// --- Modal Helpers ---
function showModal(title, bodyHtml) {
    modalBody.innerHTML = `<h3 class="text-2xl font-display italic mb-6">${title}</h3>${bodyHtml}`;
    modalOverlay.classList.remove('hidden');
    modalOverlay.classList.add('flex');
}

function closeModal() {
    modalOverlay.classList.add('hidden');
    modalOverlay.classList.remove('flex');
}

// Start the app
init();
lucide.createIcons();
