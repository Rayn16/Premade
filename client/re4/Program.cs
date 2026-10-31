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
    //   setup    set this PC up to host (Windows asks for admin once), then status
    //   theirs   put the downloaded co-op mod in the game in place of ours, then status
    //   ours     switch back to ours, then status
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
                else if (what == "setup") note = Elevated(args.Contains("--elevated"));
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

        // Set up needs admin: the helper starts itself again through Windows' prompt and waits for it.
        static string Elevated(bool isElevated)
        {
            var result = Path.Combine(Path.GetTempPath(), "re4-setup-result.txt");
            if (isElevated)
            {
                string note;
                try { note = Setup.Host(); } catch (Exception e) { Log.Write("Set up failed: " + e); note = "Set up stopped: " + e.GetBaseException().Message; }
                File.WriteAllText(result, note);
                return note;
            }
            File.Delete(result);
            try
            {
                var psi = new ProcessStartInfo(System.Reflection.Assembly.GetExecutingAssembly().Location, "setup --elevated") { UseShellExecute = true, Verb = "runas", WindowStyle = ProcessWindowStyle.Hidden };
                using var p = Process.Start(psi);
                p.WaitForExit();
            }
            catch (System.ComponentModel.Win32Exception e) when (e.NativeErrorCode == 1223) { return "Set up needs you to click Yes in Windows' prompt."; }
            return File.Exists(result) ? File.ReadAllText(result) : "Set up finished.";
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
            setup = !(s.TunnelIp != null && !s.IsHost) && (s.TunnelIp == null || !s.ServerBlocked || !s.GamePortAllowed || !s.OthersBlocked),
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
