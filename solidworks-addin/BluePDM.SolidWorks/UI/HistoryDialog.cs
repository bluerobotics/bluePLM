using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace BluePDM.SolidWorks
{
    /// <summary>
    /// Dialog showing version history for a file
    /// </summary>
    public class HistoryDialog : Form
    {
        private readonly string _filePath;
        private readonly SupabaseService _supabaseService;
        
        private ListView _historyList = null!;
        private Button _closeBtn = null!;
        private Label _loadingLabel = null!;

        // Colors
        private static readonly Color BgColor = Color.FromArgb(30, 30, 30);
        private static readonly Color BgSecondary = Color.FromArgb(45, 45, 48);
        private static readonly Color TextColor = Color.FromArgb(212, 212, 212);
        private static readonly Color TextMuted = Color.FromArgb(128, 128, 128);
        private static readonly Color BorderColor = Color.FromArgb(60, 60, 60);

        public HistoryDialog(string filePath, SupabaseService supabaseService)
        {
            _filePath = filePath;
            _supabaseService = supabaseService;
            InitializeUI();
            LoadHistory();
        }

        private void InitializeUI()
        {
            this.Text = $"History - {Path.GetFileName(_filePath)} - BluePDM";
            this.Size = new Size(700, 450);
            this.FormBorderStyle = FormBorderStyle.Sizable;
            this.StartPosition = FormStartPosition.CenterParent;
            this.BackColor = BgColor;
            this.ForeColor = TextColor;
            this.MinimumSize = new Size(500, 300);

            // Header
            var headerLabel = new Label
            {
                Text = Path.GetFileName(_filePath),
                Font = new Font("Segoe UI Semibold", 12),
                ForeColor = TextColor,
                AutoSize = true,
                Location = new Point(20, 15)
            };

            // History list
            _historyList = new ListView
            {
                View = View.Details,
                FullRowSelect = true,
                GridLines = false,
                HeaderStyle = ColumnHeaderStyle.Nonclickable,
                Location = new Point(20, 50),
                Size = new Size(640, 310),
                Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right | AnchorStyles.Bottom,
                BackColor = BgSecondary,
                ForeColor = TextColor,
                BorderStyle = BorderStyle.FixedSingle,
                Font = new Font("Segoe UI", 9)
            };

            _historyList.Columns.Add("Ver", 50);
            _historyList.Columns.Add("Rev", 50);
            _historyList.Columns.Add("State", 100);
            _historyList.Columns.Add("Comment", 200);
            _historyList.Columns.Add("Date", 130);
            _historyList.Columns.Add("User", 100);

            // Loading label
            _loadingLabel = new Label
            {
                Text = "Loading history...",
                Font = new Font("Segoe UI", 10),
                ForeColor = TextMuted,
                AutoSize = true,
                Location = new Point(300, 200),
                Visible = true
            };

            // Close button
            _closeBtn = new Button
            {
                Text = "Close",
                Size = new Size(100, 32),
                Location = new Point(560, 375),
                Anchor = AnchorStyles.Bottom | AnchorStyles.Right,
                BackColor = BgSecondary,
                ForeColor = TextColor,
                FlatStyle = FlatStyle.Flat,
                Font = new Font("Segoe UI", 9),
                DialogResult = DialogResult.Cancel
            };
            _closeBtn.FlatAppearance.BorderColor = BorderColor;

            this.Controls.Add(headerLabel);
            this.Controls.Add(_historyList);
            this.Controls.Add(_loadingLabel);
            this.Controls.Add(_closeBtn);

            this.CancelButton = _closeBtn;
        }

        private async void LoadHistory()
        {
            try
            {
                var versions = await _supabaseService.GetFileHistory(_filePath);

                if (this.IsDisposed) return;

                this.BeginInvoke(new Action(() =>
                {
                    _loadingLabel.Visible = false;
                    _historyList.Items.Clear();

                    foreach (var v in versions)
                    {
                        var item = new ListViewItem(v.Version.ToString());
                        item.SubItems.Add(v.Revision);
                        item.SubItems.Add(FormatState(v.State));
                        item.SubItems.Add(v.Comment ?? "");
                        item.SubItems.Add(v.CreatedAt.ToLocalTime().ToString("yyyy-MM-dd HH:mm"));
                        item.SubItems.Add(v.CreatedBy);
                        item.Tag = v;

                        _historyList.Items.Add(item);
                    }

                    if (versions.Count == 0)
                    {
                        _loadingLabel.Text = "No history found";
                        _loadingLabel.Visible = true;
                    }
                }));
            }
            catch (Exception ex)
            {
                if (!this.IsDisposed)
                {
                    this.BeginInvoke(new Action(() =>
                    {
                        _loadingLabel.Text = $"Error: {ex.Message}";
                    }));
                }
            }
        }

        private static string FormatState(string state)
        {
            return state switch
            {
                "wip" => "WIP",
                "in_review" => "In Review",
                "released" => "Released",
                "obsolete" => "Obsolete",
                _ => state
            };
        }
    }
}

