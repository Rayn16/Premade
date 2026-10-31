using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Cryptography.X509Certificates;
using System.Security.Principal;
using System.Text.RegularExpressions;

namespace RE4Helper
{
    // Set up this PC to host (needs admin; Program.cs relaunches the helper with Windows' prompt for it):
    // WireGuard, the re4coop tunnel as 10.66.0.1, firewall rules and the router port. It keeps what the first setup
    // script made (same folder, keys, tunnel and rule names), so running either again is safe.
    public static class Setup
    {
        static readonly string ConfDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "RE4 co-op WireGuard");
        static readonly string Conf = Path.Combine(ConfDir, Checks.Tunnel + ".conf");
        static readonly string WgDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "WireGuard");
        static string Wg => Path.Combine(WgDir, "wg.exe");

        public static string Host()
        {
            InstallWireGuard();
            Directory.CreateDirectory(ConfDir);
            // Only SYSTEM and Administrators may read the private key.
            var acl = new DirectorySecurity();
            acl.SetAccessRuleProtection(true, false);
            foreach (var sid in new[] { WellKnownSidType.LocalSystemSid, WellKnownSidType.BuiltinAdministratorsSid })
                acl.AddAccessRule(new FileSystemAccessRule(new SecurityIdentifier(sid, null), FileSystemRights.FullControl,
                    InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit, PropagationFlags.None, AccessControlType.Allow));
            Directory.SetAccessControl(ConfDir, acl);
            if (!File.Exists(Conf))
            {
                var key = Run(Wg, "genkey").Trim();
                if (key.Length != 44) throw new Exception("WireGuard couldn't make a key.");
                File.WriteAllLines(Conf, new[] { "[Interface]", "PrivateKey = " + key, $"Address = {Checks.HostIp}/24", $"ListenPort = {Checks.TunnelPort}" });
                Log.Write("Made the host tunnel file");
            }

            var svc = "WireGuardTunnel$" + Checks.Tunnel;
            if (!Exists(svc)) Run(Path.Combine(WgDir, "wireguard.exe"), $"/installtunnelservice \"{Conf}\"");
            else Run("sc.exe", $"start {svc}", check: false);
            Run("sc.exe", $"config {svc} start= auto", check: false);
            for (int i = 0; i < 30 && Checks.TunnelAdapter() == null; i++) System.Threading.Thread.Sleep(1000);
            if (Checks.TunnelAdapter() == null) throw new Exception("The tunnel didn't start.");

            FirewallRules(Checks.FindGame());
            var router = OpenRouterPort();
            Log.Write("Set up as host: tunnel, firewall rules" + (router ? ", router port" : ""));
            return "This PC is set up to host." + (router ? "" : $" The router didn't open UDP {Checks.TunnelPort} by itself: forward it to this PC in your router's settings.");
        }

        // ---------- WireGuard ----------

        static void InstallWireGuard()
        {
            if (File.Exists(Wg)) return;
            Log.Write("Installing WireGuard");
            try { Run("winget", "install --id WireGuard.WireGuard --exact --silent --accept-package-agreements --accept-source-agreements", check: false); } catch (Exception) { }
            if (File.Exists(Wg)) return;

            // From WireGuard's own site, only if the installer carries WireGuard LLC's valid signature.
            ServicePointManager.SecurityProtocol |= SecurityProtocolType.Tls12;
            using var web = new WebClient();
            const string baseUrl = "https://download.wireguard.com/windows-client/";
            var m = Regex.Match(web.DownloadString(baseUrl + "latest.sig"), @"(?m)^[0-9a-f]{64}\s+(wireguard-amd64-[0-9.]+\.msi)\s*$");
            if (!m.Success) throw new Exception("WireGuard's download list has no installer for this PC.");
            var msi = Path.Combine(Path.GetTempPath(), m.Groups[1].Value);
            web.DownloadFile(baseUrl + m.Groups[1].Value, msi);
            if (!SignedBy(msi, "WireGuard LLC")) throw new Exception("The WireGuard installer isn't validly signed by WireGuard.");
            Run("msiexec.exe", $"/i \"{msi}\" /qn DO_NOT_LAUNCH=1", check: false);
            if (!File.Exists(Wg)) throw new Exception("WireGuard could not be installed.");
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

        static void FirewallRules(string gameDir)
        {
            var fw = Activator.CreateInstance(Type.GetTypeFromProgID("HNetCfg.FwPolicy2"));
            var rules = Checks.Com(fw, "Rules");
            foreach (var name in new[] { Checks.RuleServerOut, Checks.RuleServerIn, Checks.RuleGameOld, Checks.RuleGameFriends, Checks.RuleGameOthers, Checks.RulePrefix + "tunnel port" })
                for (int i = 0; i < 20; i++)
                {
                    try { Checks.Com(rules, "Item", name); } catch (Exception) { break; }
                    rules.GetType().InvokeMember("Remove", BindingFlags.InvokeMethod, null, rules, new object[] { name });
                }
            var re4 = gameDir == null ? null : Path.Combine(gameDir, "re4.exe");
            Add(rules, Checks.RuleServerOut, 2, 0, null, null, Checks.ModServer, null);
            Add(rules, Checks.RuleServerIn, 1, 0, null, null, Checks.ModServer, null);
            Add(rules, Checks.RulePrefix + "tunnel port", 1, 1, 17, Checks.TunnelPort.ToString(), null, null);
            Add(rules, Checks.RuleGameFriends, 1, 1, 17, Checks.GamePort.ToString(), "10.66.0.0/255.255.255.0", re4);
            // Block wins over any allow rule (Windows' own "allow this app" prompt makes one), so only friends get in.
            // ponytail: IPv4 only (Windows refused a mixed list), as the co-op mod uses IPv4; add an IPv6 rule if that changes
            Add(rules, Checks.RuleGameOthers, 1, 0, 17, Checks.GamePort.ToString(), "0.0.0.0-10.65.255.255,10.66.1.0-255.255.255.255", null);
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

        // ---------- Router ----------

        // UPnP, which many routers forget after a restart, so Play asks again. Needs no admin.
        public static bool OpenRouterPort()
        {
            try
            {
                var lan = NetworkInterface.GetAllNetworkInterfaces()
                    .Where(n => n.OperationalStatus == OperationalStatus.Up && n.GetIPProperties().GatewayAddresses.Any(g => g.Address.AddressFamily == AddressFamily.InterNetwork))
                    .SelectMany(n => n.GetIPProperties().UnicastAddresses).FirstOrDefault(a => a.Address.AddressFamily == AddressFamily.InterNetwork)?.Address.ToString();
                var nat = Activator.CreateInstance(Type.GetTypeFromProgID("HNetCfg.NATUPnP"));
                var maps = Checks.Com(nat, "StaticPortMappingCollection");
                if (lan == null || maps == null) return false;
                var t = maps.GetType();
                try { t.InvokeMember("Remove", BindingFlags.InvokeMethod, null, maps, new object[] { Checks.TunnelPort, "UDP" }); } catch (Exception) { }
                t.InvokeMember("Add", BindingFlags.InvokeMethod, null, maps, new object[] { Checks.TunnelPort, "UDP", Checks.TunnelPort, lan, true, "RE4 co-op WireGuard" });
                return true;
            }
            catch (Exception e) { Log.Write("Router port: " + e.Message); return false; }
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
