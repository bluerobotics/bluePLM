/**
 * Windows-only eDrawings preview host.
 *
 * The standalone eDrawings application cannot reliably be re-parented beneath
 * Chromium. Instead this addon launches BluePLM's own small WinForms/OLE host,
 * which creates the registered eDrawings ActiveX control in an STA message loop.
 * The host remains a borderless owned overlay of Electron so eDrawings keeps
 * a valid renderer while it is visually confined to the preview panel.
 */

#define NAPI_VERSION 8
#include <napi.h>
#include <windows.h>
#include <fstream>
#include <sstream>
#include <string>

#pragma comment(lib, "user32.lib")
namespace {

std::wstring utf8ToWide(const std::string& value) {
    if (value.empty()) return L"";
    const int length = MultiByteToWideChar(CP_UTF8, 0, value.c_str(), -1, nullptr, 0);
    if (length <= 1) return L"";
    std::wstring result(static_cast<size_t>(length), L'\0');
    MultiByteToWideChar(CP_UTF8, 0, value.c_str(), -1, &result[0], length);
    result.pop_back();
    return result;
}

std::wstring quote(const std::wstring& value) {
    return L"\"" + value + L"\"";
}

std::wstring configuredHostMode() {
    wchar_t value[32]{};
    const DWORD length = GetEnvironmentVariableW(L"BLUEPLM_EDRAWINGS_HOST_MODE", value, static_cast<DWORD>(std::size(value)));
    return length > 0 && _wcsicmp(value, L"browser") == 0 ? L"browser" : L"direct";
}

std::wstring configuredEmbeddingMode() {
    wchar_t value[32]{};
    const DWORD length = GetEnvironmentVariableW(L"BLUEPLM_EDRAWINGS_EMBEDDING", value, static_cast<DWORD>(std::size(value)));
    return length > 0 && _wcsicmp(value, L"child") == 0 ? L"child" : L"owned";
}

std::string lastErrorMessage(DWORD error) {
    std::ostringstream message;
    message << "Windows error " << error;
    return message.str();
}

class EDrawingsPreview : public Napi::ObjectWrap<EDrawingsPreview> {
public:
    static Napi::Object Init(Napi::Env env, Napi::Object exports) {
        Napi::Function constructor = DefineClass(env, "EDrawingsPreview", {
            InstanceMethod("attachToWindow", &EDrawingsPreview::AttachToWindow),
            InstanceMethod("loadFile", &EDrawingsPreview::LoadFile),
            InstanceMethod("setBounds", &EDrawingsPreview::SetBounds),
            InstanceMethod("show", &EDrawingsPreview::Show),
            InstanceMethod("hide", &EDrawingsPreview::Hide),
            InstanceMethod("destroy", &EDrawingsPreview::Destroy),
            InstanceMethod("isLoaded", &EDrawingsPreview::IsLoaded),
            InstanceMethod("getVisualState", &EDrawingsPreview::GetVisualState),
            InstanceMethod("getWindowState", &EDrawingsPreview::GetWindowState),
            InstanceMethod("lastError", &EDrawingsPreview::LastError),
        });
        exports.Set("EDrawingsPreview", constructor);
        return exports;
    }

    explicit EDrawingsPreview(const Napi::CallbackInfo& info)
        : Napi::ObjectWrap<EDrawingsPreview>(info) {}

    ~EDrawingsPreview() override { DestroyViewer(); }

private:
    Napi::Value AttachToWindow(const Napi::CallbackInfo& info) {
        Napi::Env env = info.Env();
        HWND host = nullptr;
        if (info.Length() > 0 && info[0].IsBuffer()) {
            const auto buffer = info[0].As<Napi::Buffer<uint8_t>>();
            if (buffer.Length() >= sizeof(HWND)) host = *reinterpret_cast<HWND*>(buffer.Data());
        } else if (info.Length() > 0 && info[0].IsNumber()) {
            host = reinterpret_cast<HWND>(info[0].As<Napi::Number>().Int64Value());
        }
        if (!host || !IsWindow(host)) {
            m_lastError = "The BluePLM window handle is invalid.";
            return Napi::Boolean::New(env, false);
        }
        // Electron should already return its top-level HWND, but Chromium can
        // expose an intermediate child on some Windows/remote-session builds.
        // Ownership only works for a real top-level window, so normalize it.
        const HWND root = GetAncestor(host, GA_ROOT);
        m_host = root && IsWindow(root) ? root : host;
        m_lastError.clear();
        return Napi::Boolean::New(env, true);
    }

    Napi::Value LoadFile(const Napi::CallbackInfo& info) {
        Napi::Env env = info.Env();
        if (!m_host || info.Length() < 2 || !info[0].IsString() || !info[1].IsString()) {
            m_lastError = "The embedded preview was not initialized correctly.";
            return Napi::Boolean::New(env, false);
        }
        const std::wstring filePath = utf8ToWide(info[0].As<Napi::String>().Utf8Value());
        const std::wstring hostExecutablePath = utf8ToWide(info[1].As<Napi::String>().Utf8Value());
        if (filePath.empty() || hostExecutablePath.empty()) {
            m_lastError = "The file path or eDrawings host path is empty.";
            return Napi::Boolean::New(env, false);
        }

        DestroyViewer();
        m_lastError.clear();
        m_handleFile = CreateHandleFile();
        if (m_handleFile.empty()) {
            m_lastError = "Could not create the eDrawings host handshake file.";
            return Napi::Boolean::New(env, false);
        }
        std::wstring commandLine = quote(hostExecutablePath) + L" --file " + quote(filePath) +
            L" --handle-file " + quote(m_handleFile) +
            L" --mode " + configuredHostMode() +
            L" --embedding " + configuredEmbeddingMode() +
            L" --parent " + std::to_wstring(reinterpret_cast<uintptr_t>(m_host)) +
            L" --bounds " + std::to_wstring(m_x) + L" " + std::to_wstring(m_y) + L" " +
            std::to_wstring(m_width) + L" " + std::to_wstring(m_height);
        STARTUPINFOW startup{};
        startup.cb = sizeof(startup);
        PROCESS_INFORMATION process{};
        if (!CreateProcessW(hostExecutablePath.c_str(), commandLine.data(), nullptr, nullptr, FALSE,
                CREATE_NEW_PROCESS_GROUP, nullptr, nullptr, &startup, &process)) {
            m_lastError = "Could not start the eDrawings preview host (" + lastErrorMessage(GetLastError()) + ").";
            return Napi::Boolean::New(env, false);
        }

        m_process = process.hProcess;
        m_pid = process.dwProcessId;
        m_ownedEmbedding = configuredEmbeddingMode() == L"owned";
        CloseHandle(process.hThread);
        // The host publishes its HWND before it enters OpenDoc.  We must not
        // enumerate child windows or read window titles here: both operations
        // synchronously message the STA/OLE thread and can wait for the CAD
        // renderer for tens of seconds.
        for (int attempt = 0; attempt < 20 && !m_viewer; ++attempt) {
            ResolveHostWindow();
            if (!m_viewer) Sleep(10);
        }
        m_lastError.clear();
        return Napi::Boolean::New(env, true);
    }

    Napi::Value SetBounds(const Napi::CallbackInfo& info) {
        Napi::Env env = info.Env();
        if (info.Length() < 4 || !info[0].IsNumber() || !info[1].IsNumber() ||
            !info[2].IsNumber() || !info[3].IsNumber()) return Napi::Boolean::New(env, false);
        m_x = info[0].As<Napi::Number>().Int32Value();
        m_y = info[1].As<Napi::Number>().Int32Value();
        m_width = info[2].As<Napi::Number>().Int32Value();
        m_height = info[3].As<Napi::Number>().Int32Value();
        ResolveHostWindow();
        return Napi::Boolean::New(env, !m_viewer || SetBoundsInternal());
    }

    Napi::Value Show(const Napi::CallbackInfo& info) {
        if (!m_process) return Napi::Boolean::New(info.Env(), false);
        ResolveHostWindow();
        // The STA host can be inside a long-running OpenDoc call.  The normal
        // ShowWindow path may synchronously message that UI thread and freeze
        // Electron's main process, so presentation must be posted instead.
        if (m_viewer) ShowWindowAsync(m_viewer, SW_SHOW);
        return Napi::Boolean::New(info.Env(), true);
    }

    Napi::Value Hide(const Napi::CallbackInfo& info) {
        if (m_viewer) ShowWindowAsync(m_viewer, SW_HIDE);
        return Napi::Boolean::New(info.Env(), true);
    }

    Napi::Value Destroy(const Napi::CallbackInfo& info) {
        DestroyViewer();
        return Napi::Boolean::New(info.Env(), true);
    }

    Napi::Value IsLoaded(const Napi::CallbackInfo& info) {
        ResolveHostWindow();
        // The host deliberately embeds itself below Electron before this
        // method can inspect its child hierarchy.  Window discovery is useful
        // for moving the preview, but it is not a reliable liveness check for
        // an already embedded form.  The dedicated host process is the source
        // of truth here: a live process means the OLE preview was launched.
        const bool processRunning = m_process && WaitForSingleObject(m_process, 0) == WAIT_TIMEOUT;
        return Napi::Boolean::New(info.Env(), processRunning);
    }

    // Test-only diagnostic seam.  The historic liveness check above can be
    // true while eDrawings has failed to paint anything after its window was
    // embedded below Chromium.  Sampling the *visible desktop pixels* in the
    // exact preview rectangle gives the integration harness a red-capable
    // signal without treating a live helper process as proof of rendering.
    Napi::Value GetVisualState(const Napi::CallbackInfo& info) {
        Napi::Env env = info.Env();
        Napi::Object result = Napi::Object::New(env);
        result.Set("available", Napi::Boolean::New(env, false));

        if (!m_host || !IsWindow(m_host) || m_width < 1 || m_height < 1) {
            return result;
        }

        POINT origin{m_x, m_y};
        if (!ClientToScreen(m_host, &origin)) {
            m_lastError = "Could not translate the eDrawings preview bounds to screen coordinates.";
            return result;
        }

        HDC desktop = GetDC(nullptr);
        if (!desktop) {
            m_lastError = "Could not capture the visible eDrawings preview region.";
            return result;
        }

        // GetPixel can be unexpectedly expensive through remote-desktop and
        // GPU composition. A sparse grid is sufficient to distinguish the
        // uniformly blank viewport from a loaded model and keeps the harness
        // practical after eDrawings' own long document-load phase.
        constexpr int columns = 12;
        constexpr int rows = 9;
        int sampled = 0;
        int nearBlack = 0;
        int bright = 0;
        unsigned long long luminanceSum = 0;
        unsigned long long luminanceSquaredSum = 0;

        for (int row = 0; row < rows; ++row) {
            for (int column = 0; column < columns; ++column) {
                const int x = origin.x + ((column * (m_width - 1)) / (columns - 1));
                const int y = origin.y + ((row * (m_height - 1)) / (rows - 1));
                const COLORREF pixel = GetPixel(desktop, x, y);
                if (pixel == CLR_INVALID) continue;
                const int red = GetRValue(pixel);
                const int green = GetGValue(pixel);
                const int blue = GetBValue(pixel);
                const int luminance = (red * 54 + green * 183 + blue * 19) / 256;
                ++sampled;
                if (red < 30 && green < 30 && blue < 30) ++nearBlack;
                if (luminance > 80) ++bright;
                luminanceSum += static_cast<unsigned long long>(luminance);
                luminanceSquaredSum += static_cast<unsigned long long>(luminance) * luminance;
            }
        }
        ReleaseDC(nullptr, desktop);

        if (sampled == 0) return result;
        const double average = static_cast<double>(luminanceSum) / sampled;
        const double variance = static_cast<double>(luminanceSquaredSum) / sampled - average * average;
        result.Set("available", Napi::Boolean::New(env, true));
        result.Set("samples", Napi::Number::New(env, sampled));
        result.Set("nearBlackRatio", Napi::Number::New(env, static_cast<double>(nearBlack) / sampled));
        result.Set("brightRatio", Napi::Number::New(env, static_cast<double>(bright) / sampled));
        result.Set("averageLuminance", Napi::Number::New(env, average));
        result.Set("luminanceVariance", Napi::Number::New(env, variance));
        return result;
    }

    // Diagnostic seam used by the integration harness to verify ownership and
    // visibility across Electron window lifecycle transitions.  A live helper
    // process is not enough: the exact regression left its top-level preview
    // visible after the BluePLM owner had been minimized.
    Napi::Value GetWindowState(const Napi::CallbackInfo& info) {
        ResolveHostWindow();
        Napi::Object result = Napi::Object::New(info.Env());
        const bool exists = m_viewer && IsWindow(m_viewer);
        const HWND owner = exists ? GetWindow(m_viewer, GW_OWNER) : nullptr;
        result.Set("exists", Napi::Boolean::New(info.Env(), exists));
        result.Set("visible", Napi::Boolean::New(info.Env(), exists && IsWindowVisible(m_viewer)));
        result.Set("ownedByHost", Napi::Boolean::New(
            info.Env(),
            exists && owner == m_host));
        result.Set("hostHandle", Napi::String::New(
            info.Env(), std::to_string(reinterpret_cast<uintptr_t>(m_host))));
        result.Set("ownerHandle", Napi::String::New(
            info.Env(), std::to_string(reinterpret_cast<uintptr_t>(owner))));
        const LONG_PTR extendedStyle = exists ? GetWindowLongPtrW(m_viewer, GWL_EXSTYLE) : 0;
        result.Set("topmost", Napi::Boolean::New(info.Env(), (extendedStyle & WS_EX_TOPMOST) != 0));
        return result;
    }

    Napi::Value LastError(const Napi::CallbackInfo& info) {
        return Napi::String::New(info.Env(), m_lastError);
    }

    bool SetBoundsInternal() {
        if (!m_viewer) return false;
        POINT origin{m_x, m_y};
        if (m_ownedEmbedding && !ClientToScreen(m_host, &origin)) return false;
        return SetWindowPos(m_viewer, HWND_TOP, origin.x, origin.y,
            m_width > 0 ? m_width : 1, m_height > 0 ? m_height : 1,
            SWP_NOACTIVATE | SWP_SHOWWINDOW | SWP_ASYNCWINDOWPOS) != FALSE;
    }

    static std::wstring CreateHandleFile() {
        wchar_t tempDirectory[MAX_PATH]{};
        wchar_t tempFile[MAX_PATH]{};
        if (!GetTempPathW(MAX_PATH, tempDirectory) || !GetTempFileNameW(tempDirectory, L"BPH", 0, tempFile)) return L"";
        return tempFile;
    }

    void ResolveHostWindow() {
        if (m_viewer && IsWindow(m_viewer)) return;
        if (m_handleFile.empty()) return;
        std::wifstream input(m_handleFile);
        unsigned long long value = 0;
        input >> value;
        if (input && value != 0) {
            const HWND candidate = reinterpret_cast<HWND>(static_cast<uintptr_t>(value));
            if (IsWindow(candidate)) m_viewer = candidate;
        }
    }

    void DestroyViewer() {
        if (m_viewer && IsWindow(m_viewer)) {
            PostMessageW(m_viewer, WM_CLOSE, 0, 0);
            ShowWindowAsync(m_viewer, SW_HIDE);
        }
        if (m_process) {
            // OpenDoc can keep the ActiveX UI thread busy, which prevents the
            // form from handling WM_CLOSE. This is a private short-lived host
            // process created solely for this preview, so force it down after
            // a graceful close window to avoid orphaned eDrawings hosts.
            if (WaitForSingleObject(m_process, 1000) == WAIT_TIMEOUT) {
                TerminateProcess(m_process, 0);
                WaitForSingleObject(m_process, 1000);
            }
            CloseHandle(m_process);
        }
        m_process = nullptr;
        m_pid = 0;
        m_viewer = nullptr;
        if (!m_handleFile.empty()) DeleteFileW(m_handleFile.c_str());
        m_handleFile.clear();
    }

    HWND m_host = nullptr;
    HWND m_viewer = nullptr;
    HANDLE m_process = nullptr;
    DWORD m_pid = 0;
    int m_x = 0;
    int m_y = 0;
    int m_width = 1;
    int m_height = 1;
    std::wstring m_handleFile;
    bool m_ownedEmbedding = false;
    std::string m_lastError;
};

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    return EDrawingsPreview::Init(env, exports);
}

} // namespace

NODE_API_MODULE(edrawings_preview, Init)
