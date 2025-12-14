using System;
using System.Drawing;
using System.IO;
using System.Windows.Forms;

namespace BluePLM.SolidWorks
{
    /// <summary>
    /// Dialog for checking in a file with options
    /// </summary>
    public class CheckInDialog : Form
    {
        private readonly string _filePath;
        private readonly FileStatus? _status;

        private TextBox _commentBox = null!;
        private CheckBox _incrementRevisionCheck = null!;
        private ComboBox _stateCombo = null!;
        private Button _okBtn = null!;
        private Button _cancelBtn = null!;

        public string? Comment => _commentBox.Text;
        public bool IncrementRevision => _incrementRevisionCheck.Checked;
        public string? NewState => _stateCombo.SelectedIndex > 0 
            ? _stateCombo.SelectedItem?.ToString()?.ToLowerInvariant().Replace(" ", "_") 
            : null;

        // Colors
        private static readonly Color BgColor = Color.FromArgb(30, 30, 30);
        private static readonly Color BgSecondary = Color.FromArgb(45, 45, 48);
        private static readonly Color TextColor = Color.FromArgb(212, 212, 212);
        private static readonly Color AccentBlue = Color.FromArgb(0, 122, 204);
        private static readonly Color BorderColor = Color.FromArgb(60, 60, 60);

        public CheckInDialog(string filePath, FileStatus? status)
        {
            _filePath = filePath;
            _status = status;
            InitializeUI();
        }

        private void InitializeUI()
        {
            this.Text = "Check In - BluePLM";
            this.Size = new Size(450, 350);
            this.FormBorderStyle = FormBorderStyle.FixedDialog;
            this.MaximizeBox = false;
            this.MinimizeBox = false;
            this.StartPosition = FormStartPosition.CenterParent;
            this.BackColor = BgColor;
            this.ForeColor = TextColor;

            var mainPanel = new Panel
            {
                Dock = DockStyle.Fill,
                Padding = new Padding(20)
            };

            // File name
            var fileLabel = new Label
            {
                Text = Path.GetFileName(_filePath),
                Font = new Font("Segoe UI Semibold", 12),
                ForeColor = TextColor,
                AutoSize = true,
                Location = new Point(20, 20)
            };

            // Version info
            var versionInfo = _status != null
                ? $"Version {_status.Version} → {_status.Version + 1}  |  Revision {_status.Revision}"
                : "New file";

            var versionLabel = new Label
            {
                Text = versionInfo,
                Font = new Font("Segoe UI", 9),
                ForeColor = Color.FromArgb(128, 128, 128),
                AutoSize = true,
                Location = new Point(20, 48)
            };

            // Comment section
            var commentLabel = new Label
            {
                Text = "Comment:",
                Font = new Font("Segoe UI", 9),
                ForeColor = TextColor,
                AutoSize = true,
                Location = new Point(20, 85)
            };

            _commentBox = new TextBox
            {
                Multiline = true,
                Size = new Size(390, 80),
                Location = new Point(20, 105),
                BackColor = BgSecondary,
                ForeColor = TextColor,
                BorderStyle = BorderStyle.FixedSingle,
                Font = new Font("Segoe UI", 9)
            };

            // Options
            _incrementRevisionCheck = new CheckBox
            {
                Text = "Increment revision (next: " + (_status != null ? GetNextRevision(_status.Revision) : "A") + ")",
                Font = new Font("Segoe UI", 9),
                ForeColor = TextColor,
                AutoSize = true,
                Location = new Point(20, 200),
                Checked = false
            };

            var stateLabel = new Label
            {
                Text = "Change state to:",
                Font = new Font("Segoe UI", 9),
                ForeColor = TextColor,
                AutoSize = true,
                Location = new Point(20, 230)
            };

            _stateCombo = new ComboBox
            {
                DropDownStyle = ComboBoxStyle.DropDownList,
                Size = new Size(200, 24),
                Location = new Point(130, 227),
                BackColor = BgSecondary,
                ForeColor = TextColor,
                FlatStyle = FlatStyle.Flat,
                Font = new Font("Segoe UI", 9)
            };

            _stateCombo.Items.Add("(No change)");
            _stateCombo.Items.Add("Work in Progress");
            _stateCombo.Items.Add("In Review");
            _stateCombo.Items.Add("Released");
            _stateCombo.Items.Add("Obsolete");
            _stateCombo.SelectedIndex = 0;

            // Buttons
            _okBtn = new Button
            {
                Text = "Check In",
                Size = new Size(100, 32),
                Location = new Point(200, 270),
                BackColor = AccentBlue,
                ForeColor = Color.White,
                FlatStyle = FlatStyle.Flat,
                Font = new Font("Segoe UI", 9),
                DialogResult = DialogResult.OK
            };
            _okBtn.FlatAppearance.BorderSize = 0;

            _cancelBtn = new Button
            {
                Text = "Cancel",
                Size = new Size(100, 32),
                Location = new Point(310, 270),
                BackColor = BgSecondary,
                ForeColor = TextColor,
                FlatStyle = FlatStyle.Flat,
                Font = new Font("Segoe UI", 9),
                DialogResult = DialogResult.Cancel
            };
            _cancelBtn.FlatAppearance.BorderColor = BorderColor;

            // Add controls
            mainPanel.Controls.Add(fileLabel);
            mainPanel.Controls.Add(versionLabel);
            mainPanel.Controls.Add(commentLabel);
            mainPanel.Controls.Add(_commentBox);
            mainPanel.Controls.Add(_incrementRevisionCheck);
            mainPanel.Controls.Add(stateLabel);
            mainPanel.Controls.Add(_stateCombo);
            mainPanel.Controls.Add(_okBtn);
            mainPanel.Controls.Add(_cancelBtn);

            this.Controls.Add(mainPanel);
            this.AcceptButton = _okBtn;
            this.CancelButton = _cancelBtn;
        }

        private static string GetNextRevision(string current)
        {
            if (string.IsNullOrEmpty(current) || current == "-") return "A";

            var chars = current.ToCharArray();
            for (int i = chars.Length - 1; i >= 0; i--)
            {
                if (chars[i] == 'Z')
                {
                    chars[i] = 'A';
                }
                else
                {
                    chars[i]++;
                    return new string(chars);
                }
            }

            return "A" + new string(chars);
        }
    }
}

