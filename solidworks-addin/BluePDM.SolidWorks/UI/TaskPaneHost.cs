using System;
using System.Drawing;
using System.IO;
using System.Threading.Tasks;
using System.Windows.Forms;
using SolidWorks.Interop.sldworks;
using SolidWorks.Interop.swconst;

namespace BluePLM.SolidWorks
{
    /// <summary>
    /// Windows Forms host for the BluePLM task pane
    /// </summary>
    public class TaskPaneHost : UserControl
    {
        private readonly ISldWorks _swApp;
        private readonly SupabaseService _supabaseService;
        private readonly FileStatusCache _fileStatusCache;

        // UI Controls
        private Panel _headerPanel = null!;
        private Label _headerLabel = null!;
        private Label _statusIcon = null!;
        private Panel _contentPanel = null!;
        private Label _fileNameLabel = null!;
        private Label _statusLabel = null!;
        private Label _versionLabel = null!;
        private Label _revisionLabel = null!;
        private Label _stateLabel = null!;
        private Label _checkedOutLabel = null!;
        private Panel _actionsPanel = null!;
        private Button _checkOutBtn = null!;
        private Button _checkInBtn = null!;
        private Button _undoCheckOutBtn = null!;
        private Button _getLatestBtn = null!;
        private Panel _connectionPanel = null!;
        private Label _connectionStatus = null!;
        private Button _settingsBtn = null!;

        // Colors (matching BluePLM theme)
        private static readonly Color BgColor = Color.FromArgb(30, 30, 30);
        private static readonly Color BgSecondary = Color.FromArgb(37, 37, 38);
        private static readonly Color TextColor = Color.FromArgb(212, 212, 212);
        private static readonly Color TextMuted = Color.FromArgb(128, 128, 128);
        private static readonly Color AccentBlue = Color.FromArgb(0, 122, 204);
        private static readonly Color StateWip = Color.FromArgb(234, 179, 8);
        private static readonly Color StateReleased = Color.FromArgb(34, 197, 94);
        private static readonly Color BorderColor = Color.FromArgb(60, 60, 60);

        public TaskPaneHost(ISldWorks swApp, SupabaseService supabaseService, FileStatusCache fileStatusCache)
        {
            _swApp = swApp;
            _supabaseService = supabaseService;
            _fileStatusCache = fileStatusCache;

            InitializeUI();
            RefreshStatus();
        }

        private void InitializeUI()
        {
            this.BackColor = BgColor;
            this.Dock = DockStyle.Fill;
            this.Padding = new Padding(0);

            // Header
            _headerPanel = new Panel
            {
                Dock = DockStyle.Top,
                Height = 40,
                BackColor = BgSecondary,
                Padding = new Padding(12, 8, 12, 8)
            };

            _statusIcon = new Label
            {
                Text = "●",
                ForeColor = TextMuted,
                Font = new Font("Segoe UI", 10),
                AutoSize = true,
                Location = new Point(12, 10)
            };

            _headerLabel = new Label
            {
                Text = "BluePLM",
                ForeColor = TextColor,
                Font = new Font("Segoe UI Semibold", 11),
                AutoSize = true,
                Location = new Point(28, 9)
            };

            _headerPanel.Controls.Add(_statusIcon);
            _headerPanel.Controls.Add(_headerLabel);

            // Content Panel
            _contentPanel = new Panel
            {
                Dock = DockStyle.Fill,
                Padding = new Padding(12),
                AutoScroll = true
            };

            // File Info Section
            var fileSection = CreateSection("Active Document", 160);
            
            _fileNameLabel = CreateInfoLabel("No document open", true);
            _fileNameLabel.Font = new Font("Segoe UI Semibold", 9);
            _fileNameLabel.MaximumSize = new Size(200, 0);
            _fileNameLabel.AutoEllipsis = true;

            _statusLabel = CreateInfoLabel("Status: —");
            _versionLabel = CreateInfoLabel("Version: —");
            _revisionLabel = CreateInfoLabel("Revision: —");
            _stateLabel = CreateInfoLabel("State: —");
            _checkedOutLabel = CreateInfoLabel("Checked Out: —");

            var infoPanel = new FlowLayoutPanel
            {
                Dock = DockStyle.Fill,
                FlowDirection = FlowDirection.TopDown,
                WrapContents = false,
                AutoSize = true,
                Padding = new Padding(0, 4, 0, 0)
            };

            infoPanel.Controls.Add(_fileNameLabel);
            infoPanel.Controls.Add(_statusLabel);
            infoPanel.Controls.Add(_versionLabel);
            infoPanel.Controls.Add(_revisionLabel);
            infoPanel.Controls.Add(_stateLabel);
            infoPanel.Controls.Add(_checkedOutLabel);

            fileSection.Controls.Add(infoPanel);

            // Actions Section
            _actionsPanel = CreateSection("Actions", 130);
            
            var buttonPanel = new FlowLayoutPanel
            {
                Dock = DockStyle.Fill,
                FlowDirection = FlowDirection.TopDown,
                WrapContents = false,
                Padding = new Padding(0, 4, 0, 0)
            };

            _checkOutBtn = CreateActionButton("Check Out", "🔓");
            _checkOutBtn.Click += (s, e) => ExecuteCommand("CheckOut");

            _checkInBtn = CreateActionButton("Check In", "💾");
            _checkInBtn.Click += (s, e) => ExecuteCommand("CheckIn");

            _undoCheckOutBtn = CreateActionButton("Undo Check Out", "↩");
            _undoCheckOutBtn.Click += (s, e) => ExecuteCommand("UndoCheckOut");

            _getLatestBtn = CreateActionButton("Get Latest", "⬇");
            _getLatestBtn.Click += (s, e) => ExecuteCommand("GetLatest");

            buttonPanel.Controls.Add(_checkOutBtn);
            buttonPanel.Controls.Add(_checkInBtn);
            buttonPanel.Controls.Add(_undoCheckOutBtn);
            buttonPanel.Controls.Add(_getLatestBtn);

            _actionsPanel.Controls.Add(buttonPanel);

            // Connection Section
            _connectionPanel = CreateSection("Connection", 80);

            _connectionStatus = CreateInfoLabel("Not connected");
            _connectionStatus.ForeColor = TextMuted;

            _settingsBtn = CreateActionButton("Settings", "⚙");
            _settingsBtn.Click += (s, e) => ShowSettings();

            var connPanel = new FlowLayoutPanel
            {
                Dock = DockStyle.Fill,
                FlowDirection = FlowDirection.TopDown,
                WrapContents = false,
                Padding = new Padding(0, 4, 0, 0)
            };

            connPanel.Controls.Add(_connectionStatus);
            connPanel.Controls.Add(_settingsBtn);

            _connectionPanel.Controls.Add(connPanel);

            // Add sections to content
            _contentPanel.Controls.Add(_connectionPanel);
            _connectionPanel.Dock = DockStyle.Bottom;

            _contentPanel.Controls.Add(_actionsPanel);
            _actionsPanel.Dock = DockStyle.Bottom;

            _contentPanel.Controls.Add(fileSection);
            fileSection.Dock = DockStyle.Fill;

            // Add to main control
            this.Controls.Add(_contentPanel);
            this.Controls.Add(_headerPanel);
        }

        private Panel CreateSection(string title, int height)
        {
            var panel = new Panel
            {
                Height = height,
                Padding = new Padding(0, 0, 0, 8),
                Margin = new Padding(0, 0, 0, 8)
            };

            var titleLabel = new Label
            {
                Text = title.ToUpperInvariant(),
                ForeColor = TextMuted,
                Font = new Font("Segoe UI", 8),
                Dock = DockStyle.Top,
                Height = 20,
                Padding = new Padding(0, 4, 0, 0)
            };

            var separator = new Panel
            {
                Height = 1,
                BackColor = BorderColor,
                Dock = DockStyle.Top
            };

            panel.Controls.Add(titleLabel);
            panel.Controls.Add(separator);

            return panel;
        }

        private Label CreateInfoLabel(string text, bool header = false)
        {
            return new Label
            {
                Text = text,
                ForeColor = header ? TextColor : TextMuted,
                Font = new Font("Segoe UI", 9),
                AutoSize = true,
                Margin = new Padding(0, 2, 0, 2)
            };
        }

        private Button CreateActionButton(string text, string icon)
        {
            var btn = new Button
            {
                Text = $"{icon}  {text}",
                FlatStyle = FlatStyle.Flat,
                BackColor = BgSecondary,
                ForeColor = TextColor,
                Font = new Font("Segoe UI", 9),
                Height = 28,
                Width = 180,
                TextAlign = ContentAlignment.MiddleLeft,
                Padding = new Padding(8, 0, 0, 0),
                Margin = new Padding(0, 2, 0, 2),
                Cursor = Cursors.Hand
            };

            btn.FlatAppearance.BorderColor = BorderColor;
            btn.FlatAppearance.BorderSize = 1;
            btn.FlatAppearance.MouseOverBackColor = Color.FromArgb(50, 50, 50);
            btn.FlatAppearance.MouseDownBackColor = Color.FromArgb(60, 60, 60);

            return btn;
        }

        public void RefreshStatus()
        {
            if (this.InvokeRequired)
            {
                this.BeginInvoke(new Action(RefreshStatus));
                return;
            }

            try
            {
                var doc = _swApp.ActiveDoc as ModelDoc2;
                var isConnected = _supabaseService.IsConnected;

                // Update connection status
                _connectionStatus.Text = isConnected ? "✓ Connected" : "Not connected";
                _connectionStatus.ForeColor = isConnected ? StateReleased : TextMuted;
                _statusIcon.ForeColor = isConnected ? StateReleased : TextMuted;

                if (doc == null)
                {
                    // No active document
                    _fileNameLabel.Text = "No document open";
                    _statusLabel.Text = "Status: —";
                    _versionLabel.Text = "Version: —";
                    _revisionLabel.Text = "Revision: —";
                    _stateLabel.Text = "State: —";
                    _checkedOutLabel.Text = "Checked Out: —";

                    _checkOutBtn.Enabled = false;
                    _checkInBtn.Enabled = false;
                    _undoCheckOutBtn.Enabled = false;
                    _getLatestBtn.Enabled = false;
                    return;
                }

                var filePath = doc.GetPathName();
                if (string.IsNullOrEmpty(filePath))
                {
                    _fileNameLabel.Text = "Unsaved document";
                    _statusLabel.Text = "Status: Save document first";
                    DisableAllButtons();
                    return;
                }

                _fileNameLabel.Text = Path.GetFileName(filePath);

                if (!isConnected)
                {
                    _statusLabel.Text = "Status: Not connected";
                    DisableAllButtons();
                    return;
                }

                // Get file status
                var status = _fileStatusCache.GetStatus(filePath);

                if (status == null)
                {
                    _statusLabel.Text = "Status: Loading...";
                    _fileStatusCache.PreloadStatus(filePath);
                    DisableAllButtons();
                    return;
                }

                if (!status.IsTracked)
                {
                    _statusLabel.Text = "Status: Not tracked";
                    _versionLabel.Text = "Version: —";
                    _revisionLabel.Text = "Revision: —";
                    _stateLabel.Text = "State: Not tracked";
                    _checkedOutLabel.Text = "Checked Out: No";

                    _checkOutBtn.Enabled = true;
                    _checkOutBtn.Text = "🔓  Add & Check Out";
                    _checkInBtn.Enabled = false;
                    _undoCheckOutBtn.Enabled = false;
                    _getLatestBtn.Enabled = false;
                    return;
                }

                // File is tracked
                _versionLabel.Text = $"Version: {status.Version}";
                _revisionLabel.Text = $"Revision: {status.Revision}";
                
                // State with color
                _stateLabel.Text = $"State: {FormatState(status.State)}";
                _stateLabel.ForeColor = GetStateColor(status.State);

                if (status.IsCheckedOutByMe)
                {
                    _statusLabel.Text = "Status: Checked out by you";
                    _statusLabel.ForeColor = AccentBlue;
                    _checkedOutLabel.Text = $"Checked Out: You";
                    _checkedOutLabel.ForeColor = AccentBlue;

                    _checkOutBtn.Enabled = false;
                    _checkInBtn.Enabled = true;
                    _undoCheckOutBtn.Enabled = true;
                    _getLatestBtn.Enabled = false;
                }
                else if (!string.IsNullOrEmpty(status.CheckedOutBy))
                {
                    _statusLabel.Text = "Status: Checked out";
                    _statusLabel.ForeColor = StateWip;
                    _checkedOutLabel.Text = $"Checked Out: {status.CheckedOutBy}";
                    _checkedOutLabel.ForeColor = StateWip;

                    _checkOutBtn.Enabled = false;
                    _checkInBtn.Enabled = false;
                    _undoCheckOutBtn.Enabled = false;
                    _getLatestBtn.Enabled = true;
                }
                else
                {
                    _statusLabel.Text = "Status: Available";
                    _statusLabel.ForeColor = StateReleased;
                    _checkedOutLabel.Text = "Checked Out: No";
                    _checkedOutLabel.ForeColor = TextMuted;

                    _checkOutBtn.Enabled = true;
                    _checkOutBtn.Text = "🔓  Check Out";
                    _checkInBtn.Enabled = false;
                    _undoCheckOutBtn.Enabled = false;
                    _getLatestBtn.Enabled = true;
                }
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"RefreshStatus error: {ex.Message}");
            }
        }

        private void DisableAllButtons()
        {
            _checkOutBtn.Enabled = false;
            _checkInBtn.Enabled = false;
            _undoCheckOutBtn.Enabled = false;
            _getLatestBtn.Enabled = false;
        }

        private void ExecuteCommand(string command)
        {
            // Find the addin and call its methods via reflection or direct reference
            // For simplicity, we'll use the SolidWorks command mechanism
            try
            {
                var doc = _swApp.ActiveDoc as ModelDoc2;
                if (doc == null) return;

                var filePath = doc.GetPathName();
                if (string.IsNullOrEmpty(filePath)) return;

                switch (command)
                {
                    case "CheckOut":
                        Task.Run(async () =>
                        {
                            var result = await _supabaseService.CheckOutFile(filePath);
                            if (result.Success)
                            {
                                _fileStatusCache.Invalidate(filePath);
                                this.BeginInvoke(new Action(RefreshStatus));
                            }
                            else
                            {
                                MessageBox.Show(result.Error, "Check Out Failed", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                            }
                        });
                        break;

                    case "CheckIn":
                        using (var dialog = new CheckInDialog(filePath, _fileStatusCache.GetStatus(filePath)))
                        {
                            if (dialog.ShowDialog() == DialogResult.OK)
                            {
                                // Save first
                                int errors = 0, warnings = 0;
                                doc.Save3((int)swSaveAsOptions_e.swSaveAsOptions_Silent, ref errors, ref warnings);

                                var comment = dialog.Comment;
                                var incrementRevision = dialog.IncrementRevision;
                                var newState = dialog.NewState;
                                
                                Task.Run(async () =>
                                {
                                    var result = await _supabaseService.CheckInFile(filePath, comment, incrementRevision, newState);
                                    if (result.Success)
                                    {
                                        _fileStatusCache.Invalidate(filePath);
                                        this.BeginInvoke(new Action(RefreshStatus));
                                    }
                                    else
                                    {
                                        MessageBox.Show(result.Error, "Check In Failed", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                                    }
                                });
                            }
                        }
                        break;

                    case "UndoCheckOut":
                        if (MessageBox.Show("Discard changes and undo check out?", "Undo Check Out", 
                            MessageBoxButtons.YesNo, MessageBoxIcon.Warning) == DialogResult.Yes)
                        {
                            Task.Run(async () =>
                            {
                                var result = await _supabaseService.UndoCheckOut(filePath);
                                if (result.Success)
                                {
                                    _fileStatusCache.Invalidate(filePath);
                                    this.BeginInvoke(new Action(RefreshStatus));
                                }
                                else
                                {
                                    MessageBox.Show(result.Error, "Undo Check Out Failed", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                                }
                            });
                        }
                        break;

                    case "GetLatest":
                        Task.Run(async () =>
                        {
                            var result = await _supabaseService.GetLatestVersion(filePath);
                            if (result.Success)
                            {
                                _fileStatusCache.Invalidate(filePath);
                                this.BeginInvoke(new Action(() =>
                                {
                                    // Reload document
                                    _swApp.CloseDoc(filePath);
                                    int errors = 0, warnings = 0;
                                    _swApp.OpenDoc6(filePath,
                                        (int)swDocumentTypes_e.swDocPART,
                                        (int)swOpenDocOptions_e.swOpenDocOptions_Silent,
                                        "", ref errors, ref warnings);
                                    RefreshStatus();
                                }));
                            }
                            else
                            {
                                MessageBox.Show(result.Error, "Get Latest Failed", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                            }
                        });
                        break;
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Error executing command: {ex.Message}", "BluePLM Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private void ShowSettings()
        {
            using var dialog = new SettingsDialog(_supabaseService);
            if (dialog.ShowDialog() == DialogResult.OK)
            {
                _supabaseService.Connect(dialog.SupabaseUrl, dialog.SupabaseKey);
                _fileStatusCache.Clear();
                RefreshStatus();
            }
        }

        private static string FormatState(string state)
        {
            return state switch
            {
                "wip" => "Work in Progress",
                "in_review" => "In Review",
                "released" => "Released",
                "obsolete" => "Obsolete",
                "not_tracked" => "Not Tracked",
                _ => state
            };
        }

        private static Color GetStateColor(string state)
        {
            return state switch
            {
                "wip" => StateWip,
                "in_review" => Color.FromArgb(59, 130, 246), // Blue
                "released" => StateReleased,
                "obsolete" => TextMuted,
                _ => TextMuted
            };
        }
    }
}

