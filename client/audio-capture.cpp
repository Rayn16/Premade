// Capture the Windows output mix without Premade's own sound (friends' voices, their shares) and without Discord.
// Args: the PIDs to leave out (Premade first, then any Discord and Wave Link ones); 48 kHz stereo PCM16 goes to stdout after "PCM1".
// Windows can exclude only one process tree per capture, so this captures each other app that has an audio session
// (include-tree loopback, new apps picked up every 2 s) and mixes them, with one PID too, to keep a single tested path.
#include <windows.h>
#include <audioclient.h>
#include <audioclientactivationparams.h>
#include <mmdeviceapi.h>
#include <audiopolicy.h>
#include <propvarutil.h>
#include <tlhelp32.h>
#include <cstdio>
#include <cstring>
#include <io.h>
#include <fcntl.h>
#include <map>
#include <set>
#include <vector>

// Windows calls ActivateCompleted on its own thread, possibly after openCapture gave up waiting, so this owns its event
// and is agile (IAgileObject): Windows 11 refuses a handler that isn't with 0x8000000e, so 1.28.1 captured nothing.
class Activation final : public IActivateAudioInterfaceCompletionHandler {
 public:
  HRESULT STDMETHODCALLTYPE QueryInterface(REFIID iid, void** out) override {
    if (!out) return E_POINTER;
    if (iid == __uuidof(IUnknown) || iid == __uuidof(IActivateAudioInterfaceCompletionHandler) || iid == __uuidof(IAgileObject)) {
      *out = static_cast<IActivateAudioInterfaceCompletionHandler*>(this);
      AddRef(); return S_OK;
    }
    *out = nullptr; return E_NOINTERFACE;
  }
  ULONG STDMETHODCALLTYPE AddRef() override { return InterlockedIncrement(&refs_); }
  ULONG STDMETHODCALLTYPE Release() override {
    ULONG n = InterlockedDecrement(&refs_); if (!n) delete this; return n;
  }
  HRESULT STDMETHODCALLTYPE ActivateCompleted(IActivateAudioInterfaceAsyncOperation* op) override {
    IUnknown* unknown = nullptr;
    HRESULT hr = op->GetActivateResult(&result_, &unknown);
    if (FAILED(hr)) result_ = hr;
    else if (SUCCEEDED(result_)) result_ = unknown ? unknown->QueryInterface(IID_PPV_ARGS(&client_)) : E_POINTER; // when Windows refuses an app it gives no interface
    if (unknown) unknown->Release();
    SetEvent(done_);
    return S_OK;
  }
  HANDLE done() const { return done_; }
  HRESULT result() const { return result_; }
  IAudioClient* client() const { return client_; }
 private:
  ~Activation() { if (client_) client_->Release(); if (done_) CloseHandle(done_); }
  LONG refs_ = 1;
  HANDLE done_ = CreateEventW(nullptr, TRUE, FALSE, nullptr);
  HRESULT result_ = E_PENDING;
  IAudioClient* client_ = nullptr;
};

static int fail(const char* where, HRESULT hr) {
  std::fprintf(stderr, "%s: 0x%08lx\n", where, static_cast<unsigned long>(hr));
  return 1;
}

static const WAVEFORMATEX kFormat{WAVE_FORMAT_PCM, 2, 48000, 192000, 4, 16, 0};

struct Capture {
  IAudioClient* audio = nullptr;
  IAudioCaptureClient* client = nullptr;
  HANDLE event = nullptr;   // Windows wants one with event callback; the loop polls every 10 ms instead
  std::vector<short> fifo;  // interleaved samples not yet mixed
  bool primed = false;      // has 30 ms queued, so the 10 ms polls and Windows' packets don't leave gaps
};

// A started loopback capture of one app and its children, set up as the 1.25.9 helper did.
static HRESULT openCapture(DWORD pid, Capture& c) {
  auto* callback = new Activation();
  if (!callback->done()) { callback->Release(); return E_OUTOFMEMORY; }
  AUDIOCLIENT_ACTIVATION_PARAMS params{};
  params.ActivationType = AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK;
  params.ProcessLoopbackParams.TargetProcessId = pid;
  params.ProcessLoopbackParams.ProcessLoopbackMode = PROCESS_LOOPBACK_MODE_INCLUDE_TARGET_PROCESS_TREE;
  PROPVARIANT value{};
  value.vt = VT_BLOB;
  value.blob.cbSize = sizeof(params);
  value.blob.pBlobData = reinterpret_cast<BYTE*>(&params);
  IActivateAudioInterfaceAsyncOperation* operation = nullptr;
  HRESULT hr = ActivateAudioInterfaceAsync(VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK, __uuidof(IAudioClient), &value, callback, &operation);
  if (operation) operation->Release();
  if (SUCCEEDED(hr) && WaitForSingleObject(callback->done(), 2000) != WAIT_OBJECT_0) hr = E_ABORT;
  if (SUCCEEDED(hr)) hr = callback->result();
  if (SUCCEEDED(hr)) { c.audio = callback->client(); c.audio->AddRef(); }
  callback->Release();
  if (FAILED(hr)) return hr;
  hr = c.audio->Initialize(AUDCLNT_SHAREMODE_SHARED, AUDCLNT_STREAMFLAGS_LOOPBACK | AUDCLNT_STREAMFLAGS_EVENTCALLBACK | AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM, 0, 0, &kFormat, nullptr);
  if (SUCCEEDED(hr) && !(c.event = CreateEventW(nullptr, FALSE, FALSE, nullptr))) hr = HRESULT_FROM_WIN32(GetLastError());
  if (SUCCEEDED(hr)) hr = c.audio->SetEventHandle(c.event);
  if (SUCCEEDED(hr)) hr = c.audio->GetService(IID_PPV_ARGS(&c.client));
  if (SUCCEEDED(hr)) hr = c.audio->Start();
  if (FAILED(hr)) { if (c.client) c.client->Release(); if (c.event) CloseHandle(c.event); c.audio->Release(); c = Capture{}; }
  return hr;
}

static void closeCapture(Capture& c) { c.audio->Stop(); c.client->Release(); c.audio->Release(); CloseHandle(c.event); c = Capture{}; }

// Moves what Windows has captured into the fifo, keeping at most 200 ms; false once the capture is gone.
static bool drain(Capture& c) {
  UINT32 frames = 0;
  HRESULT hr;
  while (SUCCEEDED(hr = c.client->GetNextPacketSize(&frames)) && frames) {
    BYTE* data = nullptr; DWORD flags = 0;
    if (FAILED(c.client->GetBuffer(&data, &frames, &flags, nullptr, nullptr))) return false;
    const short* in = reinterpret_cast<const short*>(data);
    if (flags & AUDCLNT_BUFFERFLAGS_SILENT) c.fifo.insert(c.fifo.end(), frames * 2, 0);
    else c.fifo.insert(c.fifo.end(), in, in + frames * 2);
    c.client->ReleaseBuffer(frames);
  }
  if (c.fifo.size() > 9600 * 2) c.fifo.erase(c.fifo.begin(), c.fifo.end() - 9600 * 2);
  return SUCCEEDED(hr);
}

// The apps to capture one by one: every process with its own audio session on an active output device, except the
// left-out trees, apps Windows refused (failed, forgotten once they exit), and processes whose parent is already
// captured (an include-tree capture of the parent has them). A left-out app's ancestors are never captured whole
// (that would bring it along), so their own children with sound are captured instead.
static std::set<DWORD> audioProcesses(IMMDeviceEnumerator* devices, const std::set<DWORD>& leaveOut, std::set<DWORD>& failed) {
  std::set<DWORD> pids;
  IMMDeviceCollection* list = nullptr;
  if (SUCCEEDED(devices->EnumAudioEndpoints(eRender, DEVICE_STATE_ACTIVE, &list))) {
    UINT n = 0; list->GetCount(&n);
    for (UINT i = 0; i < n; i++) {
      IMMDevice* device = nullptr; IAudioSessionManager2* manager = nullptr; IAudioSessionEnumerator* sessions = nullptr;
      if (SUCCEEDED(list->Item(i, &device)) && SUCCEEDED(device->Activate(__uuidof(IAudioSessionManager2), CLSCTX_ALL, nullptr, reinterpret_cast<void**>(&manager))) && SUCCEEDED(manager->GetSessionEnumerator(&sessions))) {
        int count = 0; sessions->GetCount(&count);
        for (int j = 0; j < count; j++) {
          IAudioSessionControl* session = nullptr; IAudioSessionControl2* session2 = nullptr; DWORD pid = 0;
          // S_OK only: System Sounds and sessions shared by several processes name just one of them (it can be Explorer, Premade's parent)
          if (SUCCEEDED(sessions->GetSession(j, &session)) && SUCCEEDED(session->QueryInterface(IID_PPV_ARGS(&session2))) && session2->GetProcessId(&pid) == S_OK && pid && session2->IsSystemSoundsSession() != S_OK) pids.insert(pid);
          if (session2) session2->Release();
          if (session) session->Release();
        }
      }
      if (sessions) sessions->Release();
      if (manager) manager->Release();
      if (device) device->Release();
    }
    list->Release();
  }
  std::map<DWORD, DWORD> parent;
  HANDLE snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
  if (snap != INVALID_HANDLE_VALUE) {
    PROCESSENTRY32W e{sizeof(e)};
    for (BOOL ok = Process32FirstW(snap, &e); ok; ok = Process32NextW(snap, &e)) parent[e.th32ProcessID] = e.th32ParentProcessID;
    CloseHandle(snap);
  }
  for (auto it = failed.begin(); it != failed.end();) it = parent.count(*it) ? ++it : failed.erase(it);  // PIDs get reused
  auto ancestors = [&](DWORD p) {
    std::vector<DWORD> up;
    for (int depth = 0; depth < 32 && parent.count(p) && parent.count(parent[p]) && parent[p] != p; depth++) up.push_back(p = parent[p]);  // stops at an exited parent; depth: PIDs get reused, so a chain can loop
    return up;
  };
  std::set<DWORD> holdsLeftOut(leaveOut);
  for (DWORD p : leaveOut) for (DWORD a : ancestors(p)) holdsLeftOut.insert(a);
  std::set<DWORD> keep;
  for (DWORD pid : pids) {
    bool skip = holdsLeftOut.count(pid) || failed.count(pid) || !parent.count(pid);
    for (DWORD a : ancestors(pid)) skip = skip || leaveOut.count(a) || (pids.count(a) && !holdsLeftOut.count(a) && !failed.count(a));
    if (!skip) keep.insert(pid);
  }
  return keep;
}

int wmain(int argc, wchar_t** argv) {
  std::set<DWORD> leaveOut;
  for (int i = 1; i < argc; i++) if (DWORD pid = wcstoul(argv[i], nullptr, 10)) leaveOut.insert(pid);
  if (leaveOut.empty()) return 2;
  if (_setmode(_fileno(stdout), _O_BINARY) == -1) return 3;
  HRESULT hr = CoInitializeEx(nullptr, COINIT_MULTITHREADED);
  if (FAILED(hr)) return fail("COM", hr);

  IMMDeviceEnumerator* devices = nullptr;
  std::map<DWORD, Capture> captures;
  std::set<DWORD> failed;
  hr = CoCreateInstance(__uuidof(MMDeviceEnumerator), nullptr, CLSCTX_ALL, IID_PPV_ARGS(&devices));
  if (FAILED(hr)) { CoUninitialize(); return fail("Audio devices", hr); }

  bool started = false, ok = true;
  LARGE_INTEGER freq, start, now;
  QueryPerformanceFrequency(&freq);
  ULONGLONG written = 0, lastScan = 0;
  std::vector<short> out;
  while (ok) {
    if (GetTickCount64() - lastScan >= 2000) {
      lastScan = GetTickCount64();
      const std::set<DWORD> want = audioProcesses(devices, leaveOut, failed);
      for (auto it = captures.begin(); it != captures.end();) {  // also drops a child once its parent's capture has it
        if (want.count(it->first)) { ++it; continue; }
        closeCapture(it->second); it = captures.erase(it);
      }
      for (DWORD pid : want) {
        Capture c;
        if (captures.count(pid)) continue;
        if (SUCCEEDED(openCapture(pid, c))) captures[pid] = c;
        else failed.insert(pid);
      }
      // Windows refused every app on the first try: fail before "PCM1", so Premade keeps the plain screen share sound
      if (!started && !want.empty() && captures.empty()) { devices->Release(); CoUninitialize(); return fail("No app could be captured", E_ACCESSDENIED); }
    }
    if (!started) {
      started = true;
      std::fwrite("PCM1", 1, 4, stdout);
      std::fflush(stdout);
      QueryPerformanceCounter(&start);
    }
    for (auto it = captures.begin(); it != captures.end();) {
      if (drain(it->second)) { ++it; continue; }
      closeCapture(it->second); it = captures.erase(it);  // that app went away; the next scan picks it up again if it comes back
    }
    // As many frames as wall time says are due, so captures that send nothing while quiet still mix in step.
    QueryPerformanceCounter(&now);
    const ULONGLONG due = static_cast<ULONGLONG>((now.QuadPart - start.QuadPart) * 48000 / freq.QuadPart) - written;
    if (due) {
      out.assign(due * 2, 0);
      for (auto& [pid, c] : captures) {
        if (!c.primed && c.fifo.size() < 1440 * 2) continue;
        c.primed = c.fifo.size() > out.size();  // runs dry when the app goes quiet, so it primes again
        const size_t n = c.fifo.size() < out.size() ? c.fifo.size() : out.size();
        for (size_t i = 0; i < n; i++) { const int v = out[i] + c.fifo[i]; out[i] = static_cast<short>(v > 32767 ? 32767 : v < -32768 ? -32768 : v); }
        c.fifo.erase(c.fifo.begin(), c.fifo.begin() + n);
      }
      written += due;
      if (std::fwrite(out.data(), sizeof(short), out.size(), stdout) != out.size() || std::fflush(stdout) != 0) ok = false;
    }
    Sleep(10);
  }
  for (auto& [pid, c] : captures) closeCapture(c);
  devices->Release();
  CoUninitialize();
  return 5;
}
