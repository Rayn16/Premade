using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using System.Web.Script.Serialization;

namespace RE4Helper
{
    // re4-helper.exe, run by Premade's app (client/main.js) for the RE4 co-op page. One command per run, JSON on stdout:
    //   status   every check (no admin)
    //   backup   back up RE4's saves, then status
    //   play     back up saves, start RE4 through Steam unless something's wrong, then status
    //   backups  open the backups folder, then status
    //   setup [premade.exe]  set this PC up to host: Tailscale and firewall rules (Windows asks for admin once), then status
    //   signin   open Tailscale's sign-in page, then status
    //   share    host: open Tailscale's page for this PC, where Share makes the link that goes in an invite
    //   char <name>  with their mod in a running game: play as that character (their mod's own command file)
    //   theirs   put the downloaded co-op mod in the game in place of ours, then status
    //   ours     switch back to ours, then status
    //   invite   host: "<name>\n<Tailscale share link>" on stdin; the invite code comes back as "invite"
    //   unfriend <name>    host: take a name off the friends list
    //   join     friend: an invite on stdin (Windows asks), then opens its share link to accept
    //   remove   undo Set up or Join on this PC (Windows asks)
    public static class Program
    {
        public static int Main(string[] args)
        {
            var what = args.FirstOrDefault() ?? "status";
            object result;
            try
            {
                string note = null;
                if (what == "backup") note = Backup();
                else if (what == "play") note = Play();
                else if (what == "setup") note = SetUp(args);
                else if (what == "signin") note = SignIn();
                else if (what == "share") note = Share();
                else if (what == "invite") note = MakeInvite(Console.In.ReadToEnd());
                else if (what == "unfriend") note = Unfriend(args.ElementAtOrDefault(1));
                else if (what == "join") note = Join(args);
                else if (what == "remove") note = Remove(args);
                else if (what == "char") note = Character(args.ElementAtOrDefault(1));
                else if (what == "theirs") note = Switch.ToTheirs();
                else if (what == "ours") note = Switch.ToOurs();
                else if (what == "backups") { Directory.CreateDirectory(Checks.BackupRoot); Process.Start("explorer.exe", "\"" + Checks.BackupRoot + "\""); }
                else if (what != "status") throw new ArgumentException("unknown command " + what);
                result = Json(Checks.Gather(), note);
            }
            catch (Exception e) when (what != "status")
            {
                // A refused step says why on the page, with the checks still shown.
                Log.Write($"{what} failed: {e}");
                result = Json(Checks.Gather(), e.GetBaseException().Message);
            }
            catch (Exception e)
            {
                Log.Write($"{what} failed: {e}");
                result = new { error = e.Message };
            }
            Console.Out.Write(new JavaScriptSerializer().Serialize(result));
            return 0;
        }

        static string Backup()
        {
            var n = Checks.BackUpSaves();
            return n > 0 ? $"Saves backed up for {n} Steam account{(n == 1 ? "" : "s")}." : "No RE4 saves found in Steam to back up.";
        }

        static string Play()
        {
            var backed = Backup();
            var s = Checks.Gather();
            var why = WhyNotPlay(s);
            if (why != null) { Log.Write("Play stopped: " + why); return why; }
            Log.Write("Starting RE4 through Steam");
            Process.Start("steam://rungameid/" + Checks.AppId);
            return backed + " Starting RE4...";
        }

        public static string WhyNotPlay(Snapshot s)
        {
            if (s.GameDir == null) return "RE4 isn't installed through Steam on this PC.";
            if (s.Re4Running) return "RE4 is already running.";
            if (s.Mod == Mod.Theirs && !s.ModOk) return "The co-op mod's files changed from the checked version, so Play won't start them.";
            if (s.Mod == Mod.Theirs && !s.ServerBlocked) return "Block the co-op mod's own server first (Privacy).";
            if ((s.IsHost || s.HostIp != null) && s.TunnelIp == null) return "Connect Tailscale first (Connection).";
            if (s.Mod == Mod.Theirs && s.IsHost && !s.GamePortAllowed) return "The game port rule is missing (Privacy).";
            return null;
        }

        // A step that needs admin: the helper starts itself again through Windows' prompt with the same arguments and
        // waits for it; that copy does the work and leaves its answer in a file.
        static string Elevated(string[] args, Func<string> work)
        {
            var result = Path.Combine(Path.GetTempPath(), "re4-setup-result.txt");
            if (args.Contains("--elevated"))
            {
                string note;
                try { note = work(); } catch (Exception e) { Log.Write($"{args[0]} failed: {e}"); note = "Stopped: " + e.GetBaseException().Message; }
                File.WriteAllText(result, note);
                return note;
            }
            File.Delete(result);
            try
            {
                var line = string.Join(" ", args.Select(a => "\"" + a.Replace("\"", "") + "\"")) + " --elevated";
                var psi = new ProcessStartInfo(System.Reflection.Assembly.GetExecutingAssembly().Location, line) { UseShellExecute = true, Verb = "runas", WindowStyle = ProcessWindowStyle.Hidden };
                using var p = Process.Start(psi);
                p.WaitForExit();
            }
            catch (System.ComponentModel.Win32Exception e) when (e.NativeErrorCode == 1223) { return "This needs you to click Yes in Windows' prompt."; }
            var note2 = File.Exists(result) ? File.ReadAllText(result) : "Stopped: no answer from the step that needed admin.";
            File.Delete(result);
            return note2;
        }

        // ---------- Tailscale, invites ----------
        // An invite is "RE4COOP2." + base64 of "<friend's name>|<host's Tailscale address>|<Tailscale share link>". The
        // share link lets one Tailscale account see the host's PC, so it goes to the friend privately.

        static string Invite;   // shown on the page once, never written to a file or the log

        static void Role(string line)
        {
            Directory.CreateDirectory(Path.GetDirectoryName(Checks.RoleFile));
            if (line == null) File.Delete(Checks.RoleFile); else File.WriteAllText(Checks.RoleFile, line);
        }

        static string SetUp(string[] args)
        {
            if (Checks.Gather().HostIp != null && !args.Contains("--elevated")) throw new Exception("This PC is set up as a friend. Remove it from this PC first to host.");
            var note = Elevated(args, () => Setup.Host(args.Skip(1).FirstOrDefault(a => a != "--elevated")));
            if (note.StartsWith("This PC is set up") && !args.Contains("--elevated")) Role("host");
            return note;
        }

        // Tailscale's own sign-in, in the browser: "tailscale up" prints the page to open and finishes once signed in.
        static string SignIn()
        {
            if (!File.Exists(Checks.TsExe)) throw new Exception("Set up or Join first: it installs Tailscale.");
            var psi = new ProcessStartInfo(Checks.TsExe, "up") { UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true };
            var p = Process.Start(psi);
            string url = null;
            void Look(string line) { var m = System.Text.RegularExpressions.Regex.Match(line ?? "", @"https://login\.tailscale\.com/\S+"); if (m.Success && url == null) url = m.Value; }
            p.OutputDataReceived += (_, e) => Look(e.Data);
            p.ErrorDataReceived += (_, e) => Look(e.Data);
            p.BeginOutputReadLine();
            p.BeginErrorReadLine();
            for (int i = 0; i < 60 && url == null && !p.HasExited; i++) System.Threading.Thread.Sleep(500);
            if (url == null) return p.HasExited && p.ExitCode == 0 ? "Tailscale is signed in." : "Tailscale didn't show a sign-in page. Open Tailscale from the Start menu and sign in there.";
            Process.Start(url);
            return "Sign in to Tailscale in your browser, then come back here.";
        }

        static string Share()
        {
            var me = Checks.Gather();
            if (!me.IsHost || me.TunnelIp == null) throw new Exception("Set up to host and connect Tailscale first.");
            Process.Start("https://login.tailscale.com/admin/machines/" + me.TunnelIp);
            return "Tailscale opened this PC's page: press Share..., copy the invite link, and paste it here.";
        }

        static readonly System.Text.RegularExpressions.Regex ShareLink = new System.Text.RegularExpressions.Regex(@"^https://login\.tailscale\.com/[A-Za-z0-9/_\-]{1,200}$");

        static string MakeInvite(string input)
        {
            var lines = (input ?? "").Trim('\uFEFF').Split('\n').Select(l => l.Trim()).ToArray();
            var name = lines.ElementAtOrDefault(0) ?? "";
            var link = lines.ElementAtOrDefault(1) ?? "";
            if (name.Length == 0 || name.Length > 40 || name.Contains("|")) throw new Exception("Give your friend a name (up to 40 letters).");
            if (!ShareLink.IsMatch(link)) throw new Exception("Paste the invite link from Tailscale's Share... (it starts with https://login.tailscale.com/).");
            var me = Checks.Gather();
            if (!me.IsHost || me.TunnelIp == null) throw new Exception("Set up to host and connect Tailscale first.");
            Invite = "RE4COOP2." + Convert.ToBase64String(System.Text.Encoding.UTF8.GetBytes($"{name}|{me.TunnelIp}|{link}"));
            var names = Checks.FriendNames();
            if (!names.Contains(name)) { names.Add(name); Checks.SaveFriendNames(names); }
            Log.Write("Made an invite");
            return $"Invite for {name} ready. Copy it and send it to them in a private message.";
        }

        static string Unfriend(string name)
        {
            var names = Checks.FriendNames();
            names.Remove(name ?? "");
            Checks.SaveFriendNames(names);
            return $"{name} is off your list. To stop them reaching this PC, remove their share on Tailscale's page for this PC.";
        }

        // The code comes on stdin, so it never shows in a process list. The admin step only sets up Tailscale and the
        // firewall; the checked fields are kept here, by this user.
        static string Join(string[] args)
        {
            if (args.Contains("--elevated")) return Elevated(args, Setup.Join);
            var f = ReadCode(Console.In.ReadToEnd());
            if (Checks.Gather().IsHost) throw new Exception("This PC hosts. Remove it from this PC first to join someone else.");
            var note = Elevated(new[] { "join" }, Setup.Join);
            if (note != "Joined.") return note;
            Role($"friend {f[1]} {f[0]}");
            Process.Start(f[2]);
            return "Joined. Accept your host's share in the browser (sign in to Tailscale if it asks), and you're on their link.";
        }

        static string Remove(string[] args)
        {
            var note = Elevated(args, Setup.Remove);
            if (note.StartsWith("RE4 co-op is off") && !args.Contains("--elevated")) { Role(null); Checks.SaveFriendNames(new System.Collections.Generic.List<string>()); }
            return note;
        }

        // Outside input: every field is checked before anything is kept or opened.
        public static string[] ReadCode(string code)
        {
            code = (code ?? "").Trim().Trim('\uFEFF').Trim();   // a pasted or piped code may carry a byte-order mark
            string[] f = null;
            if (code.StartsWith("RE4COOP2."))
                try { f = System.Text.Encoding.UTF8.GetString(Convert.FromBase64String(code.Substring(9))).Split('|'); } catch (FormatException) { }
            if (f == null || f.Length != 3 || f[0].Trim().Length == 0 || f[0].Length > 40 || !Checks.IsTsAddress(f[1]) || !ShareLink.IsMatch(f[2]))
                throw new Exception(code.StartsWith("RE4COOP1.") ? "That's an invite from before Tailscale. Ask your host for a new one."
                    : "That isn't an RE4 co-op invite. Copy the whole code your host sent.");
            return f;
        }

        // Their mod's "Change Character (play as selected)" button writes this one-line command for its scripts; Premade
        // writes the same line. ClayBTV's list, minus Krauser, which his mod marks broken.
        public static readonly string[] Characters = { "Default", "Leon", "Ada", "Ashley", "Luis", "HUNK", "Wesker" };
        static string Character(string name)
        {
            if (!Characters.Contains(name)) throw new ArgumentException("unknown character " + name);
            var s = Checks.Gather();
            if (s.Mod != Mod.Theirs) return "Play as works with Their mod in the game.";
            if (!s.Re4Running) return "Start RE4 and load into your game first, then pick who you play as.";
            var file = Path.Combine(s.GameDir, @"reframework\data\RE4MP_mplus_cmd.json");
            long seq;
            long.TryParse(Regex.Match(File.Exists(file) ? File.ReadAllText(file) : "", @"""seq"":(\d+)").Groups[1].Value, out seq);
            File.WriteAllText(file, $"{{\"seq\":{seq + 1},\"action\":\"set_char\",\"enemy\":\"{name}\",\"idx\":-1}}");
            Log.Write("Play as " + name);
            return $"Switching you to {name}. Pick once and stay: every switch reloads the game's sounds and animations.";
        }

        // What their mod says about itself while RE4 runs: connected or not, and how the last character switch went.
        static object InGame(Snapshot s)
        {
            if (s.Mod != Mod.Theirs || !s.Re4Running) return null;
            Func<string, string> read = (f) => { try { return File.ReadAllText(Path.Combine(s.GameDir, @"reframework\data\" + f)); } catch { return ""; } };
            var role = read("RE4MP_role.json");
            return new
            {
                connected = Regex.IsMatch(role, @"""connected"":true"),
                character = Regex.Match(read("RE4MP_charswap_status.json"), @"""status"":""([^""]{0,80})").Groups[1].Value,
            };
        }

        static object[] Rows(System.Collections.Generic.IEnumerable<Row> rows) =>
            rows.Select(r => (object)new { level = r.Level.ToString().ToLowerInvariant(), title = r.Title, detail = r.Detail }).ToArray();

        static object Json(Snapshot s, string note) => new
        {
            role = s.IsHost ? "host" : s.HostIp != null ? "friend" : "none",
            tunnelIp = s.TunnelIp,
            hostIp = s.HostIp,
            tailscale = s.TsState,
            myName = s.HostIp != null ? MyName() : null,
            mod = s.Mod.ToString().ToLowerInvariant(),
            running = s.Re4Running,
            why = WhyNotPlay(s),
            setup = s.IsHost && (!s.ServerBlocked || !s.GamePortAllowed || !s.OthersBlocked || !s.AppLinkAllowed || s.TsState == "missing"),
            build = s.Build,
            modVersion = s.ModVersion,
            friends = s.IsHost ? Checks.FriendNames().Select(n => new { name = n }).ToArray() : new object[0],
            invite = Invite,
            firewallOn = s.FirewallOn,
            connection = Rows(s.Connection),
            privacy = Rows(s.Privacy),
            game = Rows(s.Game),
            saves = Rows(new[] { s.Saves })[0],
            inGame = InGame(s),
            note,
        };

        static string MyName() => File.ReadAllText(Checks.RoleFile).Trim().Split(new[] { ' ' }, 3).ElementAtOrDefault(2) ?? "";
    }

    public static class Log
    {
        // Documents\RE4 co-op\log.txt. Never write keys or the internet address here.
        public static void Write(string line)
        {
            try
            {
                var dir = Path.Combine(Checks.Documents, "RE4 co-op");
                Directory.CreateDirectory(dir);
                File.AppendAllText(Path.Combine(dir, "log.txt"), $"{DateTime.Now:yyyy-MM-dd HH:mm:ss}  {line}\r\n");
            }
            catch (IOException) { }
        }
    }
}
