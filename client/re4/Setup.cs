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
    // Everything that needs admin (Program.cs relaunches the helper with Windows' prompt for it): Set up to host
    // (WireGuard, the re4coop tunnel as 10.66.0.1, firewall rules, the router port), adding and removing friends,
    // joining a host from an invite, and Remove from this PC. It keeps what the first setup script made (same folder,
    // keys, tunnel and rule names), so running either again is safe.
    public static class Setup
    {
        static readonly string ConfDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "RE4 co-op WireGuard");
        static readonly string Conf = Path.Combine(ConfDir, Checks.Tunnel + ".conf");
        static readonly string WgDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "WireGuard");
        static string Wg => Path.Combine(WgDir, "wg.exe");

        public static string Host(string appExe)
        {
            InstallWireGuard();
            LockConfDir();
            if (!File.Exists(Conf))
            {
                var key = Run(Wg, "genkey").Trim();
                if (key.Length != 44) throw new Exception("WireGuard couldn't make a key.");
                File.WriteAllLines(Conf, new[] { "[Interface]", "PrivateKey = " + key, $"Address = {Checks.HostIp}/24", $"ListenPort = {Checks.TunnelPort}" });
                Log.Write("Made the host tunnel file");
            }
            else if (!IsHostConf()) throw new Exception("This PC is set up as a friend. Remove it from this PC first to host.");
            StartTunnel(false);
            FirewallRules(Checks.FindGame(), true, appExe != null && File.Exists(appExe) && appExe.EndsWith(".exe", StringComparison.OrdinalIgnoreCase) ? appExe : null);
            var router = OpenRouterPort();
            Log.Write("Set up as host: tunnel, firewall rules" + (router ? ", router port" : ""));
            return "This PC is set up to host." + (router ? "" : $" The router didn't open UDP {Checks.TunnelPort} by itself: forward it to this PC in your router's settings.");
        }

        // ---------- friends (host side) ----------

        static readonly Regex Key = new Regex(@"^[A-Za-z0-9+/]{43}=$");

        // Adds a friend's public key as the next free 10.66.0.x, live and in the tunnel file. Returns "<ip> <host public key>".
        public static string AddFriend(string publicKey, string name)
        {
            if (!Key.IsMatch(publicKey ?? "")) throw new Exception("That isn't a WireGuard key.");
            if (!File.Exists(Conf) || !IsHostConf()) throw new Exception("Set this PC up to host first.");
            var text = File.ReadAllText(Conf);
            var used = Regex.Matches(text, @"AllowedIPs\s*=\s*10\.66\.0\.(\d+)/32").Cast<Match>().Select(m => int.Parse(m.Groups[1].Value)).ToList();
            var n = Enumerable.Range(2, 253).FirstOrDefault(i => !used.Contains(i));
            if (n == 0) throw new Exception("This link is full (253 friends).");
            var ip = "10.66.0." + n;
            File.AppendAllText(Conf, $"\r\n[Peer]\r\nPublicKey = {publicKey}\r\nAllowedIPs = {ip}/32\r\n");
            Run(Wg, $"set {Checks.Tunnel} peer {publicKey} allowed-ips {ip}/32");
            var names = Checks.FriendNames();
            names[ip] = string.IsNullOrWhiteSpace(name) ? "Friend " + (n - 1) : name.Trim();
            Checks.SaveFriendNames(names);
            Log.Write($"Added friend {ip}");
            return ip + " " + X25519.PublicOf(Regex.Match(text, @"PrivateKey\s*=\s*(\S+)").Groups[1].Value);
        }

        public static string RemoveFriend(string ip)
        {
            if (!Regex.IsMatch(ip ?? "", @"^10\.66\.0\.\d{1,3}$") || ip == Checks.HostIp) throw new Exception("That isn't a friend's address.");
            if (!File.Exists(Conf) || !IsHostConf()) throw new Exception("Set this PC up to host first.");
            // Each [Peer] section, with the one for this address left out.
            var sections = Regex.Split(File.ReadAllText(Conf), @"(?m)^(?=\[)");
            var peer = sections.FirstOrDefault(x => Regex.IsMatch(x, $@"AllowedIPs\s*=\s*{Regex.Escape(ip)}/32"));
            if (peer != null)
            {
                File.WriteAllText(Conf, string.Concat(sections.Where(x => x != peer)));
                Run(Wg, $"set {Checks.Tunnel} peer {Regex.Match(peer, @"PublicKey\s*=\s*(\S+)").Groups[1].Value} remove", check: false);
            }
            var names = Checks.FriendNames();
            var name = names.TryGetValue(ip, out var x2) ? x2 : ip;
            names.Remove(ip);
            Checks.SaveFriendNames(names);
            Log.Write($"Removed friend {ip}");
            return $"{name} is off your link. Their invite doesn't work any more.";
        }

        // ---------- joining (friend side) ----------

        // fields: the friend's private key, their 10.66.0.x, the host's public key and the host's ip:port, all checked by Program.ReadInvite.
        public static string Join(string key, string ip, string hostKey, string endpoint)
        {
            if (File.Exists(Conf) && IsHostConf()) throw new Exception("This PC hosts. Remove it from this PC first to join someone else.");
            InstallWireGuard();
            LockConfDir();
            File.WriteAllLines(Conf, new[] { "[Interface]", "PrivateKey = " + key, $"Address = {ip}/24", "", "[Peer]", "PublicKey = " + hostKey,
                "Endpoint = " + endpoint, $"AllowedIPs = {Checks.HostIp}/32", "PersistentKeepalive = 25" });
            StartTunnel(true);
            FirewallRules(Checks.FindGame(), false, null);
            Log.Write($"Joined as {ip}");
            return $"Joined: this PC is {ip} on your host's private link.";
        }

        // A new address from the host (their internet address changed).
        public static string NewEndpoint(string endpoint)
        {
            if (!File.Exists(Conf) || IsHostConf()) throw new Exception("Join with your host's invite first.");
            File.WriteAllText(Conf, Regex.Replace(File.ReadAllText(Conf), @"(?m)^Endpoint\s*=.*$", "Endpoint = " + endpoint));
            StartTunnel(true);
            Log.Write("Host address updated");
            return "Your host's new address is in.";
        }

        // Undoes Set up and Join: the tunnel, its keys, our firewall rules, the router port and the friend list. WireGuard stays.
        public static string Remove()
        {
            if (Exists(Svc)) { Run(Path.Combine(WgDir, "wireguard.exe"), $"/uninstalltunnelservice {Checks.Tunnel}", check: false); WaitGone(); }
            if (Directory.Exists(ConfDir)) Directory.Delete(ConfDir, true);
            RemoveRules(Checks.Com(Activator.CreateInstance(Type.GetTypeFromProgID("HNetCfg.FwPolicy2")), "Rules"));
            try
            {
                var maps = Checks.Com(Activator.CreateInstance(Type.GetTypeFromProgID("HNetCfg.NATUPnP")), "StaticPortMappingCollection");
                maps?.GetType().InvokeMember("Remove", BindingFlags.InvokeMethod, null, maps, new object[] { Checks.TunnelPort, "UDP" });
            }
            catch (Exception) { }
            Checks.SaveFriendNames(new System.Collections.Generic.Dictionary<string, string>());
            File.Delete(Checks.AddressFile);
            Log.Write("Removed from this PC");
            return "RE4 co-op is off this PC. WireGuard itself stays: uninstall it in Windows Settings if you like.";
        }

        // ---------- tunnel ----------

        static string Svc => "WireGuardTunnel$" + Checks.Tunnel;

        static bool IsHostConf() => Regex.IsMatch(File.ReadAllText(Conf), $@"Address\s*=\s*{Regex.Escape(Checks.HostIp)}/");

        // Only SYSTEM and Administrators may read the private key.
        static void LockConfDir()
        {
            Directory.CreateDirectory(ConfDir);
            var acl = new DirectorySecurity();
            acl.SetAccessRuleProtection(true, false);
            foreach (var sid in new[] { WellKnownSidType.LocalSystemSid, WellKnownSidType.BuiltinAdministratorsSid })
                acl.AddAccessRule(new FileSystemAccessRule(new SecurityIdentifier(sid, null), FileSystemRights.FullControl,
                    InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit, PropagationFlags.None, AccessControlType.Allow));
            Directory.SetAccessControl(ConfDir, acl);
        }

        // reload: install the service again so a changed tunnel file is read (the host's runs on, keeping friends connected).
        static void StartTunnel(bool reload)
        {
            if (reload && Exists(Svc)) { Run(Path.Combine(WgDir, "wireguard.exe"), $"/uninstalltunnelservice {Checks.Tunnel}", check: false); WaitGone(); }
            if (!Exists(Svc)) Run(Path.Combine(WgDir, "wireguard.exe"), $"/installtunnelservice \"{Conf}\"");
            else Run("sc.exe", $"start {Svc}", check: false);
            Run("sc.exe", $"config {Svc} start= auto", check: false);
            for (int i = 0; i < 30 && Checks.TunnelAdapter() == null; i++) System.Threading.Thread.Sleep(1000);
            if (Checks.TunnelAdapter() == null) throw new Exception("The tunnel didn't start.");
        }

        static void WaitGone()
        {
            for (int i = 0; i < 30 && (Exists(Svc) || Checks.TunnelAdapter() != null); i++) System.Threading.Thread.Sleep(1000);
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

        // Both sides block the co-op mod's own server. The host also lets friends in: the tunnel port, the game port from
        // 10.66.0.x only, and Premade's app link (TCP 39100) from 10.66.0.x.
        static void FirewallRules(string gameDir, bool host, string appExe)
        {
            var fw = Activator.CreateInstance(Type.GetTypeFromProgID("HNetCfg.FwPolicy2"));
            var rules = Checks.Com(fw, "Rules");
            RemoveRules(rules);
            Add(rules, Checks.RuleServerOut, 2, 0, null, null, Checks.ModServer, null);
            Add(rules, Checks.RuleServerIn, 1, 0, null, null, Checks.ModServer, null);
            if (!host) return;
            var re4 = gameDir == null ? null : Path.Combine(gameDir, "re4.exe");
            Add(rules, Checks.RulePrefix + "tunnel port", 1, 1, 17, Checks.TunnelPort.ToString(), null, null);
            Add(rules, Checks.RuleGameFriends, 1, 1, 17, Checks.GamePort.ToString(), "10.66.0.0/255.255.255.0", re4);
            // Block wins over any allow rule (Windows' own "allow this app" prompt makes one), so only friends get in.
            // ponytail: IPv4 only (Windows refused a mixed list), as the co-op mod uses IPv4; add an IPv6 rule if that changes
            Add(rules, Checks.RuleGameOthers, 1, 0, 17, Checks.GamePort.ToString(), "0.0.0.0-10.65.255.255,10.66.1.0-255.255.255.255", null);
            // Tied to Premade's own .exe, so Windows doesn't ask about it when the app link starts listening.
            Add(rules, Checks.RuleAppLink, 1, 1, 6, Checks.AppLinkPort.ToString(), "10.66.0.0/255.255.255.0", appExe);
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
