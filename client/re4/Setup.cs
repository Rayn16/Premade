using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.Cryptography.X509Certificates;

namespace RE4Helper
{
    // Everything that needs admin (Program.cs relaunches the helper with Windows' prompt for it): Set up to host and Join
    // (Tailscale, firewall rules) and Remove from this PC. Tailscale carries the game through any router, so nothing
    // here touches the router. The WireGuard tunnel that 1.28.10 and before made is taken off on the way.
    public static class Setup
    {
        static readonly string OldConfDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "RE4 co-op WireGuard");
        static readonly string WgDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "WireGuard");

        public static string Host(string appExe)
        {
            InstallTailscale();
            RemoveOldTunnel();
            FirewallRules(Checks.FindGame(), true, appExe != null && File.Exists(appExe) && appExe.EndsWith(".exe", StringComparison.OrdinalIgnoreCase) ? appExe : null);
            Log.Write("Set up as host: Tailscale, firewall rules");
            return "This PC is set up to host.";
        }

        public static string Join()
        {
            InstallTailscale();
            RemoveOldTunnel();
            FirewallRules(Checks.FindGame(), false, null);
            Log.Write("Set up as a friend: Tailscale, firewall rules");
            return "Joined.";
        }

        // Undoes Set up and Join: our firewall rules and the old tunnel. Tailscale stays.
        public static string Remove()
        {
            RemoveOldTunnel();
            RemoveRules(Checks.Com(Activator.CreateInstance(Type.GetTypeFromProgID("HNetCfg.FwPolicy2")), "Rules"));
            Log.Write("Removed from this PC");
            return "RE4 co-op is off this PC. Tailscale itself stays: uninstall it in Windows Settings if you like.";
        }

        // The re4coop WireGuard tunnel, its keys and the router port it asked for. WireGuard itself stays.
        static void RemoveOldTunnel()
        {
            var svc = "WireGuardTunnel$" + Checks.Tunnel;
            if (Exists(svc))
            {
                Run(Path.Combine(WgDir, "wireguard.exe"), $"/uninstalltunnelservice {Checks.Tunnel}", check: false);
                for (int i = 0; i < 30 && Exists(svc); i++) System.Threading.Thread.Sleep(1000);
                Log.Write("Took off the old WireGuard tunnel");
            }
            if (Directory.Exists(OldConfDir)) Directory.Delete(OldConfDir, true);
            try
            {
                var maps = Checks.Com(Activator.CreateInstance(Type.GetTypeFromProgID("HNetCfg.NATUPnP")), "StaticPortMappingCollection");
                maps?.GetType().InvokeMember("Remove", BindingFlags.InvokeMethod, null, maps, new object[] { Checks.TunnelPort, "UDP" });
            }
            catch (Exception) { }
        }

        // ---------- Tailscale ----------

        static void InstallTailscale()
        {
            if (File.Exists(Checks.TsExe)) return;
            Log.Write("Installing Tailscale");
            try { Run("winget", "install --id Tailscale.Tailscale --exact --silent --accept-package-agreements --accept-source-agreements", check: false); } catch (Exception) { }
            if (File.Exists(Checks.TsExe)) return;

            // From Tailscale's own site, only if the installer carries Tailscale's valid signature.
            ServicePointManager.SecurityProtocol |= SecurityProtocolType.Tls12;
            var msi = Path.Combine(Path.GetTempPath(), "tailscale-setup-latest-amd64.msi");
            using (var web = new WebClient()) web.DownloadFile("https://pkgs.tailscale.com/stable/tailscale-setup-latest-amd64.msi", msi);
            if (!SignedBy(msi, "Tailscale")) throw new Exception("The Tailscale installer isn't validly signed by Tailscale.");
            Run("msiexec.exe", $"/i \"{msi}\" /qn", check: false);
            File.Delete(msi);
            if (!File.Exists(Checks.TsExe)) throw new Exception("Tailscale could not be installed.");
        }

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        struct FileInfo { public uint cbStruct; public string path; public IntPtr hFile, known; }
        [StructLayout(LayoutKind.Sequential)]
        struct TrustData
        {
            public uint cbStruct; public IntPtr policy, sip; public uint ui, revocation, union; public IntPtr file;
            public uint stateAction; public IntPtr state, url; public uint provFlags, uiContext; public IntPtr settings;
        }
        [DllImport("wintrust.dll", CharSet = CharSet.Unicode)] static extern int WinVerifyTrust(IntPtr hwnd, ref Guid action, ref TrustData data);

        public static bool SignedBy(string path, string subject)
        {
            var info = new FileInfo { cbStruct = (uint)Marshal.SizeOf<FileInfo>(), path = path };
            var p = Marshal.AllocHGlobal(Marshal.SizeOf<FileInfo>());
            try
            {
                Marshal.StructureToPtr(info, p, false);
                var data = new TrustData { cbStruct = (uint)Marshal.SizeOf<TrustData>(), ui = 2, union = 1, file = p };   // no UI, a file
                var action = new Guid("00AAC56B-CD44-11d0-8CC2-00C04FC295EE");   // WINTRUST_ACTION_GENERIC_VERIFY_V2
                if (WinVerifyTrust(IntPtr.Zero, ref action, ref data) != 0) return false;
            }
            finally { Marshal.FreeHGlobal(p); }
            return X509Certificate.CreateFromSignedFile(path).Subject.Contains(subject);
        }

        // ---------- Firewall ----------

        static readonly string[] OurRules = { Checks.RuleServerOut, Checks.RuleServerIn, Checks.RuleGameOld, Checks.RuleGameFriends, Checks.RuleGameOthers, Checks.RulePrefix + "tunnel port", Checks.RuleAppLink };

        static void RemoveRules(object rules)
        {
            foreach (var name in OurRules)
                for (int i = 0; i < 20; i++)
                {
                    try { Checks.Com(rules, "Item", name); } catch (Exception) { break; }
                    rules.GetType().InvokeMember("Remove", BindingFlags.InvokeMethod, null, rules, new object[] { name });
                }
        }

        // Both sides block the co-op mod's own server. The host also lets friends in over Tailscale only: the game port
        // and Premade's app link (TCP 39100).
        static void FirewallRules(string gameDir, bool host, string appExe)
        {
            var fw = Activator.CreateInstance(Type.GetTypeFromProgID("HNetCfg.FwPolicy2"));
            var rules = Checks.Com(fw, "Rules");
            RemoveRules(rules);
            Add(rules, Checks.RuleServerOut, 2, 0, null, null, Checks.ModServer, null);
            Add(rules, Checks.RuleServerIn, 1, 0, null, null, Checks.ModServer, null);
            if (!host) return;
            var re4 = gameDir == null ? null : Path.Combine(gameDir, "re4.exe");
            Add(rules, Checks.RuleGameFriends, 1, 1, 17, Checks.GamePort.ToString(), Checks.TsRange, re4);
            // Block wins over any allow rule (Windows' own "allow this app" prompt makes one), so only friends get in.
            // ponytail: IPv4 only (Windows refused a mixed list), as the co-op mod uses IPv4; add an IPv6 rule if that changes
            Add(rules, Checks.RuleGameOthers, 1, 0, 17, Checks.GamePort.ToString(), "0.0.0.0-100.63.255.255,100.128.0.0-255.255.255.255", null);
            // Tied to Premade's own .exe, so Windows doesn't ask about it when the app link starts listening.
            Add(rules, Checks.RuleAppLink, 1, 1, 6, Checks.AppLinkPort.ToString(), Checks.TsRange, appExe);
        }

        static void Add(object rules, string name, int direction, int action, int? protocol, string localPorts, string remote, string program)
        {
            var r = Activator.CreateInstance(Type.GetTypeFromProgID("HNetCfg.FWRule"));
            void Set(string prop, object v)
            {
                try { r.GetType().InvokeMember(prop, BindingFlags.SetProperty, null, r, new[] { v }); }
                catch (TargetInvocationException e) { throw new Exception($"firewall rule \"{name}\": {prop}: {e.InnerException?.Message}"); }
            }
            Set("Name", name);
            Set("Direction", direction);   // 1 in, 2 out
            Set("Action", action);         // 0 block, 1 allow
            if (protocol != null) Set("Protocol", protocol.Value);
            if (localPorts != null) Set("LocalPorts", localPorts);
            if (remote != null) Set("RemoteAddresses", remote);
            if (program != null && File.Exists(program)) Set("ApplicationName", program);
            Set("Profiles", 0x7FFFFFFF);
            Set("Enabled", true);
            try { rules.GetType().InvokeMember("Add", BindingFlags.InvokeMethod, null, rules, new[] { r }); }
            catch (TargetInvocationException e) { throw new Exception($"firewall rule \"{name}\": {e.InnerException?.Message}"); }
        }

        // ---------- helpers ----------

        static bool Exists(string service)
        {
            try { var _ = new System.ServiceProcess.ServiceController(service).Status; return true; }
            catch (InvalidOperationException) { return false; }
        }

        static string Run(string exe, string args, bool check = true)
        {
            var psi = new ProcessStartInfo(exe, args) { UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true };
            using var p = Process.Start(psi);
            var output = p.StandardOutput.ReadToEnd();
            var err = p.StandardError.ReadToEnd();
            p.WaitForExit();
            if (check && p.ExitCode != 0) throw new Exception($"{Path.GetFileName(exe)} failed: {err.Trim()}");
            return output;
        }
    }
}
