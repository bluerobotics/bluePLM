/**
 * Windows-only eDrawings preview host bridge.
 *
 * Loading an ActiveX document can block its STA for minutes. Nothing that
 * waits for that process runs in Node/Electron's main thread.
 */

#define NAPI_VERSION 8
#include <napi.h>
#include <windows.h>

#include "host_status_parser.h"
#include "process_exit_wait.h"

#include <atomic>
#include <chrono>
#include <memory>
#include <mutex>
#include <sstream>
#include <string>
#include <thread>

#pragma comment(lib, "user32.lib")

namespace {

constexpr DWORD HANDSHAKE_TIMEOUT_MS = 10'000;
constexpr DWORD DOCUMENT_TIMEOUT_MS = 60'000;
constexpr DWORD STATUS_POLL_INTERVAL_MS = 25;
constexpr LONGLONG MAX_STATUS_FILE_BYTES = 4'096;

std::wstring utf8ToWide(const std::string& value) {
    if (value.empty()) return L"";
    const int length = MultiByteToWideChar(CP_UTF8, 0, value.c_str(), -1, nullptr, 0);
    if (length <= 1) return L"";
    std::wstring result(static_cast<size_t>(length), L'\0');
    MultiByteToWideChar(CP_UTF8, 0, value.c_str(), -1, &result[0], length);
    result.pop_back();
    return result;
}

std::string wideToUtf8(const std::wstring& value) {
    if (value.empty()) return "";
    const int length = WideCharToMultiByte(CP_UTF8, 0, value.c_str(), -1, nullptr, 0, nullptr, nullptr);
    if (length <= 1) return "";
    std::string result(static_cast<size_t>(length), '\0');
    WideCharToMultiByte(CP_UTF8, 0, value.c_str(), -1, &result[0], length, nullptr, nullptr);
    result.pop_back();
    return result;
}

std::wstring quote(const std::wstring& value) { return L"\"" + value + L"\""; }

std::string lastErrorMessage(DWORD error) {
    std::ostringstream message;
    message << "Windows error " << error;
    return message.str();
}

std::wstring createStatusFile() {
    wchar_t tempDirectory[MAX_PATH]{};
    wchar_t statusFile[MAX_PATH]{};
    if (!GetTempPathW(MAX_PATH, tempDirectory) || !GetTempFileNameW(tempDirectory, L"BPH", 0, statusFile)) return L"";
    return statusFile;
}

#ifdef BLUEPLM_EDRAWINGS_VERIFY
struct ChildWindowProbe {
    int visibleCount = 0;
    HWND firstVisible = nullptr;
    RECT firstWindowRect{};
    RECT firstClientRect{};
};

BOOL CALLBACK captureVisibleChild(HWND child, LPARAM parameter) {
    auto* probe = reinterpret_cast<ChildWindowProbe*>(parameter);
    if (!IsWindowVisible(child)) return TRUE;
    ++probe->visibleCount;
    if (!probe->firstVisible) {
        probe->firstVisible = child;
        GetWindowRect(child, &probe->firstWindowRect);
        GetClientRect(child, &probe->firstClientRect);
    }
    return TRUE;
}
#endif

HostStatus readStatusFile(const std::wstring& statusPath, DWORD expectedProcessId) {
    HANDLE file = CreateFileW(
        statusPath.c_str(),
        GENERIC_READ,
        FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
        nullptr,
        OPEN_EXISTING,
        FILE_ATTRIBUTE_NORMAL,
        nullptr);
    if (file == INVALID_HANDLE_VALUE) return {};

    LARGE_INTEGER fileSize{};
    if (!GetFileSizeEx(file, &fileSize) || fileSize.QuadPart <= 0 ||
        fileSize.QuadPart > MAX_STATUS_FILE_BYTES) {
        CloseHandle(file);
        return {};
    }

    std::string encodedContent(static_cast<size_t>(fileSize.QuadPart), '\0');
    DWORD bytesRead = 0;
    const bool readSucceeded = ReadFile(
        file,
        encodedContent.data(),
        static_cast<DWORD>(encodedContent.size()),
        &bytesRead,
        nullptr) != FALSE;
    CloseHandle(file);
    if (!readSucceeded || bytesRead != encodedContent.size()) return {};

    HostStatus status = parseHostStatusText(utf8ToWide(encodedContent));
    if (status.kind == HostStatus::Kind::None || !status.window) return status;

    DWORD ownerProcessId = 0;
    if (!IsWindow(status.window) ||
        GetWindowThreadProcessId(status.window, &ownerProcessId) == 0 ||
        ownerProcessId != expectedProcessId) {
        if (status.kind != HostStatus::Kind::Failed) return {};
        status.window = nullptr;
    }
    return status;
}

void closeJobHandle(HANDLE& job) {
    if (job) {
        CloseHandle(job);
        job = nullptr;
    }
}

struct PreviewState {
    std::mutex mutex;
    HWND host = nullptr;
    HWND viewer = nullptr;
    int x = 0;
    int y = 0;
    int width = 1;
    int height = 1;
    HANDLE job = nullptr;
    uint64_t generation = 0;
    bool ready = false;
    bool terminalFailure = false;
    std::string asyncLastError;
    std::string openDocumentResult;
    std::shared_ptr<std::atomic_bool> cancellation;
    std::unique_ptr<ProcessExitWait> exitWait;

    uint64_t beginOperation() {
        std::unique_ptr<ProcessExitWait> previousExitWait;
        HANDLE previousJob = nullptr;
        uint64_t nextGeneration = 0;
        {
            std::lock_guard lock(mutex);
            if (cancellation) cancellation->store(true);
            previousExitWait = std::move(exitWait);
            previousJob = job;
            job = nullptr;
            viewer = nullptr;
            ready = false;
            terminalFailure = false;
            asyncLastError.clear();
            cancellation = std::make_shared<std::atomic_bool>(false);
            nextGeneration = ++generation;
        }
        // Unregister and drain the callback without holding PreviewState::mutex;
        // an already-running callback may be waiting to inspect this state.
        previousExitWait.reset();
        closeJobHandle(previousJob);
        return nextGeneration;
    }

    void cancelOperation() {
        std::unique_ptr<ProcessExitWait> previousExitWait;
        HANDLE previousJob = nullptr;
        {
            std::lock_guard lock(mutex);
            if (cancellation) cancellation->store(true);
            previousExitWait = std::move(exitWait);
            previousJob = job;
            job = nullptr;
            viewer = nullptr;
            ready = false;
            terminalFailure = false;
            ++generation;
        }
        previousExitWait.reset();
        closeJobHandle(previousJob);
    }

    bool isCurrent(uint64_t candidate) {
        std::lock_guard lock(mutex);
        return generation == candidate && cancellation && !cancellation->load();
    }

    void attachJob(uint64_t candidate, HANDLE candidateJob) {
        std::lock_guard lock(mutex);
        if (generation == candidate && cancellation && !cancellation->load()) {
            job = candidateJob;
            return;
        }
        CloseHandle(candidateJob);
    }

    bool attachExitWait(uint64_t candidate, std::unique_ptr<ProcessExitWait> candidateWait) {
        std::lock_guard lock(mutex);
        if (generation != candidate ||
            !cancellation ||
            cancellation->load() ||
            !ready ||
            exitWait) {
            return false;
        }
        exitWait = std::move(candidateWait);
        return true;
    }

    void handleProcessExit(uint64_t candidate) {
        HANDLE completedJob = nullptr;
        {
            std::lock_guard lock(mutex);
            if (generation != candidate || !cancellation || cancellation->load()) return;
            ready = false;
            viewer = nullptr;
            terminalFailure = true;
            asyncLastError = "The eDrawings preview host exited.";
            completedJob = job;
            job = nullptr;
        }
        closeJobHandle(completedJob);
    }

    void handleViewerUnavailable(uint64_t candidate, HWND candidateViewer) {
        HANDLE completedJob = nullptr;
        {
            std::lock_guard lock(mutex);
            if (generation != candidate || viewer != candidateViewer) return;
            ready = false;
            viewer = nullptr;
            terminalFailure = true;
            asyncLastError = "The eDrawings preview host exited.";
            completedJob = job;
            job = nullptr;
        }
        // Closing the kill-on-close job also terminates a host whose top-level
        // window disappeared before the registered process callback ran.
        closeJobHandle(completedJob);
    }

    void finish(uint64_t candidate, HWND candidateViewer, bool succeeded, const std::string& message, const std::string& openDocumentResult) {
        std::lock_guard lock(mutex);
        if (generation != candidate) return;
        viewer = candidateViewer;
        ready = succeeded;
        terminalFailure = !succeeded;
        asyncLastError = succeeded ? "" : message;
        this->openDocumentResult = openDocumentResult;
        // A successful host must remain in its kill-on-close job until destroy.
        // A failed/timed-out host is torn down immediately.
        if (!succeeded) closeJobHandle(job);
    }
};

class LoadWorker final : public Napi::AsyncWorker {
public:
    LoadWorker(Napi::Env env, Napi::Promise::Deferred deferred, std::shared_ptr<PreviewState> state,
        uint64_t generation, std::wstring filePath, std::wstring hostExecutablePath)
        : Napi::AsyncWorker(env), m_deferred(deferred), m_state(std::move(state)), m_generation(generation),
          m_filePath(std::move(filePath)), m_hostExecutablePath(std::move(hostExecutablePath)) {}

    ~LoadWorker() override {
        if (m_monitorProcess) CloseHandle(m_monitorProcess);
    }

    void Execute() override {
        if (!m_state->isCurrent(m_generation)) {
            fail("preview-host-exited", "The eDrawings preview request was cancelled.");
            return;
        }
        m_statusPath = createStatusFile();
        if (m_statusPath.empty()) {
            fail("preview-host-handshake-failed", "Could not create the eDrawings host status file.");
            return;
        }

        HWND hostWindow = nullptr;
        int x = 0, y = 0, width = 1, height = 1;
        std::shared_ptr<std::atomic_bool> cancellation;
        {
            std::lock_guard lock(m_state->mutex);
            hostWindow = m_state->host;
            x = m_state->x;
            y = m_state->y;
            width = m_state->width;
            height = m_state->height;
            cancellation = m_state->cancellation;
        }
        if (!hostWindow || !cancellation || cancellation->load()) {
            fail("preview-host-exited", "The eDrawings preview request was cancelled.");
            cleanupStatusFile();
            return;
        }

        std::wstring commandLine = quote(m_hostExecutablePath) + L" --file " + quote(m_filePath) +
            L" --status-file " + quote(m_statusPath) + L" --parent " +
            std::to_wstring(reinterpret_cast<uintptr_t>(hostWindow)) + L" --bounds " +
            std::to_wstring(x) + L" " + std::to_wstring(y) + L" " + std::to_wstring(width) + L" " + std::to_wstring(height);
        STARTUPINFOW startup{};
        startup.cb = sizeof(startup);
        startup.dwFlags = STARTF_USESHOWWINDOW;
        // The WinForms host calls ShowWindow during startup. STARTF_USESHOWWINDOW
        // makes this SW_HIDE override that first show until the renderer has
        // current bounds and confirms that no overlay covers the native window.
        startup.wShowWindow = SW_HIDE;
        PROCESS_INFORMATION process{};
        if (!CreateProcessW(m_hostExecutablePath.c_str(), commandLine.data(), nullptr, nullptr, FALSE,
                CREATE_NEW_PROCESS_GROUP | CREATE_SUSPENDED, nullptr, nullptr, &startup, &process)) {
            fail("preview-host-exited", "Could not start the eDrawings preview host (" + lastErrorMessage(GetLastError()) + ").");
            cleanupStatusFile();
            return;
        }

        HANDLE job = CreateJobObjectW(nullptr, nullptr);
        JOBOBJECT_EXTENDED_LIMIT_INFORMATION limits{};
        limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        if (!job || !SetInformationJobObject(job, JobObjectExtendedLimitInformation, &limits, sizeof(limits)) ||
            !AssignProcessToJobObject(job, process.hProcess)) {
            TerminateProcess(process.hProcess, 0);
            if (job) CloseHandle(job);
            CloseHandle(process.hThread);
            CloseHandle(process.hProcess);
            fail("preview-host-exited", "Could not place the eDrawings preview host in its cleanup job.");
            cleanupStatusFile();
            return;
        }
        m_state->attachJob(m_generation, job);
        if (!m_state->isCurrent(m_generation) || ResumeThread(process.hThread) == static_cast<DWORD>(-1)) {
            CloseHandle(process.hThread);
            CloseHandle(process.hProcess);
            fail("preview-host-exited", "The eDrawings preview request was cancelled before the host could start.");
            m_state->finish(m_generation, nullptr, false, m_message, "");
            cleanupStatusFile();
            return;
        }
        CloseHandle(process.hThread);

        const auto started = std::chrono::steady_clock::now();
        bool handshakeReceived = false;
        HWND viewer = nullptr;
        std::string openDocumentResult;
        while (m_state->isCurrent(m_generation)) {
            const HostStatus status = readStatusFile(m_statusPath, process.dwProcessId);
            if (!status.detail.empty()) openDocumentResult = wideToUtf8(status.detail);
            if (status.kind == HostStatus::Kind::Handshake) {
                handshakeReceived = true;
                viewer = status.window;
            } else if (status.kind == HostStatus::Kind::Ready) {
                viewer = status.window;
                m_succeeded = true;
                break;
            } else if (status.kind == HostStatus::Kind::Failed) {
                viewer = status.window;
                const bool hostReachedDocumentLoad = handshakeReceived || status.window != nullptr;
                fail(hostReachedDocumentLoad ? "preview-document-load-failed" : "preview-host-handshake-failed",
                    hostReachedDocumentLoad
                        ? "The eDrawings host reported that the document could not be loaded."
                        : "The eDrawings preview host failed before completing its startup handshake.");
                break;
            }
            if (WaitForSingleObject(process.hProcess, 0) != WAIT_TIMEOUT) {
                const HostStatus finalStatus = readStatusFile(m_statusPath, process.dwProcessId);
                if (finalStatus.kind == HostStatus::Kind::Failed) {
                    viewer = finalStatus.window;
                    const bool hostReachedDocumentLoad = handshakeReceived || finalStatus.window != nullptr;
                    fail(hostReachedDocumentLoad ? "preview-document-load-failed" : "preview-host-handshake-failed",
                        hostReachedDocumentLoad
                            ? "The eDrawings host reported that the document could not be loaded."
                            : "The eDrawings preview host failed before completing its startup handshake.");
                } else {
                    fail(handshakeReceived ? "preview-host-exited" : "preview-host-handshake-failed",
                        "The eDrawings preview host exited before it became ready.");
                }
                break;
            }
            const auto elapsed = static_cast<DWORD>(std::chrono::duration_cast<std::chrono::milliseconds>(
                std::chrono::steady_clock::now() - started).count());
            if (!handshakeReceived && elapsed >= HANDSHAKE_TIMEOUT_MS) {
                fail("preview-host-handshake-failed", "The eDrawings preview host did not complete its startup handshake.");
                break;
            }
            if (elapsed >= DOCUMENT_TIMEOUT_MS) {
                fail("preview-host-timeout", "The eDrawings preview host did not finish loading the document in time.");
                break;
            }
            std::this_thread::sleep_for(std::chrono::milliseconds(STATUS_POLL_INTERVAL_MS));
        }
        if (!m_succeeded && m_errorCode.empty()) fail("preview-host-exited", "The eDrawings preview request was cancelled.");
        if (m_succeeded &&
            !DuplicateHandle(
                GetCurrentProcess(),
                process.hProcess,
                GetCurrentProcess(),
                &m_monitorProcess,
                SYNCHRONIZE,
                FALSE,
                0)) {
            m_succeeded = false;
            fail(
                "preview-host-exited",
                "Could not monitor the eDrawings preview host (" +
                    lastErrorMessage(GetLastError()) + ").");
        }
        m_state->finish(m_generation, viewer, m_succeeded, m_message, openDocumentResult);
        CloseHandle(process.hProcess);
        cleanupStatusFile();
    }

    void OnOK() override {
        if (m_succeeded && m_monitorProcess) {
            const std::weak_ptr<PreviewState> weakState = m_state;
            DWORD registrationError = ERROR_SUCCESS;
            auto exitWait = ProcessExitWait::create(
                m_monitorProcess,
                [weakState, generation = m_generation]() {
                    if (const auto state = weakState.lock()) {
                        state->handleProcessExit(generation);
                    }
                },
                registrationError);
            m_monitorProcess = nullptr;
            if (!exitWait || !m_state->attachExitWait(m_generation, std::move(exitWait))) {
                if (registrationError == ERROR_SUCCESS) {
                    registrationError = ERROR_OPERATION_ABORTED;
                }
                m_succeeded = false;
                fail(
                    "preview-host-exited",
                    "Could not register the eDrawings preview host exit monitor (" +
                        lastErrorMessage(registrationError) + ").");
                m_state->finish(m_generation, nullptr, false, m_message, "");
            }
        }
        Napi::Object result = Napi::Object::New(Env());
        result.Set("accepted", Napi::Boolean::New(Env(), m_succeeded));
        result.Set("ready", Napi::Boolean::New(Env(), m_succeeded));
        if (!m_errorCode.empty()) result.Set("errorCode", Napi::String::New(Env(), m_errorCode));
        m_deferred.Resolve(result);
    }

private:
    void fail(std::string code, std::string message) {
        if (m_errorCode.empty()) {
            m_errorCode = std::move(code);
            m_message = std::move(message);
        }
    }
    void cleanupStatusFile() { if (!m_statusPath.empty()) DeleteFileW(m_statusPath.c_str()); }

    Napi::Promise::Deferred m_deferred;
    std::shared_ptr<PreviewState> m_state;
    uint64_t m_generation;
    std::wstring m_filePath;
    std::wstring m_hostExecutablePath;
    std::wstring m_statusPath;
    HANDLE m_monitorProcess = nullptr;
    bool m_succeeded = false;
    std::string m_errorCode;
    std::string m_message;
};

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
#ifdef BLUEPLM_EDRAWINGS_VERIFY
            InstanceMethod("getVisualState", &EDrawingsPreview::GetVisualState),
            InstanceMethod("getWindowState", &EDrawingsPreview::GetWindowState),
#endif
            InstanceMethod("lastError", &EDrawingsPreview::LastError),
        });
        exports.Set("EDrawingsPreview", constructor);
        exports.Set("isAvailable", Napi::Function::New(env, IsAvailable));
        return exports;
    }

    explicit EDrawingsPreview(const Napi::CallbackInfo& info)
        : Napi::ObjectWrap<EDrawingsPreview>(info), m_state(std::make_shared<PreviewState>()) {}
    ~EDrawingsPreview() override { m_state->cancelOperation(); }

private:
    static Napi::Value IsAvailable(const Napi::CallbackInfo& info) {
        CLSID classId{};
        return Napi::Boolean::New(info.Env(), SUCCEEDED(CLSIDFromProgID(L"EModelView.EModelViewControl", &classId)));
    }

    Napi::Value AttachToWindow(const Napi::CallbackInfo& info) {
        HWND host = nullptr;
        if (info.Length() > 0 && info[0].IsBuffer()) {
            const auto buffer = info[0].As<Napi::Buffer<uint8_t>>();
            if (buffer.Length() >= sizeof(HWND)) host = *reinterpret_cast<HWND*>(buffer.Data());
        } else if (info.Length() > 0 && info[0].IsNumber()) {
            host = reinterpret_cast<HWND>(info[0].As<Napi::Number>().Int64Value());
        }
        if (!host || !IsWindow(host)) {
            m_lastError = "The BluePLM window handle is invalid.";
            return Napi::Boolean::New(info.Env(), false);
        }
        const HWND root = GetAncestor(host, GA_ROOT);
        std::lock_guard lock(m_state->mutex);
        m_state->host = root && IsWindow(root) ? root : host;
        m_lastError.clear();
        return Napi::Boolean::New(info.Env(), true);
    }

    Napi::Value LoadFile(const Napi::CallbackInfo& info) {
        Napi::Env env = info.Env();
        if (info.Length() < 2 || !info[0].IsString() || !info[1].IsString()) {
            m_lastError = "The embedded preview was not initialized correctly.";
            return Napi::Boolean::New(env, false);
        }
        const std::wstring filePath = utf8ToWide(info[0].As<Napi::String>().Utf8Value());
        const std::wstring hostExecutablePath = utf8ToWide(info[1].As<Napi::String>().Utf8Value());
        if (filePath.empty() || hostExecutablePath.empty()) {
            m_lastError = "The file path or eDrawings host path is empty.";
            return Napi::Boolean::New(env, false);
        }
        {
            std::lock_guard lock(m_state->mutex);
            if (!m_state->host) {
                m_lastError = "The embedded preview was not initialized correctly.";
                return Napi::Boolean::New(env, false);
            }
        }
        const uint64_t generation = m_state->beginOperation();
        m_lastError.clear();
        auto deferred = Napi::Promise::Deferred::New(env);
        auto* worker = new LoadWorker(env, deferred, m_state, generation, filePath, hostExecutablePath);
        worker->Queue();
        return deferred.Promise();
    }

    Napi::Value SetBounds(const Napi::CallbackInfo& info) {
        if (info.Length() < 4 ||
            !info[0].IsNumber() ||
            !info[1].IsNumber() ||
            !info[2].IsNumber() ||
            !info[3].IsNumber()) {
            return Napi::Boolean::New(info.Env(), false);
        }
        HWND viewer = nullptr;
        HWND host = nullptr;
        uint64_t generation = 0;
        bool terminalFailure = false;
        int x = info[0].As<Napi::Number>().Int32Value();
        int y = info[1].As<Napi::Number>().Int32Value();
        const int width = info[2].As<Napi::Number>().Int32Value();
        const int height = info[3].As<Napi::Number>().Int32Value();
        {
            std::lock_guard lock(m_state->mutex);
            m_state->x = x;
            m_state->y = y;
            m_state->width = width > 0 ? width : 1;
            m_state->height = height > 0 ? height : 1;
            viewer = m_state->viewer;
            host = m_state->host;
            generation = m_state->generation;
            terminalFailure = m_state->terminalFailure;
        }
        if (terminalFailure) return Napi::Boolean::New(info.Env(), false);
        // Before loadFile starts there is intentionally no viewer yet; retain
        // the requested bounds for the worker that creates it.
        if (!viewer || !host) return Napi::Boolean::New(info.Env(), true);
        if (!IsWindow(viewer)) {
            m_state->handleViewerUnavailable(generation, viewer);
            return Napi::Boolean::New(info.Env(), false);
        }
        POINT origin{x, y};
        if (!ClientToScreen(host, &origin)) return Napi::Boolean::New(info.Env(), false);
        // Bounds synchronization is allowed while the renderer overlay is hidden.
        // It must neither change visibility nor raise the preview above menus.
        const bool positioned = SetWindowPos(
            viewer,
            nullptr,
            origin.x,
            origin.y,
            width > 0 ? width : 1,
            height > 0 ? height : 1,
            SWP_NOACTIVATE | SWP_NOZORDER | SWP_ASYNCWINDOWPOS) != FALSE;
        return Napi::Boolean::New(info.Env(), positioned);
    }

    Napi::Value Show(const Napi::CallbackInfo& info) {
        return SetVisibility(info, SW_SHOW);
    }

    Napi::Value Hide(const Napi::CallbackInfo& info) {
        return SetVisibility(info, SW_HIDE);
    }

    Napi::Value Destroy(const Napi::CallbackInfo& info) {
        HWND viewer = nullptr;
        {
            std::lock_guard lock(m_state->mutex);
            viewer = m_state->viewer;
        }
        if (viewer && IsWindow(viewer)) {
            PostMessageW(viewer, WM_CLOSE, 0, 0);
            ShowWindowAsync(viewer, SW_HIDE);
        }
        m_state->cancelOperation();
        return Napi::Boolean::New(info.Env(), true);
    }

    Napi::Value IsLoaded(const Napi::CallbackInfo& info) {
        HWND viewer = nullptr;
        uint64_t generation = 0;
        bool ready = false;
        {
            std::lock_guard lock(m_state->mutex);
            viewer = m_state->viewer;
            generation = m_state->generation;
            ready = m_state->ready;
        }
        if (!ready) return Napi::Boolean::New(info.Env(), false);
        if (viewer && IsWindow(viewer)) return Napi::Boolean::New(info.Env(), true);
        m_state->handleViewerUnavailable(generation, viewer);
        return Napi::Boolean::New(info.Env(), false);
    }

#ifdef BLUEPLM_EDRAWINGS_VERIFY
    Napi::Value GetVisualState(const Napi::CallbackInfo& info) {
        Napi::Env env = info.Env();
        Napi::Object result = Napi::Object::New(env);
        result.Set("available", Napi::Boolean::New(env, false));
        HWND host = nullptr;
        int x = 0;
        int y = 0;
        int width = 0;
        int height = 0;
        {
            std::lock_guard lock(m_state->mutex);
            host = m_state->host;
            x = m_state->x;
            y = m_state->y;
            width = m_state->width;
            height = m_state->height;
        }
        if (!host || !IsWindow(host) || width < 1 || height < 1) return result;
        POINT origin{x, y};
        if (!ClientToScreen(host, &origin)) return result;
        HDC desktop = GetDC(nullptr);
        if (!desktop) return result;
        constexpr int columns = 12;
        constexpr int rows = 9;
        int sampled = 0;
        int nearBlack = 0;
        int bright = 0;
        unsigned long long luminanceSum = 0;
        unsigned long long luminanceSquaredSum = 0;
        for (int row = 0; row < rows; ++row) {
            for (int column = 0; column < columns; ++column) {
                const COLORREF pixel = GetPixel(
                    desktop,
                    origin.x + ((column * (width - 1)) / (columns - 1)),
                    origin.y + ((row * (height - 1)) / (rows - 1)));
                if (pixel == CLR_INVALID) continue;
                const int red = GetRValue(pixel);
                const int green = GetGValue(pixel);
                const int blue = GetBValue(pixel);
                const int luminance = (red * 54 + green * 183 + blue * 19) / 256;
                ++sampled;
                if (red < 30 && green < 30 && blue < 30) ++nearBlack;
                if (luminance > 80) ++bright;
                luminanceSum += static_cast<unsigned long long>(luminance);
                luminanceSquaredSum +=
                    static_cast<unsigned long long>(luminance) * luminance;
            }
        }
        ReleaseDC(nullptr, desktop);
        if (sampled == 0) return result;
        const double average = static_cast<double>(luminanceSum) / sampled;
        const double variance = static_cast<double>(luminanceSquaredSum) / sampled - average * average;
        result.Set("available", Napi::Boolean::New(env, true));
        result.Set("samples", Napi::Number::New(env, sampled));
        result.Set(
            "nearBlackRatio",
            Napi::Number::New(env, static_cast<double>(nearBlack) / sampled));
        result.Set(
            "brightRatio",
            Napi::Number::New(env, static_cast<double>(bright) / sampled));
        result.Set("averageLuminance", Napi::Number::New(env, average));
        result.Set("luminanceVariance", Napi::Number::New(env, variance));
        return result;
    }

    Napi::Value GetWindowState(const Napi::CallbackInfo& info) {
        HWND viewer = nullptr;
        HWND host = nullptr;
        bool jobActive = false;
        std::string openDocumentResult;
        {
            std::lock_guard lock(m_state->mutex);
            viewer = m_state->viewer;
            host = m_state->host;
            jobActive = m_state->job != nullptr;
            openDocumentResult = m_state->openDocumentResult;
        }
        Napi::Object result = Napi::Object::New(info.Env());
        const bool exists = viewer && IsWindow(viewer);
        const HWND owner = exists ? GetWindow(viewer, GW_OWNER) : nullptr;
        result.Set("exists", Napi::Boolean::New(info.Env(), exists));
        result.Set(
            "visible",
            Napi::Boolean::New(info.Env(), exists && IsWindowVisible(viewer)));
        result.Set("ownedByHost", Napi::Boolean::New(info.Env(), exists && owner == host));
        result.Set(
            "hostHandle",
            Napi::String::New(
                info.Env(),
                std::to_string(reinterpret_cast<uintptr_t>(host))));
        result.Set(
            "ownerHandle",
            Napi::String::New(
                info.Env(),
                std::to_string(reinterpret_cast<uintptr_t>(owner))));
        result.Set("openDocumentResult", Napi::String::New(info.Env(), openDocumentResult));
        result.Set("jobActive", Napi::Boolean::New(info.Env(), jobActive));
        const LONG_PTR extendedStyle = exists ? GetWindowLongPtrW(viewer, GWL_EXSTYLE) : 0;
        result.Set(
            "topmost",
            Napi::Boolean::New(info.Env(), (extendedStyle & WS_EX_TOPMOST) != 0));
        RECT viewerRect{};
        RECT hostClient{};
        const bool hasViewerBounds = exists && GetWindowRect(viewer, &viewerRect);
        const bool hasHostBounds = host && IsWindow(host) && GetClientRect(host, &hostClient);
        Napi::Object viewerBounds = Napi::Object::New(info.Env());
        viewerBounds.Set("left", Napi::Number::New(info.Env(), viewerRect.left));
        viewerBounds.Set("top", Napi::Number::New(info.Env(), viewerRect.top));
        viewerBounds.Set(
            "width",
            Napi::Number::New(info.Env(), viewerRect.right - viewerRect.left));
        viewerBounds.Set(
            "height",
            Napi::Number::New(info.Env(), viewerRect.bottom - viewerRect.top));
        result.Set("viewerBounds", viewerBounds);
        result.Set(
            "hasViewerBounds",
            Napi::Boolean::New(info.Env(), hasViewerBounds));
        Napi::Object hostBounds = Napi::Object::New(info.Env());
        hostBounds.Set(
            "width",
            Napi::Number::New(info.Env(), hostClient.right - hostClient.left));
        hostBounds.Set(
            "height",
            Napi::Number::New(info.Env(), hostClient.bottom - hostClient.top));
        result.Set("hostClientBounds", hostBounds);
        result.Set(
            "hasHostClientBounds",
            Napi::Boolean::New(info.Env(), hasHostBounds));
        const HWND directChild = exists ? GetWindow(viewer, GW_CHILD) : nullptr;
        RECT directChildClient{};
        const bool hasDirectChildClientBounds =
            directChild && GetClientRect(directChild, &directChildClient);
        Napi::Object directChildBounds = Napi::Object::New(info.Env());
        directChildBounds.Set(
            "width",
            Napi::Number::New(
                info.Env(),
                directChildClient.right - directChildClient.left));
        directChildBounds.Set(
            "height",
            Napi::Number::New(
                info.Env(),
                directChildClient.bottom - directChildClient.top));
        result.Set(
            "hasDirectChildClientBounds",
            Napi::Boolean::New(info.Env(), hasDirectChildClientBounds));
        result.Set("directChildClientBounds", directChildBounds);
        ChildWindowProbe childProbe;
        if (exists) {
            EnumChildWindows(viewer, captureVisibleChild, reinterpret_cast<LPARAM>(&childProbe));
        }
        result.Set(
            "visibleChildCount",
            Napi::Number::New(info.Env(), childProbe.visibleCount));
        Napi::Object firstChildBounds = Napi::Object::New(info.Env());
        firstChildBounds.Set(
            "width",
            Napi::Number::New(
                info.Env(),
                childProbe.firstWindowRect.right - childProbe.firstWindowRect.left));
        firstChildBounds.Set(
            "height",
            Napi::Number::New(
                info.Env(),
                childProbe.firstWindowRect.bottom - childProbe.firstWindowRect.top));
        firstChildBounds.Set(
            "clientWidth",
            Napi::Number::New(
                info.Env(),
                childProbe.firstClientRect.right - childProbe.firstClientRect.left));
        firstChildBounds.Set(
            "clientHeight",
            Napi::Number::New(
                info.Env(),
                childProbe.firstClientRect.bottom - childProbe.firstClientRect.top));
        result.Set("firstVisibleChildBounds", firstChildBounds);
        return result;
    }
#endif

    Napi::Value LastError(const Napi::CallbackInfo& info) {
        std::lock_guard lock(m_state->mutex);
        const std::string& error =
            m_state->asyncLastError.empty() ? m_lastError : m_state->asyncLastError;
        return Napi::String::New(info.Env(), error);
    }
    Napi::Value SetVisibility(const Napi::CallbackInfo& info, int command) {
        HWND viewer = nullptr;
        uint64_t generation = 0;
        bool ready = false;
        bool terminalFailure = false;
        {
            std::lock_guard lock(m_state->mutex);
            viewer = m_state->viewer;
            generation = m_state->generation;
            ready = m_state->ready;
            terminalFailure = m_state->terminalFailure;
        }
        if (terminalFailure) return Napi::Boolean::New(info.Env(), false);
        if (!viewer) return Napi::Boolean::New(info.Env(), !ready);
        if (!IsWindow(viewer)) {
            m_state->handleViewerUnavailable(generation, viewer);
            return Napi::Boolean::New(info.Env(), false);
        }
        return Napi::Boolean::New(info.Env(), ShowWindowAsync(viewer, command) != FALSE);
    }

    std::shared_ptr<PreviewState> m_state;
    std::string m_lastError;
};

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    return EDrawingsPreview::Init(env, exports);
}

} // namespace

NODE_API_MODULE(edrawings_preview, Init)
