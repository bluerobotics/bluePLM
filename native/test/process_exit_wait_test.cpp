#include "../src/process_exit_wait.h"

#include <atomic>
#include <iostream>

namespace {

bool expect(bool condition, const char* message) {
    if (condition) return true;
    std::cerr << message << '\n';
    return false;
}

HANDLE duplicateHandle(HANDLE source) {
    HANDLE duplicate = nullptr;
    if (!DuplicateHandle(
            GetCurrentProcess(),
            source,
            GetCurrentProcess(),
            &duplicate,
            SYNCHRONIZE,
            FALSE,
            0)) {
        return nullptr;
    }
    return duplicate;
}

} // namespace

int main() {
    bool passed = true;

    HANDLE source = CreateEventW(nullptr, TRUE, FALSE, nullptr);
    HANDLE callbackFinished = CreateEventW(nullptr, TRUE, FALSE, nullptr);
    std::atomic_int callbackCount = 0;
    DWORD error = ERROR_SUCCESS;
    auto monitor = ProcessExitWait::create(
        duplicateHandle(source),
        [&]() {
            callbackCount.fetch_add(1);
            SetEvent(callbackFinished);
        },
        error);

    passed &= expect(monitor != nullptr, "process exit wait registration failed");
    passed &= expect(error == ERROR_SUCCESS, "process exit wait returned an unexpected error");
    SetEvent(source);
    passed &= expect(
        WaitForSingleObject(callbackFinished, 2'000) == WAIT_OBJECT_0,
        "registered callback did not run");
    monitor.reset();
    passed &= expect(callbackCount.load() == 1, "registered callback did not run exactly once");
    CloseHandle(callbackFinished);
    CloseHandle(source);

    source = CreateEventW(nullptr, TRUE, FALSE, nullptr);
    callbackCount.store(0);
    monitor = ProcessExitWait::create(
        duplicateHandle(source),
        [&]() { callbackCount.fetch_add(1); },
        error);
    passed &= expect(monitor != nullptr, "cancellable wait registration failed");
    monitor.reset();
    SetEvent(source);
    Sleep(50);
    passed &= expect(callbackCount.load() == 0, "cancelled callback ran after teardown");
    CloseHandle(source);

    if (!passed) return 1;
    std::cout << "Process exit wait harness passed.\n";
    return 0;
}
