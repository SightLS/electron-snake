const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');

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

  mainWindow.setMenu(null); // ❌ Удаляем верхнее меню
  mainWindow.loadFile('index.html');
});

app.on('window-all-closed', () => {
  app.quit();
});

// IPC: сохранение рекорда
ipcMain.handle('save-highscore', async (event, { name, score }) => {
  let data = [];
  try {
    if (fs.existsSync(highScoresFile)) {
      data = JSON.parse(fs.readFileSync(highScoresFile));
    }
  } catch (err) {
    console.error('Error reading highscores', err);
  }

  data.push({ name, score });
  data.sort((a, b) => b.score - a.score);
  data = data.slice(0, 10); // максимум 10 результатов

  fs.writeFileSync(highScoresFile, JSON.stringify(data, null, 2));
  return data;
});

// IPC: получение рекордов
ipcMain.handle('get-highscores', async () => {
  try {
    if (fs.existsSync(highScoresFile)) {
      return JSON.parse(fs.readFileSync(highScoresFile));
    }
    return [];
  } catch (err) {
    console.error('Error reading highscores', err);
    return [];
  }
});
