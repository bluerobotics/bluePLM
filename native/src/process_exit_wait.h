#pragma once

#include <windows.h>

#include <atomic>
#include <functional>
#include <memory>
#include <mutex>

/**
 * Owns a waitable process handle and a Windows thread-pool wait. Unlike a
 * Napi::AsyncWorker, this does not occupy one of libuv's shared worker threads
 * while the preview host remains open.
 */
class ProcessExitWait final {
public:
    using Callback = std::function<void()>;

    static std::unique_ptr<ProcessExitWait> create(
        HANDLE ownedProcess,
        Callback callback,
        DWORD& error) {
        error = ERROR_SUCCESS;
        auto monitor = std::unique_ptr<ProcessExitWait>(
            new ProcessExitWait(ownedProcess, std::move(callback)));
        if (!monitor->start(error)) return nullptr;
        return monitor;
    }

    ProcessExitWait(const ProcessExitWait&) = delete;
    ProcessExitWait& operator=(const ProcessExitWait&) = delete;

    ~ProcessExitWait() {
        cancelAndWait();
    }

    void cancelAndWait() noexcept {
        std::lock_guard lock(m_lifecycleMutex);
        m_cancelled.store(true, std::memory_order_release);
        if (m_wait) {
            SetThreadpoolWait(m_wait, nullptr, nullptr);
            WaitForThreadpoolWaitCallbacks(m_wait, TRUE);
            CloseThreadpoolWait(m_wait);
            m_wait = nullptr;
        }
        if (m_process) {
            CloseHandle(m_process);
            m_process = nullptr;
        }
    }

private:
    ProcessExitWait(HANDLE ownedProcess, Callback callback)
        : m_process(ownedProcess), m_callback(std::move(callback)) {}

    bool start(DWORD& error) noexcept {
        if (!m_process || m_process == INVALID_HANDLE_VALUE) {
            error = ERROR_INVALID_HANDLE;
            return false;
        }
        m_wait = CreateThreadpoolWait(waitCallback, this, nullptr);
        if (!m_wait) {
            error = GetLastError();
            return false;
        }
        SetThreadpoolWait(m_wait, m_process, nullptr);
        return true;
    }

    static VOID CALLBACK waitCallback(
        PTP_CALLBACK_INSTANCE,
        PVOID context,
        PTP_WAIT,
        TP_WAIT_RESULT) noexcept {
        auto* monitor = static_cast<ProcessExitWait*>(context);
        if (monitor->m_cancelled.load(std::memory_order_acquire)) return;
        try {
            monitor->m_callback();
        } catch (...) {
            // Never allow C++ exceptions to cross the Windows callback boundary.
        }
    }

    std::mutex m_lifecycleMutex;
    HANDLE m_process = nullptr;
    PTP_WAIT m_wait = nullptr;
    Callback m_callback;
    std::atomic_bool m_cancelled = false;
};
