// Shot Builder.exe: mo Shot Builder nhu mot ung dung tren desktop.
// Khoi dong may chu Python an (khong cua so den), roi mo giao dien trong cua so rieng (Edge/Chrome che do ung dung).
using System;
using System.Diagnostics;
using System.IO;
using System.Net.Sockets;
using System.Threading;
using System.Windows.Forms;

class ShotBuilderApp
{
    const int PORT = 7870;

    static bool Up()
    {
        try
        {
            using (TcpClient c = new TcpClient())
            {
                IAsyncResult r = c.BeginConnect("127.0.0.1", PORT, null, null);
                bool ok = r.AsyncWaitHandle.WaitOne(300);
                if (ok && c.Connected) { c.EndConnect(r); return true; }
                return false;
            }
        }
        catch { return false; }
    }

    static bool TryStart(string exe, string args, string dir)
    {
        try
        {
            ProcessStartInfo psi = new ProcessStartInfo(exe, args);
            psi.WorkingDirectory = dir;
            psi.UseShellExecute = false;
            psi.CreateNoWindow = true;
            psi.WindowStyle = ProcessWindowStyle.Hidden;
            psi.EnvironmentVariables["BUILDER_NO_BROWSER"] = "1";
            psi.EnvironmentVariables["BUILDER_APP"] = "1";
            psi.EnvironmentVariables["PYTHONIOENCODING"] = "utf-8";
            Process p = Process.Start(psi);
            if (p == null) return false;
            // tien trinh chet ngay (vd. Python cua Microsoft Store chua cai) => thu cach khac
            if (p.WaitForExit(1500) && p.ExitCode != 0) return false;
            return true;
        }
        catch { return false; }
    }

    static void OpenWindow(string url)
    {
        string pf86 = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86);
        string pf = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
        string local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        string[] cands = {
            pf86 + "\\Microsoft\\Edge\\Application\\msedge.exe",
            pf + "\\Microsoft\\Edge\\Application\\msedge.exe",
            pf + "\\Google\\Chrome\\Application\\chrome.exe",
            pf86 + "\\Google\\Chrome\\Application\\chrome.exe",
            local + "\\Google\\Chrome\\Application\\chrome.exe"
        };
        foreach (string c in cands)
        {
            if (File.Exists(c))
            {
                try { Process.Start(c, "--app=" + url + " --window-size=1500,950"); return; } catch { }
            }
        }
        try { Process.Start(url); } catch { MessageBox.Show("Mo trinh duyet va vao: " + url, "Shot Builder"); }
    }

    [STAThread]
    static void Main()
    {
        string root = AppDomain.CurrentDomain.BaseDirectory;
        string studio = Path.Combine(root, "what-if-studio");
        string app = "builder\\app.pyc";
        if (!File.Exists(Path.Combine(studio, app))) app = "builder\\app.py";
        if (!File.Exists(Path.Combine(studio, app)))
        {
            MessageBox.Show("Khong thay " + Path.Combine(studio, app) + "\n\nHay chay lai CAI_DAT.bat.", "Shot Builder", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }
        string url = "http://127.0.0.1:" + PORT;
        if (!Up())
        {
            bool ok = false;
            string pyFile = Path.Combine(root, "python_path.txt");
            if (File.Exists(pyFile))
            {
                try
                {
                    string py = File.ReadAllText(pyFile).Trim().Trim('"');
                    string pyw = Path.Combine(Path.GetDirectoryName(py), "pythonw.exe");
                    if (File.Exists(pyw)) ok = TryStart(pyw, app, studio);
                    if (!ok && File.Exists(py)) ok = TryStart(py, app, studio);
                }
                catch { }
            }
            ok = ok || TryStart("pyw.exe", "-3.12 " + app, studio)
                   || TryStart("pythonw.exe", app, studio)
                   || TryStart("py.exe", "-3.12 " + app, studio)
                   || TryStart("python.exe", app, studio);
            if (!ok)
            {
                MessageBox.Show("Khong tim thay Python tren may.\nHay chay lai CAI_DAT.bat (tu cai Python 3.12) roi mo lai.", "Shot Builder", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return;
            }
            for (int i = 0; i < 80 && !Up(); i++) Thread.Sleep(250);
            if (!Up())
            {
                MessageBox.Show("Shot Builder chua khoi dong duoc.\nXem file nhat ky:\n" + Path.Combine(studio, "out\\shot_builder_log.txt") +
                                "\n\nHoac chay 'Mo Shot Builder.bat' de xem loi.", "Shot Builder", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return;
            }
        }
        OpenWindow(url);
    }
}
