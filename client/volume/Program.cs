using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Threading;

namespace VolumeHelper
{
    // volume-helper.exe, run by Premade's app (client/main.js) for "Lower other apps while friends talk", as Discord's
    // attenuation. Args: the process names to leave alone (Premade's own, Discord's). Each stdin line is the share of
    // their volume the other apps keep (1 = back to normal, 0.5 = half). It lowers every app's sound session on the
    // default speakers, new ones too (looked at twice a second), and puts each back as it was, unless you moved that
    // app's volume yourself meanwhile. The volumes it changed are kept in %TEMP%\premade-volume.txt, so a helper that was
    // killed puts them back the next time it starts. When stdin closes (Premade quit or crashed) it puts them back and ends.
    public static class Program
    {
        class Lowered { public string Key; public float Was; public float Set; }
        static readonly string StateFile = Path.Combine(Path.GetTempPath(), "premade-volume.txt");
        static readonly Dictionary<string, Lowered> lowered = new Dictionary<string, Lowered>();
        static HashSet<string> leaveOut;
        static float keep = 1;

        public static int Main(string[] args)
        {
            leaveOut = new HashSet<string>(args.Select(a => Path.GetFileNameWithoutExtension(a).ToLowerInvariant()));
            var gate = new object();
            Restore(ReadState()); // a killed helper's leftovers
            new Thread(() =>
            {
                string line;
                while ((line = Console.ReadLine()) != null)
                {
                    float k;
                    if (float.TryParse(line.Trim(), NumberStyles.Float, CultureInfo.InvariantCulture, out k)) lock (gate) { keep = Math.Max(0, Math.Min(1, k)); Monitor.Pulse(gate); }
                }
                lock (gate) { keep = -1; Monitor.Pulse(gate); }
            }) { IsBackground = true }.Start();
            while (true)
            {
                float k;
                lock (gate) { Monitor.Wait(gate, 500); k = keep; }
                try
                {
                    if (k < 0 || k >= 1) { Restore(lowered.Values.ToList()); lowered.Clear(); }
                    else Lower(k);
                    WriteState();
                }
                catch (Exception e) { Console.Error.WriteLine(e.Message); }
                if (k < 0) return 0;
            }
        }

        // every app's session but ours, Discord's and Windows' own sounds, at its volume when first lowered times k
        static void Lower(float k)
        {
            foreach (var s in Sessions())
            {
                var c = (IAudioSessionControl2)s;
                if (c.IsSystemSoundsSession() == 0 || LeftOut(c)) continue;
                string key;
                c.GetSessionInstanceIdentifier(out key);
                var v = (ISimpleAudioVolume)s;
                float now;
                v.GetMasterVolume(out now);
                Lowered l;
                if (!lowered.TryGetValue(key, out l)) lowered[key] = l = new Lowered { Key = key, Was = now, Set = -1 };
                else if (Math.Abs(now - l.Set) > 0.02f) l.Was = now; // moved by you meanwhile: that's the volume to go back to
                l.Set = l.Was * k;
                var ctx = Guid.Empty;
                if (Math.Abs(now - l.Set) > 0.001f) v.SetMasterVolume(l.Set, ref ctx);
            }
        }

        static void Restore(List<Lowered> list)
        {
            if (list.Count == 0) return;
            var byKey = list.ToDictionary(l => l.Key);
            foreach (var s in Sessions())
            {
                string key;
                ((IAudioSessionControl2)s).GetSessionInstanceIdentifier(out key);
                Lowered l;
                if (!byKey.TryGetValue(key, out l)) continue;
                var v = (ISimpleAudioVolume)s;
                float now;
                v.GetMasterVolume(out now);
                var ctx = Guid.Empty;
                if (Math.Abs(now - l.Set) <= 0.02f) v.SetMasterVolume(l.Was, ref ctx); // not if you moved it yourself
            }
        }

        static bool LeftOut(IAudioSessionControl2 c)
        {
            uint pid;
            c.GetProcessId(out pid);
            if (pid == 0) return true;
            try { using (var p = Process.GetProcessById((int)pid)) return leaveOut.Contains(p.ProcessName.ToLowerInvariant()); }
            catch { return true; } // gone
        }

        static IEnumerable<object> Sessions()
        {
            var en = (IMMDeviceEnumerator)new MMDeviceEnumerator();
            IMMDevice dev;
            if (en.GetDefaultAudioEndpoint(0, 1, out dev) != 0 || dev == null) yield break; // eRender, eMultimedia
            var iid = typeof(IAudioSessionManager2).GUID;
            object o;
            dev.Activate(ref iid, 23, IntPtr.Zero, out o); // CLSCTX_ALL
            IAudioSessionEnumerator list;
            ((IAudioSessionManager2)o).GetSessionEnumerator(out list);
            int n;
            list.GetCount(out n);
            for (var i = 0; i < n; i++)
            {
                IAudioSessionControl s;
                list.GetSession(i, out s);
                yield return s;
            }
        }

        static List<Lowered> ReadState()
        {
            try
            {
                return File.ReadAllLines(StateFile).Select(x => x.Split('\t')).Where(x => x.Length == 3)
                    .Select(x => new Lowered { Was = float.Parse(x[0], CultureInfo.InvariantCulture), Set = float.Parse(x[1], CultureInfo.InvariantCulture), Key = x[2] }).ToList();
            }
            catch { return new List<Lowered>(); }
        }

        static void WriteState()
        {
            if (lowered.Count == 0) { if (File.Exists(StateFile)) File.Delete(StateFile); return; }
            File.WriteAllLines(StateFile, lowered.Values.Select(l => string.Format(CultureInfo.InvariantCulture, "{0}\t{1}\t{2}", l.Was, l.Set, l.Key)));
        }
    }

    [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumerator { }

    [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IMMDeviceEnumerator
    {
        void EnumAudioEndpoints(int dataFlow, int stateMask, out IntPtr devices);
        [PreserveSig] int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice device);
    }

    [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IMMDevice
    {
        void Activate(ref Guid iid, int clsCtx, IntPtr activationParams, [MarshalAs(UnmanagedType.IUnknown)] out object iface);
    }

    [ComImport, Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAudioSessionManager2
    {
        void GetAudioSessionControl(IntPtr groupingParam, int flags, out IntPtr control);
        void GetSimpleAudioVolume(IntPtr groupingParam, int flags, out IntPtr volume);
        void GetSessionEnumerator(out IAudioSessionEnumerator sessions);
    }

    [ComImport, Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAudioSessionEnumerator
    {
        void GetCount(out int count);
        void GetSession(int index, out IAudioSessionControl session);
    }

    [ComImport, Guid("F4B1A599-7266-4319-A8CA-E70ACB11E8CD"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAudioSessionControl { }

    [ComImport, Guid("bfb7ff88-7239-4fc9-8fa2-07c950be9c6d"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAudioSessionControl2
    {
        // IAudioSessionControl's nine first
        void GetState(out int state);
        void GetDisplayName(out IntPtr name);
        void SetDisplayName(IntPtr name, ref Guid ctx);
        void GetIconPath(out IntPtr path);
        void SetIconPath(IntPtr path, ref Guid ctx);
        void GetGroupingParam(out Guid param);
        void SetGroupingParam(ref Guid param, ref Guid ctx);
        void RegisterAudioSessionNotification(IntPtr client);
        void UnregisterAudioSessionNotification(IntPtr client);
        void GetSessionIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string id);
        void GetSessionInstanceIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string id);
        void GetProcessId(out uint pid);
        [PreserveSig] int IsSystemSoundsSession(); // S_OK (0) for Windows' own sounds
    }

    [ComImport, Guid("87CE5498-68D6-44E5-9215-6DA47EF883D8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface ISimpleAudioVolume
    {
        void SetMasterVolume(float level, ref Guid ctx);
        void GetMasterVolume(out float level);
    }
}
