// Capture the Windows output mix while excluding Discord's process tree.
// The parent supplies the root Discord PID and consumes 48 kHz stereo PCM16 on stdout.
#include <windows.h>
#include <audioclient.h>
#include <audioclientactivationparams.h>
#include <mmdeviceapi.h>
#include <propvarutil.h>
#include <cstdio>
#include <cstring>
#include <io.h>
#include <fcntl.h>

class Activation final : public IActivateAudioInterfaceCompletionHandler {
 public:
  explicit Activation(HANDLE ready) : ready_(ready) {}
  HRESULT STDMETHODCALLTYPE QueryInterface(REFIID iid, void** out) override {
    if (!out) return E_POINTER;
    if (iid == __uuidof(IUnknown) || iid == __uuidof(IActivateAudioInterfaceCompletionHandler)) {
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
    HRESULT hr = op->GetActivateResult(&result_, &unknown_);
    if (SUCCEEDED(hr)) hr = unknown_->QueryInterface(IID_PPV_ARGS(&client_));
    if (FAILED(hr)) result_ = hr;
    SetEvent(ready_);
    return S_OK;
  }
  HRESULT result() const { return result_; }
  IAudioClient* client() const { return client_; }
 private:
  ~Activation() { if (client_) client_->Release(); if (unknown_) unknown_->Release(); }
  LONG refs_ = 1;
  HANDLE ready_;
  HRESULT result_ = E_PENDING;
  IUnknown* unknown_ = nullptr;
  IAudioClient* client_ = nullptr;
};

static int fail(const char* where, HRESULT hr) {
  std::fprintf(stderr, "%s: 0x%08lx\n", where, static_cast<unsigned long>(hr));
  return 1;
}

int wmain(int argc, wchar_t** argv) {
  if (argc != 2) return 2;
  const DWORD discordPid = wcstoul(argv[1], nullptr, 10);
  if (!discordPid) return 2;
  if (_setmode(_fileno(stdout), _O_BINARY) == -1) return 3;
  HRESULT hr = CoInitializeEx(nullptr, COINIT_MULTITHREADED);
  if (FAILED(hr)) return fail("COM", hr);

  HANDLE activated = CreateEventW(nullptr, TRUE, FALSE, nullptr);
  if (!activated) { CoUninitialize(); return 4; }
  auto* callback = new Activation(activated);
  AUDIOCLIENT_ACTIVATION_PARAMS params{};
  params.ActivationType = AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK;
  params.ProcessLoopbackParams.TargetProcessId = discordPid;
  params.ProcessLoopbackParams.ProcessLoopbackMode = PROCESS_LOOPBACK_MODE_EXCLUDE_TARGET_PROCESS_TREE;
  PROPVARIANT value{};
  value.vt = VT_BLOB;
  value.blob.cbSize = sizeof(params);
  value.blob.pBlobData = reinterpret_cast<BYTE*>(&params);
  IActivateAudioInterfaceAsyncOperation* operation = nullptr;
  hr = ActivateAudioInterfaceAsync(VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK, __uuidof(IAudioClient), &value, callback, &operation);
  if (FAILED(hr)) { callback->Release(); CloseHandle(activated); CoUninitialize(); return fail("ActivateAudioInterfaceAsync", hr); }
  if (operation) operation->Release();
  if (WaitForSingleObject(activated, 5000) != WAIT_OBJECT_0) {
    callback->Release(); CloseHandle(activated); CoUninitialize(); return fail("Activation timeout", E_ABORT);
  }
  hr = callback->result();
  IAudioClient* audio = callback->client();
  if (SUCCEEDED(hr) && audio) audio->AddRef();
  callback->Release();
  CloseHandle(activated);
  if (FAILED(hr) || !audio) { CoUninitialize(); return fail("Audio activation", FAILED(hr) ? hr : E_POINTER); }

  WAVEFORMATEX format{};
  format.wFormatTag = WAVE_FORMAT_PCM;
  format.nChannels = 2;
  format.nSamplesPerSec = 48000;
  format.wBitsPerSample = 16;
  format.nBlockAlign = 4;
  format.nAvgBytesPerSec = 192000;
  hr = audio->Initialize(AUDCLNT_SHAREMODE_SHARED,
    AUDCLNT_STREAMFLAGS_LOOPBACK | AUDCLNT_STREAMFLAGS_EVENTCALLBACK | AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM,
    0, 0, &format, nullptr);
  HANDLE ready = CreateEventW(nullptr, FALSE, FALSE, nullptr);
  if (SUCCEEDED(hr) && !ready) hr = HRESULT_FROM_WIN32(GetLastError());
  if (SUCCEEDED(hr)) hr = audio->SetEventHandle(ready);
  IAudioCaptureClient* capture = nullptr;
  if (SUCCEEDED(hr)) hr = audio->GetService(IID_PPV_ARGS(&capture));
  if (SUCCEEDED(hr)) hr = audio->Start();
  if (FAILED(hr)) {
    if (capture) capture->Release(); if (ready) CloseHandle(ready); audio->Release(); CoUninitialize();
    return fail("Start capture", hr);
  }

  std::fwrite("PCM1", 1, 4, stdout);
  std::fflush(stdout);
  bool ok = true;
  while (WaitForSingleObject(ready, 1000) != WAIT_FAILED) {
    UINT32 frames = 0;
    while (SUCCEEDED(capture->GetNextPacketSize(&frames)) && frames) {
      BYTE* data = nullptr; DWORD flags = 0; UINT64 pos = 0, qpc = 0;
      hr = capture->GetBuffer(&data, &frames, &flags, &pos, &qpc);
      if (FAILED(hr)) { ok = false; break; }
      const size_t bytes = static_cast<size_t>(frames) * format.nBlockAlign;
      if (flags & AUDCLNT_BUFFERFLAGS_SILENT) {
        static const BYTE silence[4096]{};
        size_t left = bytes;
        while (left) { size_t n = left < sizeof(silence) ? left : sizeof(silence); if (std::fwrite(silence, 1, n, stdout) != n) { ok = false; break; } left -= n; }
      } else if (std::fwrite(data, 1, bytes, stdout) != bytes) ok = false;
      capture->ReleaseBuffer(frames);
      if (!ok) break;
    }
    if (!ok || std::fflush(stdout) != 0) break;
  }
  audio->Stop();
  capture->Release(); audio->Release(); CloseHandle(ready); CoUninitialize();
  return ok ? 0 : 5;
}
