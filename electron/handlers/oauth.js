var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
// OAuth handlers for Electron main process
import { ipcMain, shell } from 'electron';
import http from 'http';
// Module state
var mainWindow = null;
var log = console.log;
// Active OAuth server
var activeOAuthServer = null;
var oauthTimeout = null;
// Google Drive credentials
var DEFAULT_GOOGLE_CLIENT_ID = process.env.GOOGLE_DRIVE_CLIENT_ID || '';
var DEFAULT_GOOGLE_CLIENT_SECRET = process.env.GOOGLE_DRIVE_CLIENT_SECRET || '';
var GOOGLE_DRIVE_SCOPES = [
    'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile'
].join(' ');
function cleanupOAuthServer() {
    if (oauthTimeout) {
        clearTimeout(oauthTimeout);
        oauthTimeout = null;
    }
    if (activeOAuthServer) {
        try {
            activeOAuthServer.close();
        }
        catch (_a) { }
        activeOAuthServer = null;
    }
}
export function registerOAuthHandlers(window, deps) {
    var _this = this;
    mainWindow = window;
    log = deps.log;
    // Supabase OAuth via system browser
    ipcMain.handle('auth:open-oauth-window', function (_, url) { return __awaiter(_this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, new Promise(function (resolve) {
                    cleanupOAuthServer();
                    log('[OAuth] Starting system browser OAuth flow');
                    var hasResolved = false;
                    var safeResolve = function (result) {
                        if (!hasResolved) {
                            hasResolved = true;
                            cleanupOAuthServer();
                            resolve(result);
                        }
                    };
                    var server = http.createServer(function (req, res) {
                        var reqUrl = new URL(req.url || '/', "http://localhost");
                        log('[OAuth] Received callback request: ' + reqUrl.pathname);
                        if (reqUrl.pathname === '/auth/callback' || reqUrl.pathname === '/') {
                            var accessToken = reqUrl.searchParams.get('access_token');
                            var refreshToken = reqUrl.searchParams.get('refresh_token');
                            var expiresIn = reqUrl.searchParams.get('expires_in');
                            var expiresAt = reqUrl.searchParams.get('expires_at');
                            var error = reqUrl.searchParams.get('error');
                            var errorDescription = reqUrl.searchParams.get('error_description');
                            if (error) {
                                log('[OAuth] OAuth error in callback: ' + error);
                                res.writeHead(200, { 'Content-Type': 'text/html' });
                                res.end(getErrorHtml(errorDescription || error));
                                safeResolve({ success: false, error: errorDescription || error || 'OAuth error' });
                                return;
                            }
                            if (accessToken && refreshToken) {
                                log('[OAuth] Tokens received in query params, sending to renderer');
                                res.writeHead(200, { 'Content-Type': 'text/html' });
                                res.end(getSuccessHtml());
                                mainWindow === null || mainWindow === void 0 ? void 0 : mainWindow.webContents.send('auth:set-session', {
                                    access_token: accessToken,
                                    refresh_token: refreshToken,
                                    expires_in: expiresIn ? parseInt(expiresIn) : 3600,
                                    expires_at: expiresAt ? parseInt(expiresAt) : undefined
                                });
                                if (mainWindow && !mainWindow.isDestroyed()) {
                                    if (mainWindow.isMinimized())
                                        mainWindow.restore();
                                    mainWindow.focus();
                                }
                                safeResolve({ success: true });
                                return;
                            }
                            // Tokens in hash fragment
                            log('[OAuth] No tokens in query params, serving hash extraction page');
                            res.writeHead(200, { 'Content-Type': 'text/html' });
                            res.end(getHashExtractHtml());
                            return;
                        }
                        if (reqUrl.pathname === '/auth/tokens') {
                            var accessToken = reqUrl.searchParams.get('access_token');
                            var refreshToken = reqUrl.searchParams.get('refresh_token');
                            var expiresIn = reqUrl.searchParams.get('expires_in');
                            var expiresAt = reqUrl.searchParams.get('expires_at');
                            if (accessToken && refreshToken) {
                                res.writeHead(200, { 'Content-Type': 'text/plain' });
                                res.end('OK');
                                log('[OAuth] Tokens received from hash fragment, sending to renderer');
                                mainWindow === null || mainWindow === void 0 ? void 0 : mainWindow.webContents.send('auth:set-session', {
                                    access_token: accessToken,
                                    refresh_token: refreshToken,
                                    expires_in: expiresIn ? parseInt(expiresIn) : 3600,
                                    expires_at: expiresAt ? parseInt(expiresAt) : undefined
                                });
                                if (mainWindow && !mainWindow.isDestroyed()) {
                                    if (mainWindow.isMinimized())
                                        mainWindow.restore();
                                    mainWindow.focus();
                                }
                                safeResolve({ success: true });
                            }
                            else {
                                log('[OAuth] /auth/tokens request missing tokens');
                                res.writeHead(400, { 'Content-Type': 'text/plain' });
                                res.end('Missing tokens');
                            }
                            return;
                        }
                        res.writeHead(302, { 'Location': '/auth/callback' + (reqUrl.search || '') });
                        res.end();
                    });
                    server.listen(0, '127.0.0.1', function () {
                        var address = server.address();
                        var port = address.port;
                        var callbackUrl = "http://127.0.0.1:".concat(port, "/auth/callback");
                        log('[OAuth] Local callback server started on port ' + port);
                        activeOAuthServer = server;
                        try {
                            var oauthUrl = new URL(url);
                            oauthUrl.searchParams.set('redirect_to', callbackUrl);
                            var finalUrl = oauthUrl.toString();
                            log('[OAuth] Opening system browser with OAuth URL');
                            shell.openExternal(finalUrl);
                            oauthTimeout = setTimeout(function () {
                                log('[OAuth] Timeout waiting for OAuth callback');
                                safeResolve({ success: false, error: 'OAuth timed out. Please try again.' });
                            }, 5 * 60 * 1000);
                        }
                        catch (err) {
                            log('[OAuth] Error parsing OAuth URL: ' + String(err));
                            safeResolve({ success: false, error: String(err) });
                        }
                    });
                    server.on('error', function (err) {
                        log('[OAuth] Server error: ' + String(err));
                        safeResolve({ success: false, error: String(err) });
                    });
                })];
        });
    }); });
    // Google Drive OAuth
    ipcMain.handle('auth:google-drive', function (_, credentials) { return __awaiter(_this, void 0, void 0, function () {
        var _this = this;
        return __generator(this, function (_a) {
            return [2 /*return*/, new Promise(function (resolve) {
                    log('[GoogleDrive] Starting OAuth flow');
                    var GOOGLE_CLIENT_ID = (credentials === null || credentials === void 0 ? void 0 : credentials.clientId) || DEFAULT_GOOGLE_CLIENT_ID;
                    var GOOGLE_CLIENT_SECRET = (credentials === null || credentials === void 0 ? void 0 : credentials.clientSecret) || DEFAULT_GOOGLE_CLIENT_SECRET;
                    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
                        log('[GoogleDrive] OAuth credentials not configured');
                        resolve({
                            success: false,
                            error: 'Google Drive integration requires OAuth credentials. Ask your admin to configure Google Drive in Settings → REST API → Google Drive Integration.'
                        });
                        return;
                    }
                    var hasResolved = false;
                    var gdAuthServer = null;
                    var safeResolve = function (result) {
                        if (!hasResolved) {
                            hasResolved = true;
                            if (gdAuthServer) {
                                gdAuthServer.close();
                                gdAuthServer = null;
                            }
                            resolve(result);
                        }
                    };
                    gdAuthServer = http.createServer(function (req, res) { return __awaiter(_this, void 0, void 0, function () {
                        var reqUrl, code, error, port, tokenResponse, tokens, err_1;
                        var _a;
                        return __generator(this, function (_b) {
                            switch (_b.label) {
                                case 0:
                                    reqUrl = new URL(req.url || '/', 'http://localhost');
                                    log('[GoogleDrive] Received callback: ' + reqUrl.pathname);
                                    if (!(reqUrl.pathname === '/auth/google-callback')) return [3 /*break*/, 5];
                                    code = reqUrl.searchParams.get('code');
                                    error = reqUrl.searchParams.get('error');
                                    if (error) {
                                        log('[GoogleDrive] OAuth error: ' + error);
                                        res.writeHead(200, { 'Content-Type': 'text/html' });
                                        res.end(getGoogleErrorHtml(error));
                                        safeResolve({ success: false, error: error });
                                        return [2 /*return*/];
                                    }
                                    if (!code) {
                                        res.writeHead(400, { 'Content-Type': 'text/html' });
                                        res.end('<html><body>Missing authorization code</body></html>');
                                        safeResolve({ success: false, error: 'Missing authorization code' });
                                        return [2 /*return*/];
                                    }
                                    _b.label = 1;
                                case 1:
                                    _b.trys.push([1, 4, , 5]);
                                    port = ((_a = gdAuthServer === null || gdAuthServer === void 0 ? void 0 : gdAuthServer.address()) === null || _a === void 0 ? void 0 : _a.port) || 8090;
                                    return [4 /*yield*/, fetch('https://oauth2.googleapis.com/token', {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                                            body: new URLSearchParams({
                                                code: code,
                                                client_id: GOOGLE_CLIENT_ID,
                                                client_secret: GOOGLE_CLIENT_SECRET,
                                                redirect_uri: "http://localhost:".concat(port, "/auth/google-callback"),
                                                grant_type: 'authorization_code'
                                            }).toString()
                                        })];
                                case 2:
                                    tokenResponse = _b.sent();
                                    return [4 /*yield*/, tokenResponse.json()];
                                case 3:
                                    tokens = _b.sent();
                                    if (tokens.error) {
                                        log('[GoogleDrive] Token exchange error: ' + tokens.error);
                                        res.writeHead(200, { 'Content-Type': 'text/html' });
                                        res.end(getGoogleErrorHtml(tokens.error_description || tokens.error));
                                        safeResolve({ success: false, error: tokens.error_description || tokens.error });
                                        return [2 /*return*/];
                                    }
                                    log('[GoogleDrive] Token exchange successful');
                                    res.writeHead(200, { 'Content-Type': 'text/html' });
                                    res.end(getGoogleSuccessHtml());
                                    safeResolve({
                                        success: true,
                                        accessToken: tokens.access_token,
                                        refreshToken: tokens.refresh_token,
                                        expiry: tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : undefined
                                    });
                                    return [3 /*break*/, 5];
                                case 4:
                                    err_1 = _b.sent();
                                    log('[GoogleDrive] Token exchange exception: ' + String(err_1));
                                    res.writeHead(200, { 'Content-Type': 'text/html' });
                                    res.end(getGoogleErrorHtml(String(err_1)));
                                    safeResolve({ success: false, error: String(err_1) });
                                    return [3 /*break*/, 5];
                                case 5: return [2 /*return*/];
                            }
                        });
                    }); });
                    gdAuthServer.listen(0, '127.0.0.1', function () {
                        var address = gdAuthServer.address();
                        var port = address.port;
                        var authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
                        authUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID);
                        authUrl.searchParams.set('redirect_uri', "http://localhost:".concat(port, "/auth/google-callback"));
                        authUrl.searchParams.set('response_type', 'code');
                        authUrl.searchParams.set('scope', GOOGLE_DRIVE_SCOPES);
                        authUrl.searchParams.set('access_type', 'offline');
                        authUrl.searchParams.set('prompt', 'consent');
                        log('[GoogleDrive] Opening auth URL in browser');
                        shell.openExternal(authUrl.toString());
                    });
                    gdAuthServer.on('error', function (err) {
                        log('[GoogleDrive] Server error: ' + String(err));
                        safeResolve({ success: false, error: String(err) });
                    });
                })];
        });
    }); });
}
// HTML templates
function getSuccessHtml() {
    return "<!DOCTYPE html>\n<html>\n<head><title>Sign In Successful</title>\n<style>\n@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600&display=swap');\n* { box-sizing: border-box; }\nbody { font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #181818; color: #cccccc; }\n.container { text-align: center; padding: 48px 56px; background: #1f1f1f; border: 1px solid #2b2b2b; border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,0.4); }\n.icon-container { width: 72px; height: 72px; margin: 0 auto 24px; background: rgba(74, 222, 128, 0.15); border-radius: 50%; display: flex; align-items: center; justify-content: center; }\n.checkmark { width: 40px; height: 40px; }\nh1 { margin: 0 0 8px 0; font-weight: 600; font-size: 20px; color: #cccccc; }\np { margin: 0; font-size: 14px; color: #6e6e6e; }\n.brand { margin-top: 24px; padding-top: 20px; border-top: 1px solid #2b2b2b; }\n.brand-text { font-size: 12px; color: #0078d4; font-weight: 500; letter-spacing: 0.5px; }\n</style>\n</head>\n<body>\n<div class=\"container\">\n<div class=\"icon-container\">\n<svg class=\"checkmark\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#4ade80\" stroke-width=\"2.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\">\n<path d=\"M20 6L9 17l-5-5\"/>\n</svg>\n</div>\n<h1>Sign In Successful</h1>\n<p>You can close this window and return to the app.</p>\n<div class=\"brand\"><span class=\"brand-text\">BluePLM</span></div>\n</div>\n<script>setTimeout(() => window.close(), 2000);</script>\n</body>\n</html>";
}
function getErrorHtml(message) {
    return "<!DOCTYPE html>\n<html>\n<head><title>Sign In Failed</title>\n<style>\n@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600&display=swap');\n* { box-sizing: border-box; }\nbody { font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #181818; color: #cccccc; }\n.container { text-align: center; padding: 48px 56px; background: #1f1f1f; border: 1px solid #2b2b2b; border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,0.4); max-width: 420px; }\n.icon-container { width: 72px; height: 72px; margin: 0 auto 24px; background: rgba(241, 76, 76, 0.15); border-radius: 50%; display: flex; align-items: center; justify-content: center; }\n.error-icon { width: 40px; height: 40px; }\nh1 { margin: 0 0 12px 0; font-weight: 600; font-size: 20px; color: #f14c4c; }\np { margin: 0; font-size: 14px; color: #b4b4b4; line-height: 1.5; }\n.hint { margin-top: 16px; font-size: 13px; color: #6e6e6e; }\n.brand { margin-top: 24px; padding-top: 20px; border-top: 1px solid #2b2b2b; }\n.brand-text { font-size: 12px; color: #0078d4; font-weight: 500; letter-spacing: 0.5px; }\n</style>\n</head>\n<body>\n<div class=\"container\">\n<div class=\"icon-container\">\n<svg class=\"error-icon\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#f14c4c\" stroke-width=\"2.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\">\n<circle cx=\"12\" cy=\"12\" r=\"10\"/><path d=\"M15 9l-6 6M9 9l6 6\"/>\n</svg>\n</div>\n<h1>Sign In Failed</h1>\n<p>".concat(message, "</p>\n<p class=\"hint\">You can close this window and try again.</p>\n<div class=\"brand\"><span class=\"brand-text\">BluePLM</span></div>\n</div>\n<script>setTimeout(() => window.close(), 5000);</script>\n</body>\n</html>");
}
function getHashExtractHtml() {
    return "<!DOCTYPE html>\n<html>\n<head><title>Completing Sign In...</title>\n<style>\n@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600&display=swap');\n* { box-sizing: border-box; }\nbody { font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #181818; color: #cccccc; }\n.container { text-align: center; padding: 48px 56px; background: #1f1f1f; border: 1px solid #2b2b2b; border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,0.4); max-width: 420px; }\n.spinner { width: 48px; height: 48px; border: 3px solid #2b2b2b; border-top-color: #0078d4; border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 24px; }\n@keyframes spin { to { transform: rotate(360deg); } }\nh1 { margin: 0 0 8px 0; font-weight: 600; font-size: 20px; color: #cccccc; }\np { margin: 0; font-size: 14px; color: #6e6e6e; }\n.hidden { display: none; }\n.icon-container { width: 72px; height: 72px; margin: 0 auto 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; }\n.icon-container.success { background: rgba(74, 222, 128, 0.15); }\n.icon-container.error { background: rgba(241, 76, 76, 0.15); }\n.icon { width: 40px; height: 40px; }\n.error-title { color: #f14c4c; }\n.brand { margin-top: 24px; padding-top: 20px; border-top: 1px solid #2b2b2b; }\n.brand-text { font-size: 12px; color: #0078d4; font-weight: 500; letter-spacing: 0.5px; }\n</style>\n</head>\n<body>\n<div class=\"container\">\n<div id=\"loading\">\n<div class=\"spinner\"></div>\n<h1>Completing Sign In...</h1>\n<p>Please wait a moment.</p>\n</div>\n<div id=\"success\" class=\"hidden\">\n<div class=\"icon-container success\">\n<svg class=\"icon\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#4ade80\" stroke-width=\"2.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\">\n<path d=\"M20 6L9 17l-5-5\"/>\n</svg>\n</div>\n<h1>Sign In Successful</h1>\n<p>You can close this window and return to the app.</p>\n</div>\n<div id=\"error\" class=\"hidden\">\n<div class=\"icon-container error\">\n<svg class=\"icon\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#f14c4c\" stroke-width=\"2.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\">\n<circle cx=\"12\" cy=\"12\" r=\"10\"/><path d=\"M15 9l-6 6M9 9l6 6\"/>\n</svg>\n</div>\n<h1 class=\"error-title\">Sign In Issue</h1>\n<p id=\"errorMsg\">Could not complete sign in. Please try again.</p>\n</div>\n<div class=\"brand\"><span class=\"brand-text\">BluePLM</span></div>\n</div>\n<script>\n(async function() {\nconst showSuccess = () => { document.getElementById('loading').classList.add('hidden'); document.getElementById('success').classList.remove('hidden'); setTimeout(() => window.close(), 2000); };\nconst showError = (msg) => { document.getElementById('loading').classList.add('hidden'); document.getElementById('error').classList.remove('hidden'); if (msg) document.getElementById('errorMsg').textContent = msg; setTimeout(() => window.close(), 5000); };\ntry {\nconst hash = window.location.hash.substring(1);\nif (!hash) { showError('No authentication data received.'); return; }\nconst params = new URLSearchParams(hash);\nconst error = params.get('error');\nif (error) { showError(params.get('error_description') || error); return; }\nconst accessToken = params.get('access_token');\nconst refreshToken = params.get('refresh_token');\nif (!accessToken) { showError('No access token received.'); return; }\nif (!refreshToken) { showError('No refresh token received.'); return; }\nconst response = await fetch('/auth/tokens?' + hash, { method: 'GET', cache: 'no-cache' });\nif (response.ok) { showSuccess(); } else { showError('Server error.'); }\n} catch (err) { showError('An unexpected error occurred.'); }\n})();\n</script>\n</body>\n</html>";
}
function getGoogleSuccessHtml() {
    return "<!DOCTYPE html>\n<html>\n<head><title>Google Drive Connected</title>\n<style>\n@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600&display=swap');\n* { box-sizing: border-box; }\nbody { font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #181818; color: #cccccc; }\n.container { text-align: center; padding: 48px 56px; background: #1f1f1f; border: 1px solid #2b2b2b; border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,0.4); }\n.icon-container { width: 72px; height: 72px; margin: 0 auto 24px; background: rgba(74, 222, 128, 0.15); border-radius: 50%; display: flex; align-items: center; justify-content: center; }\n.checkmark { width: 40px; height: 40px; }\nh1 { margin: 0 0 8px 0; font-weight: 600; font-size: 20px; color: #4ade80; }\np { margin: 0; font-size: 14px; color: #6e6e6e; }\n.brand { margin-top: 24px; padding-top: 20px; border-top: 1px solid #2b2b2b; }\n.brand-text { font-size: 12px; color: #0078d4; font-weight: 500; letter-spacing: 0.5px; }\n</style>\n</head>\n<body>\n<div class=\"container\">\n<div class=\"icon-container\">\n<svg class=\"checkmark\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#4ade80\" stroke-width=\"2.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\">\n<path d=\"M20 6L9 17l-5-5\"/>\n</svg>\n</div>\n<h1>Google Drive Connected</h1>\n<p>You can close this window.</p>\n<div class=\"brand\"><span class=\"brand-text\">BluePLM</span></div>\n</div>\n<script>setTimeout(() => window.close(), 2000);</script>\n</body>\n</html>";
}
function getGoogleErrorHtml(error) {
    return "<!DOCTYPE html>\n<html>\n<head><title>Google Drive - Error</title>\n<style>\n@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600&display=swap');\n* { box-sizing: border-box; }\nbody { font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #181818; color: #cccccc; }\n.container { text-align: center; padding: 48px 56px; background: #1f1f1f; border: 1px solid #2b2b2b; border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,0.4); max-width: 420px; }\n.icon-container { width: 72px; height: 72px; margin: 0 auto 24px; background: rgba(241, 76, 76, 0.15); border-radius: 50%; display: flex; align-items: center; justify-content: center; }\n.error-icon { width: 40px; height: 40px; }\nh1 { margin: 0 0 12px 0; font-weight: 600; font-size: 20px; color: #f14c4c; }\np { margin: 0; font-size: 14px; color: #b4b4b4; line-height: 1.5; }\n.hint { margin-top: 16px; font-size: 13px; color: #6e6e6e; }\n.brand { margin-top: 24px; padding-top: 20px; border-top: 1px solid #2b2b2b; }\n.brand-text { font-size: 12px; color: #0078d4; font-weight: 500; letter-spacing: 0.5px; }\n</style>\n</head>\n<body>\n<div class=\"container\">\n<div class=\"icon-container\">\n<svg class=\"error-icon\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#f14c4c\" stroke-width=\"2.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\">\n<circle cx=\"12\" cy=\"12\" r=\"10\"/><path d=\"M15 9l-6 6M9 9l6 6\"/>\n</svg>\n</div>\n<h1>Authentication Failed</h1>\n<p>".concat(error, "</p>\n<p class=\"hint\">You can close this window.</p>\n<div class=\"brand\"><span class=\"brand-text\">BluePLM</span></div>\n</div>\n</body>\n</html>");
}
export function unregisterOAuthHandlers() {
    cleanupOAuthServer();
    var handlers = [
        'auth:open-oauth-window',
        'auth:google-drive'
    ];
    for (var _i = 0, handlers_1 = handlers; _i < handlers_1.length; _i++) {
        var handler = handlers_1[_i];
        ipcMain.removeHandler(handler);
    }
}
