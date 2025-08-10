const { ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');

// === ЛОГИРОВАНИЕ ===
const logFilePath = path.join(__dirname, 'snake_debug.log');
function logToFile(...args) {
    const msg = args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
    const line = `[${new Date().toISOString()}] ${msg}\n`;
    try {
        fs.appendFileSync(logFilePath, line, 'utf8');
    } catch (err) {}
}
// ===================

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const scoreElement = document.getElementById('score');
const startBtn = document.getElementById('startBtn');
const restartBtn = document.getElementById('restartBtn');
const speedSelector = document.getElementById('speedSelector');
const highscoreList = document.getElementById('highscoreList');

const gridSize = 20;
const tileCount = Math.floor(canvas.width / gridSize);

let snake = [{ x: 10, y: 10, posX: 10 * gridSize, posY: 10 * gridSize }];
let food = { x: 5, y: 5 };
let direction = { x: 0, y: 0 };
let nextDirection = { x: 0, y: 0 };
let score = 0;
let isGameRunning = false;
let hue = 0;
let headPos = { x: snake[0].posX, y: snake[0].posY };
let lastTime = 0;

function roundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
}

function showNamePrompt() {
    return new Promise((resolve) => {
        const modal = document.getElementById('nameModal');
        const overlay = document.getElementById('modalOverlay');
        const input = document.getElementById('nameInput');
        const btn = document.getElementById('nameSubmitBtn');

        modal.style.display = 'block';
        overlay.style.display = 'block';
        input.value = '';
        input.focus();

        function cleanup() {
            btn.removeEventListener('click', onSubmit);
            overlay.removeEventListener('click', onCancel);
            input.removeEventListener('keydown', onKeyDown);
            modal.style.display = 'none';
            overlay.style.display = 'none';
        }

        function onSubmit() {
            const val = input.value.trim();
            if (val) {
                cleanup();
                resolve(val);
            }
        }

        function onCancel() {
            cleanup();
            resolve(null);
        }

        function onKeyDown(e) {
            if (e.key === 'Enter') onSubmit();
            else if (e.key === 'Escape') onCancel();
        }

        btn.addEventListener('click', onSubmit);
        overlay.addEventListener('click', onCancel);
        input.addEventListener('keydown', onKeyDown);
    });
}

function drawSnakeSmooth() {
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (let i = 0; i < snake.length; i++) {
        const segment = snake[i];
        const colorHue = (hue + i * 30) % 360;
        ctx.fillStyle = `hsl(${colorHue}, 100%, 50%)`;
        roundRect(ctx, segment.posX, segment.posY, gridSize, gridSize, gridSize / 2);
        ctx.fill();
    }
}

function drawFood() {
    const centerX = food.x * gridSize + gridSize / 2;
    const centerY = food.y * gridSize + gridSize / 2;
    const radius = (gridSize / 2) * 0.8;
    ctx.save();
    ctx.shadowColor = 'rgba(255, 0, 0, 0.8)';
    ctx.shadowBlur = 15;
    ctx.fillStyle = 'red';
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

logToFile(`[DEBUG] tileCount=${tileCount} gridSize=${gridSize}`);

function checkCollision(newX, newY, ignoreTail = false) {
    if (newX < 0 || newX >= tileCount || newY < 0 || newY >= tileCount) {
        logToFile(`[COLLISION BORDER] X=${newX}, Y=${newY}`);
        return true;
    }
    for (let i = 10; i < snake.length; i++) {
        if (ignoreTail && i === snake.length - 1) continue;
        if (snake[i].x === newX && snake[i].y === newY) {
            logToFile(
                `[COLLISION BODY] segmentIndex=${i}, segX=${snake[i].x}, segY=${snake[i].y}, headX=${newX}, headY=${newY}`
            );
            return true;
        }
    }
    return false;
}

async function gameOver() {
    isGameRunning = false;
    const name = await showNamePrompt();
    if (name && name.trim() !== '') {
        const highscores = await ipcRenderer.invoke('save-highscore', { name, score });
        updateHighscoreList(highscores);
    }
}

function generateFood() {
    // Генерируем новую еду с учётом визуальных позиций (округлённых) и логических x/y
    let newFood;
    let attempts = 0;
    do {
        newFood = {
            x: Math.floor(Math.random() * tileCount),
            y: Math.floor(Math.random() * tileCount)
        };
        attempts++;
        if (attempts > 500) break; // safety
    } while (
        snake.some(segment => {
            // сравниваем по визуальным позициям (округлённым)
            const gx = Math.round(segment.posX / gridSize);
            const gy = Math.round(segment.posY / gridSize);
            return gx === newFood.x && gy === newFood.y;
        })
    );
    food = newFood;
}

function updateHighscoreList(highscores) {
    highscoreList.innerHTML = '';
    highscores.slice(0, 5).forEach((entry, index) => {
        const li = document.createElement('li');
        li.textContent = `${index + 1}. ${entry.name}: ${entry.score}`;
        highscoreList.appendChild(li);
    });
}

function resetGame() {
    isGameRunning = false;
    snake = [{ x: 10, y: 10, posX: 10 * gridSize, posY: 10 * gridSize }];
    direction = { x: 0, y: 0 };
    nextDirection = { x: 0, y: 0 };
    headPos = { x: snake[0].posX, y: snake[0].posY };
    score = 0;
    scoreElement.textContent = score;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawSnakeSmooth();
    drawFood();
}

function startGame() {
    if (isGameRunning) return;
    snake = [{ x: 10, y: 10, posX: 10 * gridSize, posY: 10 * gridSize }];
    direction = nextDirection.x !== 0 || nextDirection.y !== 0 ? nextDirection : { x: 1, y: 0 };
    nextDirection = direction;
    headPos = { x: snake[0].posX, y: snake[0].posY };
    score = 0;
    scoreElement.textContent = score;
    generateFood();
    isGameRunning = true;
    lastTime = performance.now();
    requestAnimationFrame(gameLoop);
}

function gameLoop(time) {
    if (!isGameRunning) return;
    const deltaTime = time - lastTime;
    lastTime = time;

    const speedMsPerCell = parseInt(speedSelector.value, 10);
    const pixelsPerMs = gridSize / speedMsPerCell;
    let moveAmount = pixelsPerMs * deltaTime;

    while (moveAmount > 0 && isGameRunning) {
        const targetX = snake[0].x * gridSize + direction.x * gridSize;
        const targetY = snake[0].y * gridSize + direction.y * gridSize;

        const distX = targetX - headPos.x;
        const distY = targetY - headPos.y;
        const distToNextCell = Math.sqrt(distX * distX + distY * distY);

        if (moveAmount >= distToNextCell) {
            // Доехали до следующей клетки визуально
            headPos.x = Math.round((snake[0].x + direction.x) * gridSize);
            headPos.y = Math.round((snake[0].y + direction.y) * gridSize);

            const newX = snake[0].x + direction.x;
            const newY = snake[0].y + direction.y;
            const eating = (newX === food.x && newY === food.y);

            // Проверка границ
            if (newX < 0 || newX >= tileCount || newY < 0 || newY >= tileCount) {
                logToFile(`[GAME OVER - BORDER] newX=${newX}, newY=${newY}`);
                gameOver();
                return;
            }

            // Проверка столкновения по визуальным позициям (округлённым pos)
            for (let i = 10; i < snake.length; i++) {
                if (!eating && i === snake.length - 1) continue; // ignore tail если не едим
                const seg = snake[i];
                const segGX = Math.round(seg.posX / gridSize);
                const segGY = Math.round(seg.posY / gridSize);
                if (segGX === newX && segGY === newY) {
                    logToFile(
                        `[GAME OVER - BODY] segmentIndex=${i}, segGX=${segGX}, segGY=${segGY}, headGX=${newX}, headGY=${newY}`
                    );
                    gameOver();
                    return;
                }
            }

            // Добавляем новый сегмент головы (логические координаты в целую клетку, визуальные — позиция клетки)
            snake.unshift({ x: newX, y: newY, posX: newX * gridSize, posY: newY * gridSize });

            if (eating) {
                score++;
                scoreElement.textContent = score;
                generateFood();
            } else {
                snake.pop();
            }

            // Применяем queued direction — так управление остаётся отзывчивым
            direction = nextDirection;
            moveAmount -= distToNextCell;
        } else {
            // Плавно двигаем голову по пикселям (визуальная анимация)
            headPos.x += direction.x * moveAmount;
            headPos.y += direction.y * moveAmount;
            moveAmount = 0;
        }
    }

    // Обновляем визуальную позицию головы
    snake[0].posX = headPos.x;
    snake[0].posY = headPos.y;

    // Плавное "догоняние" для остальных сегментов (как было)
    const followSpeed = 0.2;
    for (let i = 1; i < snake.length; i++) {
        const prev = snake[i - 1];
        const curr = snake[i];
        curr.posX += (prev.posX - curr.posX) * followSpeed;
        curr.posY += (prev.posY - curr.posY) * followSpeed;
    }

    // Синхронизация логических координат: только для хвоста и сегментов.
    // Голова уже имеет точные x/y (мы unshift её при достижении новой клетки).
    for (let i = 1; i < snake.length; i++) {
        snake[i].x = Math.round(snake[i].posX / gridSize);
        snake[i].y = Math.round(snake[i].posY / gridSize);
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawSnakeSmooth();
    drawFood();
    hue = (hue + 2) % 360;
    requestAnimationFrame(gameLoop);
}

document.addEventListener('keydown', (e) => {
    const code = e.code;
    const isUp = code === 'ArrowUp' || code === 'KeyW';
    const isDown = code === 'ArrowDown' || code === 'KeyS';
    const isLeft = code === 'ArrowLeft' || code === 'KeyA';
    const isRight = code === 'ArrowRight' || code === 'KeyD';
    if (!isUp && !isDown && !isLeft && !isRight) return;

    // Если игра не запущена — устанавливаем направление и стартуем
    if (!isGameRunning) {
        if (isUp) nextDirection = { x: 0, y: -1 };
        else if (isDown) nextDirection = { x: 0, y: 1 };
        else if (isLeft) nextDirection = { x: -1, y: 0 };
        else if (isRight) nextDirection = { x: 1, y: 0 };
        startGame();
        return;
    }

    // Нормальное управление: запрещаем разворот на 180 градусов по оси
    if (isUp && direction.y === 0) nextDirection = { x: 0, y: -1 };
    else if (isDown && direction.y === 0) nextDirection = { x: 0, y: 1 };
    else if (isLeft && direction.x === 0) nextDirection = { x: -1, y: 0 };
    else if (isRight && direction.x === 0) nextDirection = { x: 1, y: 0 };
});

startBtn.addEventListener('click', startGame);
restartBtn.addEventListener('click', resetGame);

window.onload = async () => {
    const highscores = await ipcRenderer.invoke('get-highscores');
    updateHighscoreList(highscores);
    resetGame();
};
