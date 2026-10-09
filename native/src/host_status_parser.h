#pragma once

#include <windows.h>

#include <cstdint>
#include <limits>
#include <sstream>
#include <string>

struct HostStatus {
    enum class Kind { None, Handshake, Ready, Failed };
    Kind kind = Kind::None;
    HWND window = nullptr;
    std::wstring detail;
};

inline bool parseWindowValue(const std::wstring& value, uintptr_t& parsedValue) {
    if (value.empty()) return false;
    uintptr_t result = 0;
    for (const wchar_t character : value) {
        if (character < L'0' || character > L'9') return false;
        const uintptr_t digit = static_cast<uintptr_t>(character - L'0');
        if (result > ((std::numeric_limits<uintptr_t>::max)() - digit) / 10) return false;
        result = result * 10 + digit;
    }
    parsedValue = result;
    return true;
}

inline HostStatus parseHostStatusText(const std::wstring& content) {
    std::wistringstream input(content);
    std::wstring state;
    std::wstring windowText;
    if (!(input >> state >> windowText)) return {};

    uintptr_t windowValue = 0;
    if (!parseWindowValue(windowText, windowValue)) return {};

    HostStatus status;
    if (state == L"handshake") {
        status.kind = HostStatus::Kind::Handshake;
    } else if (state == L"ready") {
        status.kind = HostStatus::Kind::Ready;
    } else if (state == L"failed") {
        status.kind = HostStatus::Kind::Failed;
    } else {
        return {};
    }

    if (windowValue == 0 && status.kind != HostStatus::Kind::Failed) return {};
    status.window = reinterpret_cast<HWND>(windowValue);

    std::wstring unexpected;
    input >> status.detail;
    if (input >> unexpected) return {};
    return status;
}
