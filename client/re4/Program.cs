using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Web.Script.Serialization;

namespace RE4Helper
{
    // re4-helper.exe, run by Premade's app (client/main.js) for the RE4 co-op page. One command per run, JSON on stdout:
    //   status   every check (no admin)
    //   backup   back up RE4's saves, then status
    //   play     back up saves, start RE4 through Steam unless something's wrong, then status
    //   backups  open the backups folder, then status
    //   setup [premade.exe]  set this PC up to host (Windows asks for admin once), then status
    //   theirs   put the downloaded co-op mod in the game in place of ours, then status
    //   ours     switch back to ours, then status
    //   invite <name>      host: a new friend on the link (Windows asks); the invite code comes back as "invite"
    //   unfriend <ip>      host: take a friend off the link (Windows asks)
    //   address            host: the address code to send friends when the internet address changed, as "invite"
    //   join               friend: an invite or address code on stdin (Windows asks)
    //   remove             undo Set up or Join on this PC (Windows asks)
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
                else if (what == "setup") note = Elevated(args, () => Setup.Host(args.Skip(1).FirstOrDefault(a => a != "--elevated")));
                else if (what == "invite") note = MakeInvite(args.ElementAtOrDefault(1));
                else if (what == "addfriend") note = Elevated(args, () => Setup.AddFriend(args[1], args[2]));   // invite's admin step
                else if (what == "unfriend") note = Elevated(args, () => Setup.RemoveFriend(args.ElementAtOrDefault(1)));
                else if (what == "address") note = AddressCode();
                else if (what == "join") note = Join();
                else if (what == "joinfile") note = Elevated(args, JoinFromFile);   // join's admin step
                else if (what == "remove") note = Elevated(args, Setup.Remove);
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
            if (s.IsHost) Setup.OpenRouterPort();
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

        // ---------- invites ----------
        // An invite is "RE4COOP1." + base64 of "<friend's private key>|<their 10.66.0.x>|<host's public key>|<host ip:port>".
        // It holds the friend's key, so it goes to them privately and once. An address code is just "<ip>:<port>".

        static string Invite;   // shown on the page once, never written to a file or the log

        static string MakeInvite(string name)
        {
            name = (name ?? "").Trim();
            if (name.Length == 0 || name.Length > 40) throw new Exception("Give your friend a name (up to 40 letters).");
            var ip = Checks.PublicIp() ?? throw new Exception("Couldn't look up this PC's internet address, so the invite would have nowhere to go.");
            var keys = X25519.NewKeyPair();
            var added = Elevated(new[] { "addfriend", keys.Public, name }, null);
            var m = System.Text.RegularExpressions.Regex.Match(added, @"^(10\.66\.0\.\d+) (\S{44})$");
            if (!m.Success) return added;
            Invite = "RE4COOP1." + Convert.ToBase64String(System.Text.Encoding.UTF8.GetBytes($"{keys.Private}|{m.Groups[1].Value}|{m.Groups[2].Value}|{ip}:{Checks.TunnelPort}"));
            File.WriteAllText(Checks.AddressFile, Checks.Fingerprint(ip));
            return $"Invite for {name} ready. Copy it and send it to them in a private message: it's their key, and it works once.";
        }

        static string AddressCode()
        {
            var ip = Checks.PublicIp() ?? throw new Exception("Couldn't look up this PC's internet address.");
            Invite = $"{ip}:{Checks.TunnelPort}";
            Directory.CreateDirectory(Path.GetDirectoryName(Checks.AddressFile));
            File.WriteAllText(Checks.AddressFile, Checks.Fingerprint(ip));
            return "Your new address is copied. Send it to your friends: they paste it on their RE4 co-op page.";
        }

        static readonly string JoinFile = Path.Combine(Path.GetTempPath(), "re4-join.txt");

        // The code comes on stdin, so it never shows in a process list. Only checked fields go on to the admin step,
        // through a file in this user's temp folder that the admin step deletes right away.
        static string Join()
        {
            var fields = ReadCode(Console.In.ReadToEnd());
            File.WriteAllText(JoinFile, string.Join("|", fields));
            try { return Elevated(new[] { "joinfile" }, null); }
            finally { File.Delete(JoinFile); }
        }

        static string JoinFromFile()
        {
            var fields = ReadCode(File.ReadAllText(JoinFile));
            File.Delete(JoinFile);
            return fields.Length == 1 ? Setup.NewEndpoint(fields[0]) : Setup.Join(fields[0], fields[1], fields[2], fields[3]);
        }

        // Outside input: every field is checked, and the tunnel file is written from these fields only.
        public static string[] ReadCode(string code)
        {
            code = (code ?? "").Trim();
            bool Endpoint(string e) => System.Text.RegularExpressions.Regex.IsMatch(e, @"^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3}):(\d{1,5})$")
                && System.Net.IPAddress.TryParse(e.Split(':')[0], out _) && int.Parse(e.Split(':')[1]) is var port && port > 0 && port < 65536;
            if (Endpoint(code)) return new[] { code };
            string[] f = null;
            if (code.StartsWith("RE4COOP1."))
                try { f = System.Text.Encoding.UTF8.GetString(Convert.FromBase64String(code.Substring(9))).Split('|'); } catch (FormatException) { }
            var key = new System.Text.RegularExpressions.Regex(@"^[A-Za-z0-9+/]{43}=$");
            if (f == null || f.Length != 4 || !key.IsMatch(f[0]) || !key.IsMatch(f[2]) || !Endpoint(f[3])
                || !System.Text.RegularExpressions.Regex.IsMatch(f[1], @"^10\.66\.0\.([2-9]|[1-9]\d|1\d\d|2[0-4]\d|25[0-4])$"))
                throw new Exception("That isn't an RE4 co-op invite or address. Copy the whole code your host sent.");
            return f;
        }

        static object[] Rows(System.Collections.Generic.IEnumerable<Row> rows) =>
            rows.Select(r => (object)new { level = r.Level.ToString().ToLowerInvariant(), title = r.Title, detail = r.Detail }).ToArray();

        static object Json(Snapshot s, string note) => new
        {
            role = s.TunnelIp == null ? "none" : s.IsHost ? "host" : "friend",
            tunnelIp = s.TunnelIp,
            mod = s.Mod.ToString().ToLowerInvariant(),
            running = s.Re4Running,
            why = WhyNotPlay(s),
            setup = s.IsHost && (!s.ServerBlocked || !s.GamePortAllowed || !s.OthersBlocked || !s.AppLinkAllowed),
            build = s.Build,
            modVersion = s.ModVersion,
            friends = s.IsHost ? Checks.FriendNames().Select(f => new { ip = f.Key, name = f.Value }).ToArray() : new object[0],
            invite = Invite,
            firewallOn = s.FirewallOn,
            connection = Rows(s.Connection),
            privacy = Rows(s.Privacy),
            game = Rows(s.Game),
            saves = Rows(new[] { s.Saves })[0],
            note,
        };
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
