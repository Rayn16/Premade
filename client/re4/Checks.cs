using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Sockets;
using System.Reflection;
using System.Security.Cryptography;
using System.Text.RegularExpressions;
using Microsoft.Win32;

namespace RE4Helper
{
    public enum Level { Good, Warn, Bad, Idle }

    public class Row
    {
        public Level Level; public string Title; public string Detail;
        public Row(Level level, string title, string detail) { Level = level; Title = title; Detail = detail; }
    }

    public enum Mod { None, Theirs, Ours }

    // Everything Premade's RE4 co-op page shows, read without admin rights. Names, paths and rule names match
    // the setup and mod-switch scripts this started from, so it sees what they did.
    public class Snapshot
    {
        public bool IsHost;
        public string TunnelIp, HostIp, TsState;   // this PC's Tailscale address, the host's (on a friend's PC), Tailscale's state
        public List<Row> Connection = new List<Row>(), Privacy = new List<Row>(), Game = new List<Row>();
        public Row Saves;
        public Mod Mod;
        public bool ModOk, Re4Running, ServerBlocked, GamePortAllowed, OthersBlocked, AppLinkAllowed, FirewallOn;
        public string GameDir, Build = "", ModVersion = "";
    }

    public static class Checks
    {
        public const int AppId = 2050650;   // Resident Evil 4 (2023) on Steam
        public const string Tunnel = "re4coop";   // the WireGuard tunnel of 1.28.10 and before, taken off by Set up, Join and Remove
        public const int TunnelPort = 51820, GamePort = 39000, AppLinkPort = 39100;
        public const string TsRange = "100.64.0.0/255.192.0.0";   // every Tailscale address
        public static string TsExe => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), @"Tailscale\tailscale.exe");
        public const string ModServer = "2.25.197.34";
        public const string RulePrefix = "RE4 co-op WireGuard: ";
        public const string RuleServerOut = RulePrefix + "block their mod server (out)";
        public const string RuleServerIn = RulePrefix + "block their mod server (in)";
        public const string RuleGameFriends = RulePrefix + "game, from friends only";   // Tailscale addresses, made by Set up
        public const string RuleGameOld = RulePrefix + "game, from cutiecatty only";     // the first setup script's, 10.66.0.2 only
        public const string RuleGameOthers = RulePrefix + "game, everyone else blocked";
        public const string RuleAppLink = RulePrefix + "Premade app link, from friends only";

        public static string Documents => Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments);
        public static string BackupRoot => Path.Combine(Documents, @"re4r_coop\save_backups");
        public static string RoleFile => Path.Combine(Documents, @"RE4 co-op\role.txt");   // "host", or "friend <host's Tailscale address>"
        static string FriendsFile => Path.Combine(Documents, @"RE4 co-op\friends.json");   // the names the host made invites for

        public static List<string> FriendNames()
        {
            try { return new System.Web.Script.Serialization.JavaScriptSerializer().Deserialize<List<string>>(File.ReadAllText(FriendsFile)) ?? new List<string>(); }
            catch (Exception) { return new List<string>(); }
        }

        public static void SaveFriendNames(List<string> names)
        {
            Directory.CreateDirectory(Path.GetDirectoryName(FriendsFile));
            File.WriteAllText(FriendsFile, new System.Web.Script.Serialization.JavaScriptSerializer().Serialize(names));
        }

        public static bool IsTsAddress(string ip) =>
            IPAddress.TryParse(ip ?? "", out var a) && a.AddressFamily == AddressFamily.InterNetwork && a.GetAddressBytes() is var b && b[0] == 100 && b[1] >= 64 && b[1] < 128;

        // REFramework's dinput8.dll (MIT, praydog), our build of commit d4611aef: put in for friends who don't have it.
        public const string REFramework = "0466ed158a3a3a3ada8debb0320a7eb4774b0e7a9c835928e4c9d101541abb6f";

        // Their files that go in the game, with the SHA-256 we checked on 2026-10-30 (same list as re4-switch-mod.ps1).
        public static readonly Dictionary<string, string> TheirFiles = new Dictionary<string, string>
        {
            ["reframework/plugins/Re4-Co-op.dll"] = "4529da6d24621502eb78df90eca95ab28a43d9a315dff517d968c890c873bb8a",
            ["reframework/autorun/data.lua"] = "b9d5db19afa3162a09b30ed0c8c155752efedade9eeba39e5af48fbe83259b8a",
            ["reframework/autorun/logic.lua"] = "5a7742aee66d7027e772b9c661c6d1c24f7dfdf3cca44d2bf9b8a5b2a9ba737c",
            ["reframework/autorun/module.lua"] = "58963d967a990eee4ad4b0f2e20b5b2e57a54128c4867377951b709fac41f957",
            ["reframework/autorun/runtime.lua"] = "2c3d121c8da001d3192772a8e237c48a57b3f170aed4cc747bb84319d40fb044",
            ["reframework/autorun/shared.lua"] = "16ad7f874292926bf5212d6a0e3653bd582537b904fe2897a2832ea61ea0ddd4",
            ["reframework/autorun/sub 1.lua"] = "cb2b1e2cd4c00ba7f6934d52b91c2340db4081dbb2a6de2e44a2319ac2bd7156",
            ["reframework/autorun/system.lua"] = "9e706a2d1ae23851cc7fb6dbec0f2bdeacddcd07e124cc02de2dec6ba12e7def",
            ["reframework/data/type_remaps_auto.json"] = "2f6146ab89fe3460dbdacbf1504e0d7d1bd4ec65831b5214e8e742f1ec92b60d",
            ["natives/stm/_chainsaw/Sound/Wwise/ch_cha0_voice_media.sbnk.1.X64.En"] = "884d876bbe1ab3ee56a599fbc9d7054ccca6606a5f5066f8c18d3b096b55e37e",
        };

        public static Snapshot Gather()
        {
            var s = new Snapshot();
            Try(() => TailscaleRows(s), s.Connection, "Tailscale");
            Try(() => FirewallRows(s), s.Privacy, "Windows Firewall");
            Try(() => GameRows(s), s.Game, "RE4");
            Try(() => s.Saves = SavesRow(), null, null);
            s.Saves ??= new Row(Level.Bad, "Saves: couldn't read the backups folder", "");
            return s;
        }

        // A check that throws shows as its own red line instead of taking the dashboard down.
        static void Try(Action a, List<Row> into, string what)
        {
            try { a(); }
            catch (Exception e)
            {
                Log.Write($"{what ?? "check"} failed: {e.GetType().Name}: {e.Message}");
                into?.Add(new Row(Level.Bad, $"{what}: couldn't check", e.Message));
            }
        }

        // ---------- Connection ----------

        // Tailscale carries the game between PCs, through any router: its own state and this PC's address, read without
        // admin. Which side this PC is comes from Set up or Join (role.txt).
        static void TailscaleRows(Snapshot s)
        {
            var role = File.Exists(RoleFile) ? File.ReadAllText(RoleFile).Trim().Split(' ') : new string[0];
            s.IsHost = role.FirstOrDefault() == "host";
            if (role.FirstOrDefault() == "friend" && IsTsAddress(role.ElementAtOrDefault(1))) s.HostIp = role[1];
            if (!File.Exists(TsExe)) { s.TsState = "missing"; s.Connection.Add(new Row(Level.Bad, "Tailscale not installed", "Set up or Join installs it")); return; }
            var json = Run(TsExe, "status --json");
            var st = new System.Web.Script.Serialization.JavaScriptSerializer { MaxJsonLength = 1 << 24 }.Deserialize<Dictionary<string, object>>(json);
            s.TsState = st.TryGetValue("BackendState", out var b) ? b as string : null;
            var self = st.TryGetValue("Self", out var me) ? me as Dictionary<string, object> : null;
            var ips = self != null && self.TryGetValue("TailscaleIPs", out var l) ? (l as System.Collections.ArrayList)?.Cast<object>().Select(x => x as string) : null;
            if (s.TsState == "Running") s.TunnelIp = ips?.FirstOrDefault(IsTsAddress);
            if (s.TsState == "Running" && s.TunnelIp != null) s.Connection.Add(new Row(Level.Good, "Tailscale connected", $"this PC is {s.TunnelIp}"));
            else if (s.TsState == "NeedsLogin" || s.TsState == "NoState") s.Connection.Add(new Row(Level.Bad, "Tailscale: sign in", "press Sign in to Tailscale"));
            else s.Connection.Add(new Row(Level.Bad, "Tailscale not connected", "open Tailscale from the Start menu and connect"));
        }

        static string Run(string exe, string args)
        {
            var psi = new ProcessStartInfo(exe, args) { UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true };
            using var p = Process.Start(psi);
            var o = p.StandardOutput.ReadToEndAsync();
            p.StandardError.ReadToEnd();
            if (!p.WaitForExit(20000)) { try { p.Kill(); } catch (Exception) { } throw new Exception("Tailscale didn't answer"); }
            return o.Result;
        }

        // Method or property (Rules.Item is a method; GetProperty alone never finds a rule).
        public static object Com(object o, string name, params object[] args) =>
            o.GetType().InvokeMember(name, BindingFlags.InvokeMethod | BindingFlags.GetProperty, null, o, args);

        // ---------- Privacy ----------

        static void FirewallRows(Snapshot s)
        {
            var fw = Activator.CreateInstance(Type.GetTypeFromProgID("HNetCfg.FwPolicy2"));
            var off = new List<string>();
            foreach (var (bit, name) in new[] { (1, "Domain"), (2, "Private"), (4, "Public") })
                if (!(bool)Com(fw, "FirewallEnabled", bit)) off.Add(name);
            s.FirewallOn = off.Count == 0;
            s.Privacy.Add(off.Count == 0
                ? new Row(Level.Good, "Windows Firewall on", "all network types")
                : new Row(Level.Bad, "Windows Firewall off", "for " + string.Join(", ", off) + "; the rules below only work while it's on"));

            var rules = Com(fw, "Rules");
            object Rule(string n) { try { return Com(rules, "Item", n); } catch (Exception) { return null; } }
            bool On(object r) => r != null && (bool)Com(r, "Enabled");
            bool Blocks(object r) => On(r) && (int)Com(r, "Action") == 0;
            string Remote(object r) => (string)Com(r, "RemoteAddresses") ?? "";

            s.ServerBlocked = new[] { RuleServerOut, RuleServerIn }.Select(Rule).All(r => Blocks(r) && Remote(r).StartsWith(ModServer));
            s.Privacy.Add(s.ServerBlocked
                ? new Row(Level.Good, "Their mod's server blocked", "in and out")
                : new Row(Level.Bad, "Their mod's server not blocked", "the block rules are missing or off"));

            if (!s.IsHost) { s.Privacy.Add(new Row(Level.Idle, "Game port", "only the host needs this rule")); return; }
            var allow = Rule(RuleGameFriends) ?? Rule(RuleGameOld);
            s.GamePortAllowed = On(allow) && (int)Com(allow, "Action") == 1 && Remote(allow).StartsWith("100.64.0.0/");
            var othersBlocked = s.OthersBlocked = Blocks(Rule(RuleGameOthers));
            var link = Rule(RuleAppLink);
            s.AppLinkAllowed = On(link) && (int)Com(link, "Action") == 1;
            if (s.GamePortAllowed && othersBlocked) s.Privacy.Add(new Row(Level.Good, "Game port: friends only", $"UDP {GamePort}, everyone else blocked"));
            else if (s.GamePortAllowed) s.Privacy.Add(new Row(Level.Warn, "Game port open to your friend", $"UDP {GamePort}, but not yet blocked for everyone else"));
            else s.Privacy.Add(new Row(Level.Bad, "Game port rule missing", $"nothing lets only your friends reach UDP {GamePort}"));
        }

        // ---------- Game ----------

        public static string FindGame()
        {
            foreach (var view in new[] { RegistryView.Registry64, RegistryView.Registry32 })
            {
                using var hk = RegistryKey.OpenBaseKey(RegistryHive.LocalMachine, view);
                using var k = hk.OpenSubKey($@"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\Steam App {AppId}");
                var dir = k?.GetValue("InstallLocation") as string;
                if (dir != null && File.Exists(Path.Combine(dir, "re4.exe"))) return dir;
            }
            var guess = @"C:\Program Files (x86)\Steam\steamapps\common\RESIDENT EVIL 4  BIOHAZARD RE4";
            return File.Exists(Path.Combine(guess, "re4.exe")) ? guess : null;
        }

        static void GameRows(Snapshot s)
        {
            s.Re4Running = Process.GetProcessesByName("re4").Length > 0;
            s.GameDir = FindGame();
            if (s.GameDir == null)
            {
                s.Game.Add(new Row(Level.Bad, "RE4 not found", "Steam doesn't list it on this PC"));
                return;
            }
            var acf = Path.GetFullPath(Path.Combine(s.GameDir, $@"..\..\appmanifest_{AppId}.acf"));
            var build = s.Build = File.Exists(acf) ? Regex.Match(File.ReadAllText(acf), "\"buildid\"\\s+\"(\\d+)\"").Groups[1].Value : "";
            s.Game.Add(new Row(Level.Good, "RE4 found", build != "" ? $"Steam build {build}" : "Steam build unknown"));

            var state = Path.Combine(s.GameDir, "re4r_coop_install");
            if (File.Exists(Path.Combine(state, "their-mod.json")))
            {
                s.Mod = Mod.Theirs;
                var bad = TheirFiles.Count(f => Sha256(Path.Combine(s.GameDir, f.Key)) != f.Value);
                s.ModOk = bad == 0;
                s.Game.Add(s.ModOk
                    ? new Row(Level.Good, "Their mod is in", $"{TheirFiles.Count} of {TheirFiles.Count} files match the checked version")
                    : new Row(Level.Bad, "Their mod is in, but changed", $"{bad} of {TheirFiles.Count} files aren't the checked version"));
            }
            else if (File.Exists(Path.Combine(state, "manifest.json")))
            {
                s.Mod = Mod.Ours;
                s.ModOk = true;
                var lua = Path.Combine(s.GameDir, @"reframework\autorun\re4r_coop.lua");
                var v = s.ModVersion = File.Exists(lua) ? Regex.Match(File.ReadAllText(lua), "local VERSION = \"([^\"]+)\"").Groups[1].Value : "";
                s.Game.Add(new Row(Level.Good, "Our mod is in", v != "" ? v : "version unknown"));
            }
            else s.Game.Add(new Row(Level.Idle, "No co-op mod in the game", "neither theirs nor ours"));

            s.Game.Add(s.Re4Running
                ? new Row(Level.Good, "Running", "RE4 is open")
                : new Row(Level.Idle, "Not running", "Play starts it through Steam"));
        }

        public static string Sha256(string path)
        {
            if (!File.Exists(path)) return null;
            using var sha = SHA256.Create();
            using var f = File.OpenRead(path);
            return BitConverter.ToString(sha.ComputeHash(f)).Replace("-", "").ToLowerInvariant();
        }

        // ---------- Saves ----------

        public static DateTime? LastBackup()
        {
            if (!Directory.Exists(BackupRoot)) return null;
            return Directory.GetDirectories(BackupRoot)
                .Select(d => DateTime.TryParseExact(Path.GetFileName(d), "yyyyMMdd-HHmmss", CultureInfo.InvariantCulture, DateTimeStyles.None, out var t) ? t : (DateTime?)null)
                .Where(t => t != null).Max();
        }

        static Row SavesRow()
        {
            var last = LastBackup();
            if (last == null) return new Row(Level.Warn, "Saves: no backup yet", "Play backs them up first");
            var age = DateTime.Now - last.Value;
            var when = age.TotalMinutes < 2 ? "just now"
                : age.TotalHours < 1 ? $"{(int)age.TotalMinutes} minutes ago"
                : last.Value.Date == DateTime.Today ? "today at " + last.Value.ToString("HH:mm")
                : age.TotalDays < 2 ? "yesterday"
                : $"{(int)age.TotalDays} days ago";
            return new Row(age.TotalDays < 1 ? Level.Good : Level.Warn, "Saves: last backup " + when, "Play backs them up first");
        }

        // Copies Steam\userdata\<id>\2050650 to Documents\re4r_coop\save_backups\<stamp>\<id>, keeps the newest 30.
        public static int BackUpSaves()
        {
            var steam = Registry.GetValue(@"HKEY_CURRENT_USER\Software\Valve\Steam", "SteamPath", null) as string;
            var userdata = steam == null ? null : Path.Combine(steam.Replace('/', '\\'), "userdata");
            if (userdata == null || !Directory.Exists(userdata)) return 0;
            var dest = Path.Combine(BackupRoot, DateTime.Now.ToString("yyyyMMdd-HHmmss"));
            int n = 0;
            foreach (var user in Directory.GetDirectories(userdata))
            {
                var save = Path.Combine(user, AppId.ToString());
                if (!Directory.Exists(save)) continue;
                CopyDir(save, Path.Combine(dest, Path.GetFileName(user)));
                n++;
            }
            if (n == 0) return 0;
            Log.Write($"Saves backed up to {dest}");
            // Only ever deletes its own oldest backups (folders named like a stamp).
            var old = Directory.GetDirectories(BackupRoot)
                .Where(d => Regex.IsMatch(Path.GetFileName(d), @"^\d{8}-\d{6}$"))
                .OrderByDescending(d => Path.GetFileName(d), StringComparer.Ordinal).Skip(30);
            foreach (var d in old) { Directory.Delete(d, true); Log.Write($"Deleted old backup {Path.GetFileName(d)}"); }
            return n;
        }

        static void CopyDir(string from, string to)
        {
            Directory.CreateDirectory(to);
            foreach (var f in Directory.GetFiles(from)) File.Copy(f, Path.Combine(to, Path.GetFileName(f)), true);
            foreach (var d in Directory.GetDirectories(from)) CopyDir(d, Path.Combine(to, Path.GetFileName(d)));
        }
    }
}
