const { ipcRenderer } = require('electron');

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreElement = document.getElementById('score');
const startBtn = document.getElementById('startBtn');
const restartBtn = document.getElementById('restartBtn');
const speedSelector = document.getElementById('speedSelector');
const highscoreList = document.getElementById('highscoreList');

const gridSize = 20;
const tileCount = canvas.width / gridSize;

let snake = [{ x: 10, y: 10, posX: 10 * gridSize, posY: 10 * gridSize }];
let food = { x: 5, y: 5 };
let direction = { x: 0, y: 0 };
let nextDirection = { x: 0, y: 0 };
let score = 0;
let isGameRunning = false;

// Для анимации радужного цвета змеи
let hue = 0;

// Позиция головы змеи в пикселях для плавного движения
let headPos = { x: snake[0].posX, y: snake[0].posY };

// Скорость движения змеи в пикселях за кадр
let speedPixelsPerFrame = 2;

let lastTime = 0; // для регулировки скорости

// Функция рисования скругленного прямоугольника
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

// Модальное окно для ввода имени
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
            if (e.key === 'Enter') {
                onSubmit();
            } else if (e.key === 'Escape') {
                onCancel();
            }
        }

        btn.addEventListener('click', onSubmit);
        overlay.addEventListener('click', onCancel);
        input.addEventListener('keydown', onKeyDown);
    });
}

// Рисую сегменты змеи
function drawSnakeSmooth() {
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    for (let i = 0; i < snake.length; i++) {
        const segment = snake[i];
        const colorHue = (hue + i * 30) % 360;
        ctx.fillStyle = `hsl(${colorHue}, 100%, 50%)`;

        const x = segment.posX;
        const y = segment.posY;

        const radius = gridSize / 2;
        roundRect(ctx, x, y, gridSize, gridSize, radius);
        ctx.fill();
    }
}

// Рисуем яблоко
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

// Проверяем столкновения змеи с собой и стенами
function checkCollision(newX, newY) {
    if (
        newX < 0 || newX >= tileCount ||
        newY < 0 || newY >= tileCount ||
        snake.some(segment => segment.x === newX && segment.y === newY)
    ) {
        return true;
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
    let newFood;
    do {
        newFood = {
            x: Math.floor(Math.random() * tileCount),
            y: Math.floor(Math.random() * tileCount)
        };
    } while (snake.some(segment => segment.x === newFood.x && segment.y === newFood.y));
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

// Основной игровой цикл с плавным обновлением
function gameLoop(time) {
    if (!isGameRunning) return;

    const deltaTime = time - lastTime;
    // speedSelector — число миллисекунд на одну клетку
    const speedMsPerCell = parseInt(speedSelector.value);
    speedPixelsPerFrame = gridSize / (speedMsPerCell / 16);

    // Двигаю голову змеи плавно
    headPos.x += direction.x * speedPixelsPerFrame;
    headPos.y += direction.y * speedPixelsPerFrame;

    // Проверяем, достигли ли центр следующей клетки
    const targetX = snake[0].x * gridSize + direction.x * gridSize;
    const targetY = snake[0].y * gridSize + direction.y * gridSize;

    let reachedNextCell = false;

    // Проверяю по каждой оси, если змейка достаточно близко к следующей клетке
    if (direction.x !== 0) {
        if ((direction.x > 0 && headPos.x >= targetX) ||
            (direction.x < 0 && headPos.x <= targetX)) {
            reachedNextCell = true;
        }
    } else if (direction.y !== 0) {
        if ((direction.y > 0 && headPos.y >= targetY) ||
            (direction.y < 0 && headPos.y <= targetY)) {
            reachedNextCell = true;
        }
    }

    if (reachedNextCell) {
        // Новая клетка змеи
        const newX = snake[0].x + direction.x;
        const newY = snake[0].y + direction.y;

        if (checkCollision(newX, newY)) {
            gameOver();
            return;
        }

        // Добавляю новый сегмент головы
        snake.unshift({ x: newX, y: newY, posX: newX * gridSize, posY: newY * gridSize });

        if (newX === food.x && newY === food.y) {
            score++;
            scoreElement.textContent = score;
            generateFood();
        } else {
            snake.pop();
        }
        headPos.x = newX * gridSize;
        headPos.y = newY * gridSize;
        direction = nextDirection;
    }

    // Обновляем позицию головы в массиве
    snake[0].posX = headPos.x;
    snake[0].posY = headPos.y;

    // Плавно двигаем остальные сегменты к предыдущим сегментам
    const followSpeed = 0.2;
    for (let i = 1; i < snake.length; i++) {
        const prev = snake[i - 1];
        const curr = snake[i];

        curr.posX += (prev.posX - curr.posX) * followSpeed;
        curr.posY += (prev.posY - curr.posY) * followSpeed;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawSnakeSmooth();
    drawFood();

    hue = (hue + 2) % 360;
    lastTime = time;
    requestAnimationFrame(gameLoop);
}

// Управление клавишами с автозапуском игры
document.addEventListener('keydown', (e) => {
    const code = e.code;

    const isUp = code === 'ArrowUp' || code === 'KeyW';
    const isDown = code === 'ArrowDown' || code === 'KeyS';
    const isLeft = code === 'ArrowLeft' || code === 'KeyA';
    const isRight = code === 'ArrowRight' || code === 'KeyD';

    if (!isUp && !isDown && !isLeft && !isRight) return;

    if (!isGameRunning) {
        if (isUp) nextDirection = { x: 0, y: -1 };
        else if (isDown) nextDirection = { x: 0, y: 1 };
        else if (isLeft) nextDirection = { x: -1, y: 0 };
        else if (isRight) nextDirection = { x: 1, y: 0 };

        startGame();
        return;
    }

    if (isUp && direction.y === 0) nextDirection = { x: 0, y: -1 };
    else if (isDown && direction.y === 0) nextDirection = { x: 0, y: 1 };
    else if (isLeft && direction.x === 0) nextDirection = { x: -1, y: 0 };
    else if (isRight && direction.x === 0) nextDirection = { x: 1, y: 0 };
});

startBtn.addEventListener('click', startGame);
restartBtn.addEventListener('click', resetGame);

// Загрузка рекордов при старте
window.onload = async () => {
    const highscores = await ipcRenderer.invoke('get-highscores');
    updateHighscoreList(highscores);
    resetGame();
};
