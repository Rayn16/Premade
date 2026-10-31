using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Web.Script.Serialization;

namespace RE4Helper
{
    // Puts the downloaded co-op mod in the game in place of ours, or switches back. Same rules and record files as the
    // first switch script, so either can undo the other: their files come from Downloads only if all match the
    // checked fingerprints; ours and anything theirs would replace are moved aside (never deleted) and put back.
    // REFramework (dinput8.dll) stays, since both mods need it. No admin needed.
    public static class Switch
    {
        static string State(string game) => Path.Combine(game, "re4r_coop_install");
        static string Record(string game) => Path.Combine(State(game), "their-mod.json");
        static string Parked(string game) => Path.Combine(State(game), "paused");
        static string ParkedDesktop(string game) => Path.Combine(State(game), "paused-desktop");
        static readonly string Desktop = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
        const string Updater = "Update RE4 co-op.cmd";   // would put ours back over theirs

        static string Game()
        {
            var game = Checks.FindGame() ?? throw new Exception("RE4 isn't installed through Steam on this PC.");
            if (System.Diagnostics.Process.GetProcessesByName("re4").Length > 0) throw new Exception("Close RE4 first.");
            return game;
        }

        public static string ToTheirs()
        {
            var game = Game();
            if (File.Exists(Record(game))) return "Their mod is already in.";
            if (!File.Exists(Path.Combine(game, "dinput8.dll"))) throw new Exception("REFramework (dinput8.dll) isn't in the game folder, and the co-op mod needs it.");

            // 1. Find their files in Downloads and check every fingerprint before touching the game.
            var downloads = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Downloads");
            var dll = Directory.GetDirectories(downloads, "MULTIPLAYER RE4R*")
                .SelectMany(d => Directory.GetFiles(d, "Re4-Co-op.dll", SearchOption.AllDirectories)).FirstOrDefault()
                ?? throw new Exception("Couldn't find the co-op mod in Downloads (a folder whose name starts with \"MULTIPLAYER RE4R\").");
            var src = Directory.GetParent(Path.GetDirectoryName(dll)).Parent.FullName;
            foreach (var f in Checks.TheirFiles)
                if (Checks.Sha256(Path.Combine(src, f.Key)) != f.Value)
                    throw new Exception($"{f.Key} isn't the version we checked (or is missing). Nothing was changed.");

            // 2. Back up saves, since the mod copies story progress between the two games.
            Checks.BackUpSaves();

            // 3. Pause ours: our files aside, the desktop updater too. dinput8.dll stays.
            Directory.CreateDirectory(State(game));
            File.WriteAllText(Record(game), new JavaScriptSerializer().Serialize(new { installed = DateTime.Now.ToString("yyyyMMdd-HHmmss"), theirs = Checks.TheirFiles.Keys.ToArray() }));
            var manifest = Path.Combine(State(game), "manifest.json");
            if (File.Exists(manifest))
            {
                var files = (object[])Read(manifest)["files"];
                foreach (var rel in files.Select(f => (string)((Dictionary<string, object>)f)["path"]).Where(r => r != "dinput8.dll"))
                    if (File.Exists(Path.Combine(game, rel))) Move(Path.Combine(game, rel), Path.Combine(Parked(game), rel));
            }
            if (File.Exists(Path.Combine(Desktop, Updater))) Move(Path.Combine(Desktop, Updater), Path.Combine(ParkedDesktop(game), Updater));

            // 4. Copy theirs in; anything already at those paths goes aside first.
            foreach (var rel in Checks.TheirFiles.Keys)
            {
                var dst = Path.Combine(game, rel);
                if (File.Exists(dst)) Move(dst, Path.Combine(Parked(game), rel));
                Directory.CreateDirectory(Path.GetDirectoryName(dst));
                File.Copy(Path.Combine(src, rel), dst, true);
            }
            Log.Write("Switched to their mod");
            return "Their mod is in, and ours is paused (nothing deleted).";
        }

        public static string ToOurs()
        {
            var game = Game();
            if (!File.Exists(Record(game))) return "Their mod isn't in, so there's nothing to switch back.";
            var theirs = (object[])Read(Record(game))["theirs"];
            foreach (string rel in theirs) File.Delete(Path.Combine(game, rel));
            Restore(Parked(game), game);
            Restore(ParkedDesktop(game), Desktop);
            File.Delete(Record(game));
            Log.Write("Switched back to our mod");
            return "Their mod is out and ours is back.";
        }

        static Dictionary<string, object> Read(string json) => (Dictionary<string, object>)new JavaScriptSerializer().DeserializeObject(File.ReadAllText(json));

        static void Move(string from, string to)
        {
            Directory.CreateDirectory(Path.GetDirectoryName(to));
            if (File.Exists(to)) File.Delete(to);
            File.Move(from, to);
        }

        // Put back everything parked; if something newer is already in its place, keep that one.
        static void Restore(string from, string to)
        {
            if (!Directory.Exists(from)) return;
            foreach (var f in Directory.GetFiles(from, "*", SearchOption.AllDirectories))
            {
                var dst = Path.Combine(to, f.Substring(from.Length + 1));
                if (File.Exists(dst)) File.Delete(f); else Move(f, dst);
            }
            Directory.Delete(from, true);
        }
    }
}
