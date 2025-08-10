const { ipcRenderer } = require('electron');

['log', 'warn', 'error'].forEach(level => {
  const original = console[level];
  console[level] = (...args) => {
    ipcRenderer.send('renderer-log', { level, args });
    original.apply(console, args);
  };
});


// Берём канвас. Это наше поле боя.
const canvas = document.getElementById('gameCanvas');
// Берём 2D, потому что 3D тут нафиг не надо
const ctx = canvas.getContext('2d');

// Вытаскиваем интерфейс, чтобы потом магически менять
const scoreElement = document.getElementById('score');
const startBtn = document.getElementById('startBtn');
const restartBtn = document.getElementById('restartBtn');
const speedSelector = document.getElementById('speedSelector');
const highscoreList = document.getElementById('highscoreList');

// Размер клетки. Если хочешь поменять поле — начнётся ад.
const gridSize = 20;
// Сколько клеток помещается в ширину. Магия деления.
const tileCount = Math.floor(canvas.width / gridSize);

// Змейка в начале как спичка — одна клетка
let snake = [{ x: 10, y: 10, posX: 10 * gridSize, posY: 10 * gridSize }];
// Кусок еды
let food = { x: 5, y: 5 };
// Куда сейчас ползём
let direction = { x: 0, y: 0 };
// Куда захотим ползти после нажатия кнопки
let nextDirection = { x: 0, y: 0 };
// Счёт, который мы набрали (или не набрали)
let score = 0;
// Флаг — идёт игра или мы отдыхаем
let isGameRunning = false;
// Чтобы змейка переливалась, будем крутить радужный круг
let hue = 0;
// Плавное движение головы — да, я заморочился
let headPos = { x: snake[0].posX, y: snake[0].posY };
// Время прошлого кадра, чтобы знать, сколько прошло
let lastTime = 0;

let isPromptActive = false;

// Рисуем прямоугольник с закруглениями. Можно и без этого, но будет некрасиво.
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
function getDifficultyName() {
    const value = parseInt(speedSelector.value, 10);
    if (value <= 100) return 'hard';
    if (value <= 200) return 'medium';
    return 'easy';
}


// Показываем модальное окно, где игрок вводит своё имя.
// Да, оно блокирует игру, потому что так проще.
function showNamePrompt() {
    isPromptActive = true;
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
            isPromptActive = false;
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

// Рисуем змейку. Да, с плавностью, потому что я не из каменного века.
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

// Еда. Просто красный шарик с тенью.
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

// Проверка на врезание. Если да — гейм овер и слёзы.
function checkCollision(newX, newY, ignoreTail = false) {
    if (newX < 0 || newX >= tileCount || newY < 0 || newY >= tileCount) {
        return true;
    }
    for (let i = 10; i < snake.length; i++) {
        if (ignoreTail && i === snake.length - 1) continue;
        if (snake[i].x === newX && snake[i].y === newY) {
            return true;
        }
    }
    return false;
}

// Конец игры. Спрашиваем имя, сохраняем в рекорды.
async function gameOver() {
    try {
        console.log('gameOver вызван');
        isGameRunning = false;
        speedSelector.disabled = false;

        const name = await showNamePrompt();
        if (name && name.trim() !== '') {
            const difficulty = getDifficultyName();
            console.log('Отправка рекорда в main.js:', name, score, difficulty);
            const highscores = await ipcRenderer.invoke('save-highscore', { 
                name: name.trim(), 
                score, 
                difficulty 
            });
            updateHighscoreList(highscores);
        } else {
            console.log('Имя не введено, рекорд не сохранён');
        }
    } catch (err) {
        console.error('Ошибка при сохранении рекорда:', err);
    }
}



// Ставим еду в случайное место, но не на змейку (ну мы же не звери).
function generateFood() {
    let newFood;
    let attempts = 0;
    do {
        newFood = {
            x: Math.floor(Math.random() * tileCount),
            y: Math.floor(Math.random() * tileCount)
        };
        attempts++;
        if (attempts > 500) break; // чтобы не зависнуть навсегда
    } while (
        snake.some(segment => {
            const gx = Math.round(segment.posX / gridSize);
            const gy = Math.round(segment.posY / gridSize);
            return gx === newFood.x && gy === newFood.y;
        })
    );
    food = newFood;
}

// Обновляем список рекордов. Ну это понятно.
function updateHighscoreList(highscores) {
    highscoreList.innerHTML = '';
    highscores.slice(0, 5).forEach((entry, index) => {
        const li = document.createElement('li');
        li.textContent = `${index + 1}. ${entry.name}: ${entry.score}`;
        highscoreList.appendChild(li);
    });
}

// Сброс в дефолтное состояние. Всё по-новой.
function resetGame() {
    isGameRunning = false;
    speedSelector.disabled = false;
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

// Запуск
function startGame() {
    speedSelector.disabled = true;
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

// Главный цикл
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
            headPos.x = Math.round((snake[0].x + direction.x) * gridSize);
            headPos.y = Math.round((snake[0].y + direction.y) * gridSize);

            const newX = snake[0].x + direction.x;
            const newY = snake[0].y + direction.y;
            const eating = (newX === food.x && newY === food.y);

            if (newX < 0 || newX >= tileCount || newY < 0 || newY >= tileCount) {
                gameOver();
                return;
            }

            for (let i = 10; i < snake.length; i++) {
                if (!eating && i === snake.length - 1) continue;
                const seg = snake[i];
                const segGX = Math.round(seg.posX / gridSize);
                const segGY = Math.round(seg.posY / gridSize);
                if (segGX === newX && segGY === newY) {
                    gameOver();
                    return;
                }
            }

            snake.unshift({ x: newX, y: newY, posX: newX * gridSize, posY: newY * gridSize });

            if (eating) {
                score++;
                scoreElement.textContent = score;
                generateFood();
            } else {
                snake.pop();
            }

            direction = nextDirection;
            moveAmount -= distToNextCell;
        } else {
            headPos.x += direction.x * moveAmount;
            headPos.y += direction.y * moveAmount;
            moveAmount = 0;
        }
    }

    snake[0].posX = headPos.x;
    snake[0].posY = headPos.y;

    const followSpeed = 0.2;
    for (let i = 1; i < snake.length; i++) {
        const prev = snake[i - 1];
        const curr = snake[i];
        curr.posX += (prev.posX - curr.posX) * followSpeed;
        curr.posY += (prev.posY - curr.posY) * followSpeed;
    }

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

// Управление. Клавиши-стрелки или WASD, для эстетов.
document.addEventListener('keydown', (e) => {
    if (isPromptActive) return;

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

// Кнопки в интерфейсе, для тех кто мышкой
startBtn.addEventListener('click', startGame);
restartBtn.addEventListener('click', resetGame);

speedSelector.addEventListener('change', async () => {
    const difficulty = getDifficultyName();
    const highscores = await ipcRenderer.invoke('get-highscores', difficulty);
    updateHighscoreList(highscores);
});

// Когда всё загрузилось — подгружаем рекорды и ждём
window.onload = async () => {
    const difficulty = getDifficultyName();
    const highscores = await ipcRenderer.invoke('get-highscores', difficulty);
    updateHighscoreList(highscores);
    resetGame();
};

