// Application menu creation for Electron
import { app, Menu, BrowserWindow } from 'electron';
// Module state
var mainWindow = null;
var log = console.log;
export function createAppMenu(window, deps) {
    mainWindow = window;
    log = deps.log;
    var template = [
        {
            label: 'File',
            submenu: [
                {
                    label: 'Set Working Directory...',
                    accelerator: 'CmdOrCtrl+Shift+O',
                    click: function () { return mainWindow === null || mainWindow === void 0 ? void 0 : mainWindow.webContents.send('menu:set-working-dir'); }
                },
                { type: 'separator' },
                {
                    label: 'Add Files...',
                    accelerator: 'CmdOrCtrl+Shift+A',
                    click: function () { return mainWindow === null || mainWindow === void 0 ? void 0 : mainWindow.webContents.send('menu:add-files'); }
                },
                {
                    label: 'Add Folder...',
                    click: function () { return mainWindow === null || mainWindow === void 0 ? void 0 : mainWindow.webContents.send('menu:add-folder'); }
                },
                { type: 'separator' },
                {
                    label: 'Check Out Selected',
                    accelerator: 'CmdOrCtrl+Shift+O',
                    click: function () { return mainWindow === null || mainWindow === void 0 ? void 0 : mainWindow.webContents.send('menu:checkout'); }
                },
                {
                    label: 'Check In Selected',
                    accelerator: 'CmdOrCtrl+Shift+I',
                    click: function () { return mainWindow === null || mainWindow === void 0 ? void 0 : mainWindow.webContents.send('menu:checkin'); }
                },
                { type: 'separator' },
                {
                    label: 'Refresh',
                    accelerator: 'F5',
                    click: function () { return mainWindow === null || mainWindow === void 0 ? void 0 : mainWindow.webContents.send('menu:refresh'); }
                },
                { type: 'separator' },
                {
                    label: 'Exit',
                    accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Alt+F4',
                    click: function () { return app.quit(); }
                }
            ]
        },
        {
            label: 'Edit',
            submenu: [
                { label: 'Undo', accelerator: 'CmdOrCtrl+Z', role: 'undo' },
                { label: 'Redo', accelerator: 'CmdOrCtrl+Shift+Z', role: 'redo' },
                { type: 'separator' },
                { label: 'Cut', accelerator: 'CmdOrCtrl+X', role: 'cut' },
                { label: 'Copy', accelerator: 'CmdOrCtrl+C', role: 'copy' },
                { label: 'Paste', accelerator: 'CmdOrCtrl+V', role: 'paste' },
                { type: 'separator' },
                {
                    label: 'Select All',
                    accelerator: 'CmdOrCtrl+A',
                    role: 'selectAll'
                },
                { type: 'separator' },
                {
                    label: 'Find...',
                    accelerator: 'CmdOrCtrl+F',
                    click: function () { return mainWindow === null || mainWindow === void 0 ? void 0 : mainWindow.webContents.send('menu:find'); }
                }
            ]
        },
        {
            label: 'View',
            submenu: [
                {
                    label: 'Toggle Sidebar',
                    accelerator: 'CmdOrCtrl+B',
                    click: function () { return mainWindow === null || mainWindow === void 0 ? void 0 : mainWindow.webContents.send('menu:toggle-sidebar'); }
                },
                {
                    label: 'Toggle Details Panel',
                    accelerator: 'CmdOrCtrl+D',
                    click: function () { return mainWindow === null || mainWindow === void 0 ? void 0 : mainWindow.webContents.send('menu:toggle-details'); }
                },
                { type: 'separator' },
                {
                    label: 'Zoom In',
                    accelerator: 'CmdOrCtrl+=',
                    click: function () {
                        if (!mainWindow)
                            return;
                        var current = mainWindow.webContents.getZoomFactor();
                        var newZoom = Math.min(2.0, current + 0.1);
                        mainWindow.webContents.setZoomFactor(newZoom);
                        mainWindow.webContents.send('zoom-changed', newZoom);
                    }
                },
                {
                    label: 'Zoom Out',
                    accelerator: 'CmdOrCtrl+-',
                    click: function () {
                        if (!mainWindow)
                            return;
                        var current = mainWindow.webContents.getZoomFactor();
                        var newZoom = Math.max(0.5, current - 0.1);
                        mainWindow.webContents.setZoomFactor(newZoom);
                        mainWindow.webContents.send('zoom-changed', newZoom);
                    }
                },
                {
                    label: 'Reset Zoom',
                    accelerator: 'CmdOrCtrl+0',
                    click: function () {
                        if (!mainWindow)
                            return;
                        mainWindow.webContents.setZoomFactor(1);
                        mainWindow.webContents.send('zoom-changed', 1);
                    }
                },
                { type: 'separator' },
                { label: 'Toggle Full Screen', accelerator: 'F11', role: 'togglefullscreen' },
                { type: 'separator' },
                {
                    label: 'Toggle Developer Tools',
                    accelerator: process.platform === 'darwin' ? 'Cmd+Alt+I' : 'Ctrl+Shift+I',
                    role: 'toggleDevTools'
                }
            ]
        },
        {
            label: 'Window',
            submenu: [
                { role: 'minimize' },
                { role: 'zoom' },
                { type: 'separator' },
                {
                    label: 'Force Focus',
                    accelerator: 'CmdOrCtrl+Shift+F',
                    click: function () {
                        var _a;
                        log('[Window] Force focus requested');
                        var allWindows = BrowserWindow.getAllWindows();
                        for (var _i = 0, allWindows_1 = allWindows; _i < allWindows_1.length; _i++) {
                            var win = allWindows_1[_i];
                            if (win !== mainWindow && !win.isDestroyed()) {
                                log('[Window] Closing orphaned window: ' + win.getTitle());
                                win.close();
                            }
                        }
                        if (mainWindow && !mainWindow.isDestroyed()) {
                            if (mainWindow.isMinimized())
                                mainWindow.restore();
                            mainWindow.show();
                            mainWindow.focus();
                            if (process.platform === 'darwin') {
                                (_a = app.dock) === null || _a === void 0 ? void 0 : _a.show();
                            }
                        }
                    }
                },
                { type: 'separator' },
                { role: 'front' }
            ]
        },
        {
            label: 'Help',
            submenu: [
                {
                    label: 'About BluePLM',
                    click: function () { return mainWindow === null || mainWindow === void 0 ? void 0 : mainWindow.webContents.send('menu:about'); }
                }
            ]
        }
    ];
    // macOS-specific app menu
    if (process.platform === 'darwin') {
        template.unshift({
            label: app.getName(),
            submenu: [
                { label: 'About BluePLM', role: 'about' },
                { type: 'separator' },
                { label: 'Services', role: 'services' },
                { type: 'separator' },
                { label: 'Hide', accelerator: 'Cmd+H', role: 'hide' },
                { label: 'Hide Others', accelerator: 'Cmd+Alt+H', role: 'hideOthers' },
                { label: 'Show All', role: 'unhide' },
                { type: 'separator' },
                { label: 'Quit', accelerator: 'Cmd+Q', role: 'quit' }
            ]
        });
    }
    var menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
}
