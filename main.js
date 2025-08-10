const { log } = require('console');
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
console.log('User data folder:', app.getPath('userData'));

ipcMain.on('renderer-log', (event, { level, args }) => {
    console[level]('[Renderer]', ...args);
  });

let mainWindow;
const highScoresFile = path.join(app.getPath('userData'), 'highscores.json');

app.whenReady().then(() => {
  mainWindow = new BrowserWindow({
    width: 600,
    height: 800,
    resizable: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.setMenu(null);
  mainWindow.loadFile('index.html');
});

app.on('window-all-closed', () => {
  app.quit();
});

// IPC: сохранение рекорда (с учётом сложности)
ipcMain.handle('save-highscore', async (event, { name, score, difficulty }) => {
    console.log('Сохранение рекорда:', name, score, difficulty);
  let data = {};
  try {
    if (fs.existsSync(highScoresFile)) {
      data = JSON.parse(fs.readFileSync(highScoresFile));
    }
  } catch (err) {
    console.error('Error reading highscores', err);
  }

  if (!data[difficulty]) {
    data[difficulty] = [];
  }

  data[difficulty].push({ name, score });
  data[difficulty].sort((a, b) => b.score - a.score);
  data[difficulty] = data[difficulty].slice(0, 10); // максимум 10 результатов

  fs.writeFileSync(highScoresFile, JSON.stringify(data, null, 2));
  return data[difficulty];
});

// IPC: получение рекордов по сложности
ipcMain.handle('get-highscores', async (event, difficulty) => {
  try {
    if (fs.existsSync(highScoresFile)) {
      const data = JSON.parse(fs.readFileSync(highScoresFile));
      return data[difficulty] || [];
    }
    return [];
  } catch (err) {
    console.error('Error reading highscores', err);
    return [];
  }
});
