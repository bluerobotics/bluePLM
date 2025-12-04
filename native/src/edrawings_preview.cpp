/**
 * eDrawings Preview Native Addon
 * 
 * Embeds the eDrawings ActiveX control as a child window of Electron
 */

#define NAPI_VERSION 8
#include <napi.h>
#include <windows.h>
#include <atlbase.h>
#include <atlcom.h>
#include <string>
#include <shlwapi.h>

#pragma comment(lib, "shlwapi.lib")

// eDrawings control CLSID
// {22945A69-1191-4DCF-9E6F-409BDE94D101} - eDrawings control
static const CLSID CLSID_EModelViewControl = 
    {0x22945A69, 0x1191, 0x4DCF, {0x9E, 0x6F, 0x40, 0x9B, 0xDE, 0x94, 0xD1, 0x01}};

// Forward declarations
class EDrawingsPreview;

// Global COM initialization flag
static bool g_comInitialized = false;

// The preview control wrapper
class EDrawingsPreview : public Napi::ObjectWrap<EDrawingsPreview> {
public:
    static Napi::Object Init(Napi::Env env, Napi::Object exports);
    EDrawingsPreview(const Napi::CallbackInfo& info);
    ~EDrawingsPreview();

private:
    // N-API methods
    Napi::Value AttachToWindow(const Napi::CallbackInfo& info);
    Napi::Value LoadFile(const Napi::CallbackInfo& info);
    Napi::Value SetBounds(const Napi::CallbackInfo& info);
    Napi::Value Show(const Napi::CallbackInfo& info);
    Napi::Value Hide(const Napi::CallbackInfo& info);
    Napi::Value Destroy(const Napi::CallbackInfo& info);
    Napi::Value IsLoaded(const Napi::CallbackInfo& info);

    // Internal
    bool CreateControl(HWND parentHwnd);
    void DestroyControl();

    HWND m_hwndParent = nullptr;
    HWND m_hwndContainer = nullptr;
    IUnknown* m_pControl = nullptr;
    IDispatch* m_pDispatch = nullptr;
    bool m_isAttached = false;
    bool m_isFileLoaded = false;
};

// Static: Check if eDrawings is installed
Napi::Value CheckEDrawingsInstalled(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    // Try to find eDrawings in common locations
    const wchar_t* paths[] = {
        L"C:\\Program Files\\SOLIDWORKS Corp\\eDrawings\\eDrawings.exe",
        L"C:\\Program Files\\eDrawings\\eDrawings.exe",
        L"C:\\Program Files (x86)\\eDrawings\\eDrawings.exe",
        L"C:\\Program Files\\SOLIDWORKS Corp\\SOLIDWORKS\\eDrawings\\eDrawings.exe"
    };
    
    for (const auto& path : paths) {
        if (PathFileExistsW(path)) {
            // Convert to UTF-8 for JS
            int len = WideCharToMultiByte(CP_UTF8, 0, path, -1, nullptr, 0, nullptr, nullptr);
            std::string utf8Path(len - 1, '\0');
            WideCharToMultiByte(CP_UTF8, 0, path, -1, &utf8Path[0], len, nullptr, nullptr);
            
            Napi::Object result = Napi::Object::New(env);
            result.Set("installed", Napi::Boolean::New(env, true));
            result.Set("path", Napi::String::New(env, utf8Path));
            return result;
        }
    }
    
    // Also check registry for eDrawings
    HKEY hKey;
    if (RegOpenKeyExW(HKEY_LOCAL_MACHINE, 
        L"SOFTWARE\\SolidWorks\\eDrawings\\General", 
        0, KEY_READ, &hKey) == ERROR_SUCCESS) {
        
        wchar_t installPath[MAX_PATH];
        DWORD size = sizeof(installPath);
        if (RegQueryValueExW(hKey, L"InstallPath", nullptr, nullptr, 
            (LPBYTE)installPath, &size) == ERROR_SUCCESS) {
            
            RegCloseKey(hKey);
            
            int len = WideCharToMultiByte(CP_UTF8, 0, installPath, -1, nullptr, 0, nullptr, nullptr);
            std::string utf8Path(len - 1, '\0');
            WideCharToMultiByte(CP_UTF8, 0, installPath, -1, &utf8Path[0], len, nullptr, nullptr);
            
            Napi::Object result = Napi::Object::New(env);
            result.Set("installed", Napi::Boolean::New(env, true));
            result.Set("path", Napi::String::New(env, utf8Path));
            return result;
        }
        RegCloseKey(hKey);
    }
    
    Napi::Object result = Napi::Object::New(env);
    result.Set("installed", Napi::Boolean::New(env, false));
    result.Set("path", env.Null());
    return result;
}

// Static: Open file in external eDrawings
Napi::Value OpenInEDrawings(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (info.Length() < 1 || !info[0].IsString()) {
        Napi::TypeError::New(env, "File path expected").ThrowAsJavaScriptException();
        return env.Null();
    }
    
    std::string filePath = info[0].As<Napi::String>().Utf8Value();
    
    // Convert to wide string
    int wlen = MultiByteToWideChar(CP_UTF8, 0, filePath.c_str(), -1, nullptr, 0);
    std::wstring wFilePath(wlen - 1, L'\0');
    MultiByteToWideChar(CP_UTF8, 0, filePath.c_str(), -1, &wFilePath[0], wlen);
    
    // Try to open with default handler (eDrawings if associated)
    HINSTANCE result = ShellExecuteW(nullptr, L"open", wFilePath.c_str(), 
        nullptr, nullptr, SW_SHOWNORMAL);
    
    return Napi::Boolean::New(env, (intptr_t)result > 32);
}

// EDrawingsPreview implementation
Napi::Object EDrawingsPreview::Init(Napi::Env env, Napi::Object exports) {
    Napi::Function func = DefineClass(env, "EDrawingsPreview", {
        InstanceMethod("attachToWindow", &EDrawingsPreview::AttachToWindow),
        InstanceMethod("loadFile", &EDrawingsPreview::LoadFile),
        InstanceMethod("setBounds", &EDrawingsPreview::SetBounds),
        InstanceMethod("show", &EDrawingsPreview::Show),
        InstanceMethod("hide", &EDrawingsPreview::Hide),
        InstanceMethod("destroy", &EDrawingsPreview::Destroy),
        InstanceMethod("isLoaded", &EDrawingsPreview::IsLoaded),
    });
    
    Napi::FunctionReference* constructor = new Napi::FunctionReference();
    *constructor = Napi::Persistent(func);
    env.SetInstanceData(constructor);
    
    exports.Set("EDrawingsPreview", func);
    exports.Set("checkEDrawingsInstalled", Napi::Function::New(env, CheckEDrawingsInstalled));
    exports.Set("openInEDrawings", Napi::Function::New(env, OpenInEDrawings));
    
    return exports;
}

EDrawingsPreview::EDrawingsPreview(const Napi::CallbackInfo& info) 
    : Napi::ObjectWrap<EDrawingsPreview>(info) {
    
    // Initialize COM if needed
    if (!g_comInitialized) {
        HRESULT hr = CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED);
        if (SUCCEEDED(hr) || hr == S_FALSE) {
            g_comInitialized = true;
        }
    }
}

EDrawingsPreview::~EDrawingsPreview() {
    DestroyControl();
}

bool EDrawingsPreview::CreateControl(HWND parentHwnd) {
    if (m_isAttached) return true;
    
    // Create a container window
    WNDCLASSEXW wc = {};
    wc.cbSize = sizeof(WNDCLASSEXW);
    wc.lpfnWndProc = DefWindowProcW;
    wc.hInstance = GetModuleHandle(nullptr);
    wc.lpszClassName = L"EDrawingsContainer";
    wc.hbrBackground = (HBRUSH)(COLOR_WINDOW + 1);
    RegisterClassExW(&wc);
    
    m_hwndContainer = CreateWindowExW(
        0,
        L"EDrawingsContainer",
        L"",
        WS_CHILD | WS_VISIBLE | WS_CLIPCHILDREN,
        0, 0, 400, 300,
        parentHwnd,
        nullptr,
        GetModuleHandle(nullptr),
        nullptr
    );
    
    if (!m_hwndContainer) {
        return false;
    }
    
    // Try to create the eDrawings control
    HRESULT hr = CoCreateInstance(
        CLSID_EModelViewControl,
        nullptr,
        CLSCTX_INPROC_SERVER,
        IID_IUnknown,
        (void**)&m_pControl
    );
    
    if (FAILED(hr) || !m_pControl) {
        DestroyWindow(m_hwndContainer);
        m_hwndContainer = nullptr;
        return false;
    }
    
    // Get IDispatch for calling methods
    hr = m_pControl->QueryInterface(IID_IDispatch, (void**)&m_pDispatch);
    if (FAILED(hr)) {
        m_pControl->Release();
        m_pControl = nullptr;
        DestroyWindow(m_hwndContainer);
        m_hwndContainer = nullptr;
        return false;
    }
    
    m_hwndParent = parentHwnd;
    m_isAttached = true;
    return true;
}

void EDrawingsPreview::DestroyControl() {
    if (m_pDispatch) {
        m_pDispatch->Release();
        m_pDispatch = nullptr;
    }
    if (m_pControl) {
        m_pControl->Release();
        m_pControl = nullptr;
    }
    if (m_hwndContainer) {
        DestroyWindow(m_hwndContainer);
        m_hwndContainer = nullptr;
    }
    m_isAttached = false;
    m_isFileLoaded = false;
}

Napi::Value EDrawingsPreview::AttachToWindow(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (info.Length() < 1) {
        Napi::TypeError::New(env, "Window handle (HWND as number) expected").ThrowAsJavaScriptException();
        return Napi::Boolean::New(env, false);
    }
    
    // Get HWND from buffer or number
    HWND hwnd = nullptr;
    if (info[0].IsBuffer()) {
        Napi::Buffer<uint8_t> buf = info[0].As<Napi::Buffer<uint8_t>>();
        if (buf.Length() >= sizeof(HWND)) {
            hwnd = *reinterpret_cast<HWND*>(buf.Data());
        }
    } else if (info[0].IsNumber()) {
        hwnd = reinterpret_cast<HWND>(info[0].As<Napi::Number>().Int64Value());
    }
    
    if (!hwnd || !IsWindow(hwnd)) {
        return Napi::Boolean::New(env, false);
    }
    
    return Napi::Boolean::New(env, CreateControl(hwnd));
}

Napi::Value EDrawingsPreview::LoadFile(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (!m_isAttached || !m_pDispatch) {
        return Napi::Boolean::New(env, false);
    }
    
    if (info.Length() < 1 || !info[0].IsString()) {
        Napi::TypeError::New(env, "File path expected").ThrowAsJavaScriptException();
        return Napi::Boolean::New(env, false);
    }
    
    std::string filePath = info[0].As<Napi::String>().Utf8Value();
    
    // Convert to BSTR for COM
    int wlen = MultiByteToWideChar(CP_UTF8, 0, filePath.c_str(), -1, nullptr, 0);
    std::wstring wFilePath(wlen - 1, L'\0');
    MultiByteToWideChar(CP_UTF8, 0, filePath.c_str(), -1, &wFilePath[0], wlen);
    
    BSTR bstrPath = SysAllocString(wFilePath.c_str());
    
    // Call OpenDoc method via IDispatch
    // Method ID for OpenDoc is typically 1 or we need to look it up
    DISPID dispid;
    LPOLESTR methodName = const_cast<LPOLESTR>(L"OpenDoc");
    HRESULT hr = m_pDispatch->GetIDsOfNames(IID_NULL, &methodName, 1, 
        LOCALE_USER_DEFAULT, &dispid);
    
    if (SUCCEEDED(hr)) {
        DISPPARAMS params = {};
        VARIANTARG arg;
        VariantInit(&arg);
        arg.vt = VT_BSTR;
        arg.bstrVal = bstrPath;
        params.cArgs = 1;
        params.rgvarg = &arg;
        
        VARIANT result;
        VariantInit(&result);
        
        hr = m_pDispatch->Invoke(dispid, IID_NULL, LOCALE_USER_DEFAULT,
            DISPATCH_METHOD, &params, &result, nullptr, nullptr);
        
        VariantClear(&result);
    }
    
    SysFreeString(bstrPath);
    
    m_isFileLoaded = SUCCEEDED(hr);
    return Napi::Boolean::New(env, m_isFileLoaded);
}

Napi::Value EDrawingsPreview::SetBounds(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (!m_hwndContainer) {
        return Napi::Boolean::New(env, false);
    }
    
    if (info.Length() < 4) {
        Napi::TypeError::New(env, "x, y, width, height expected").ThrowAsJavaScriptException();
        return Napi::Boolean::New(env, false);
    }
    
    int x = info[0].As<Napi::Number>().Int32Value();
    int y = info[1].As<Napi::Number>().Int32Value();
    int width = info[2].As<Napi::Number>().Int32Value();
    int height = info[3].As<Napi::Number>().Int32Value();
    
    SetWindowPos(m_hwndContainer, nullptr, x, y, width, height, 
        SWP_NOZORDER | SWP_NOACTIVATE);
    
    return Napi::Boolean::New(env, true);
}

Napi::Value EDrawingsPreview::Show(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (m_hwndContainer) {
        ShowWindow(m_hwndContainer, SW_SHOW);
        return Napi::Boolean::New(env, true);
    }
    return Napi::Boolean::New(env, false);
}

Napi::Value EDrawingsPreview::Hide(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (m_hwndContainer) {
        ShowWindow(m_hwndContainer, SW_HIDE);
        return Napi::Boolean::New(env, true);
    }
    return Napi::Boolean::New(env, false);
}

Napi::Value EDrawingsPreview::Destroy(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    DestroyControl();
    return Napi::Boolean::New(env, true);
}

Napi::Value EDrawingsPreview::IsLoaded(const Napi::CallbackInfo& info) {
    return Napi::Boolean::New(info.Env(), m_isFileLoaded);
}

// Module initialization
Napi::Object Init(Napi::Env env, Napi::Object exports) {
    return EDrawingsPreview::Init(env, exports);
}

NODE_API_MODULE(edrawings_preview, Init)

