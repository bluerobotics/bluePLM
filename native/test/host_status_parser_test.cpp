#include "../src/host_status_parser.h"

#include <iostream>
#include <string>

namespace {

bool expect(bool condition, const char* message) {
    if (condition) return true;
    std::cerr << message << '\n';
    return false;
}

} // namespace

int main() {
    bool passed = true;

    const HostStatus handshake = parseHostStatusText(L"handshake 12345");
    passed &= expect(handshake.kind == HostStatus::Kind::Handshake, "handshake was rejected");
    passed &= expect(
        reinterpret_cast<uintptr_t>(handshake.window) == 12345,
        "handshake HWND changed during parsing");

    const HostStatus ready = parseHostStatusText(L"ready 12345 Boolean:True");
    passed &= expect(ready.kind == HostStatus::Kind::Ready, "ready status was rejected");
    passed &= expect(ready.detail == L"Boolean:True", "ready detail was not preserved");

    const HostStatus failed = parseHostStatusText(L"failed 0");
    passed &= expect(failed.kind == HostStatus::Kind::Failed, "failed status without an HWND was rejected");

    const std::wstring invalidStatuses[] = {
        L"handshake",
        L"handshake 0",
        L"ready 12x",
        L"ready -1",
        L"ready +1",
        L"ready 184467440737095516160",
        L"ready 123 detail trailing",
        L"unknown 123",
    };
    for (const std::wstring& invalidStatus : invalidStatuses) {
        passed &= expect(
            parseHostStatusText(invalidStatus).kind == HostStatus::Kind::None,
            "malformed or partial status was accepted");
    }

    if (!passed) return 1;
    std::cout << "Host status parser harness passed.\n";
    return 0;
}
