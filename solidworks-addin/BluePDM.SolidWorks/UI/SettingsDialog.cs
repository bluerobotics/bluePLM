using System;
using System.Drawing;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace BluePDM.SolidWorks
{
    /// <summary>
    /// Settings dialog for configuring BluePDM connection
    /// </summary>
    public class SettingsDialog : Form
    {
        private readonly SupabaseService _supabaseService;

        private TextBox _urlBox = null!;
        private TextBox _keyBox = null!;
        private TextBox _emailBox = null!;
        private TextBox _passwordBox = null!;
        private TextBox _vaultPathBox = null!;
        private Label _statusLabel = null!;
        private Button _testBtn = null!;
        private Button _signInBtn = null!;
        private Button _okBtn = null!;
        private Button _cancelBtn = null!;
        private Button _browseBtn = null!;

        public string SupabaseUrl => _urlBox.Text.Trim();
        public string SupabaseKey => _keyBox.Text.Trim();

        // Colors
        private static readonly Color BgColor = Color.FromArgb(30, 30, 30);
        private static readonly Color BgSecondary = Color.FromArgb(45, 45, 48);
        private static readonly Color TextColor = Color.FromArgb(212, 212, 212);
        private static readonly Color TextMuted = Color.FromArgb(128, 128, 128);
        private static readonly Color AccentBlue = Color.FromArgb(0, 122, 204);
        private static readonly Color BorderColor = Color.FromArgb(60, 60, 60);
        private static readonly Color SuccessGreen = Color.FromArgb(34, 197, 94);
        private static readonly Color ErrorRed = Color.FromArgb(239, 68, 68);

        public SettingsDialog(SupabaseService supabaseService)
        {
            _supabaseService = supabaseService;
            InitializeUI();
            LoadCurrentSettings();
        }

        private void InitializeUI()
        {
            this.Text = "BluePDM Settings";
            this.Size = new Size(500, 450);
            this.FormBorderStyle = FormBorderStyle.FixedDialog;
            this.MaximizeBox = false;
            this.MinimizeBox = false;
            this.StartPosition = FormStartPosition.CenterParent;
            this.BackColor = BgColor;
            this.ForeColor = TextColor;

            int y = 20;

            // Title
            var titleLabel = new Label
            {
                Text = "Supabase Connection",
                Font = new Font("Segoe UI Semibold", 11),
                ForeColor = TextColor,
                AutoSize = true,
                Location = new Point(20, y)
            };
            this.Controls.Add(titleLabel);
            y += 35;

            // URL
            var urlLabel = CreateLabel("Project URL:", 20, y);
            this.Controls.Add(urlLabel);
            y += 22;

            _urlBox = CreateTextBox(20, y, 440);
            SetPlaceholder(_urlBox, "https://your-project.supabase.co");
            this.Controls.Add(_urlBox);
            y += 35;

            // Key
            var keyLabel = CreateLabel("Anon Key:", 20, y);
            this.Controls.Add(keyLabel);
            y += 22;

            _keyBox = CreateTextBox(20, y, 440);
            _keyBox.UseSystemPasswordChar = true;
            this.Controls.Add(_keyBox);
            y += 40;

            // Sign In Section
            var signInTitle = new Label
            {
                Text = "Sign In",
                Font = new Font("Segoe UI Semibold", 11),
                ForeColor = TextColor,
                AutoSize = true,
                Location = new Point(20, y)
            };
            this.Controls.Add(signInTitle);
            y += 30;

            // Email
            var emailLabel = CreateLabel("Email:", 20, y);
            this.Controls.Add(emailLabel);
            y += 22;

            _emailBox = CreateTextBox(20, y, 300);
            SetPlaceholder(_emailBox, "your@email.com");
            this.Controls.Add(_emailBox);
            y += 35;

            // Password
            var passLabel = CreateLabel("Password:", 20, y);
            this.Controls.Add(passLabel);
            y += 22;

            _passwordBox = CreateTextBox(20, y, 200);
            _passwordBox.UseSystemPasswordChar = true;
            this.Controls.Add(_passwordBox);

            _signInBtn = CreateButton("Sign In", 230, y - 2, 90);
            _signInBtn.Click += async (s, e) => await SignIn();
            this.Controls.Add(_signInBtn);
            y += 40;

            // Vault Path
            var vaultTitle = new Label
            {
                Text = "Vault Path",
                Font = new Font("Segoe UI Semibold", 11),
                ForeColor = TextColor,
                AutoSize = true,
                Location = new Point(20, y)
            };
            this.Controls.Add(vaultTitle);
            y += 30;

            _vaultPathBox = CreateTextBox(20, y, 370);
            SetPlaceholder(_vaultPathBox, @"C:\BluePDM\vault-name");
            this.Controls.Add(_vaultPathBox);

            _browseBtn = CreateButton("...", 400, y - 2, 60);
            _browseBtn.Click += (s, e) => BrowseVaultPath();
            this.Controls.Add(_browseBtn);
            y += 45;

            // Status
            _statusLabel = new Label
            {
                Text = "",
                Font = new Font("Segoe UI", 9),
                ForeColor = TextMuted,
                AutoSize = true,
                Location = new Point(20, y)
            };
            this.Controls.Add(_statusLabel);

            // Buttons
            _testBtn = CreateButton("Test Connection", 20, 370, 120);
            _testBtn.Click += async (s, e) => await TestConnection();
            this.Controls.Add(_testBtn);

            _okBtn = new Button
            {
                Text = "Save",
                Size = new Size(100, 32),
                Location = new Point(270, 370),
                BackColor = AccentBlue,
                ForeColor = Color.White,
                FlatStyle = FlatStyle.Flat,
                Font = new Font("Segoe UI", 9),
                DialogResult = DialogResult.OK
            };
            _okBtn.FlatAppearance.BorderSize = 0;
            this.Controls.Add(_okBtn);

            _cancelBtn = CreateButton("Cancel", 380, 370, 100);
            _cancelBtn.DialogResult = DialogResult.Cancel;
            this.Controls.Add(_cancelBtn);

            this.AcceptButton = _okBtn;
            this.CancelButton = _cancelBtn;
        }

        private void LoadCurrentSettings()
        {
            // Settings are loaded by SupabaseService from the settings file
            // We could expose them if needed
        }

        /// <summary>
        /// Simulates placeholder text for .NET Framework 4.8 (which doesn't have PlaceholderText)
        /// </summary>
        private void SetPlaceholder(TextBox textBox, string placeholder)
        {
            textBox.Text = placeholder;
            textBox.ForeColor = TextMuted;
            
            textBox.GotFocus += (s, e) =>
            {
                if (textBox.Text == placeholder)
                {
                    textBox.Text = "";
                    textBox.ForeColor = TextColor;
                }
            };
            
            textBox.LostFocus += (s, e) =>
            {
                if (string.IsNullOrWhiteSpace(textBox.Text))
                {
                    textBox.Text = placeholder;
                    textBox.ForeColor = TextMuted;
                }
            };
        }

        private Label CreateLabel(string text, int x, int y)
        {
            return new Label
            {
                Text = text,
                Font = new Font("Segoe UI", 9),
                ForeColor = TextColor,
                AutoSize = true,
                Location = new Point(x, y)
            };
        }

        private TextBox CreateTextBox(int x, int y, int width)
        {
            return new TextBox
            {
                Size = new Size(width, 26),
                Location = new Point(x, y),
                BackColor = BgSecondary,
                ForeColor = TextColor,
                BorderStyle = BorderStyle.FixedSingle,
                Font = new Font("Segoe UI", 9)
            };
        }

        private Button CreateButton(string text, int x, int y, int width)
        {
            var btn = new Button
            {
                Text = text,
                Size = new Size(width, 32),
                Location = new Point(x, y),
                BackColor = BgSecondary,
                ForeColor = TextColor,
                FlatStyle = FlatStyle.Flat,
                Font = new Font("Segoe UI", 9)
            };
            btn.FlatAppearance.BorderColor = BorderColor;
            return btn;
        }

        private void BrowseVaultPath()
        {
            using var dialog = new FolderBrowserDialog
            {
                Description = "Select vault folder",
                ShowNewFolderButton = true
            };

            if (!string.IsNullOrEmpty(_vaultPathBox.Text))
            {
                dialog.SelectedPath = _vaultPathBox.Text;
            }

            if (dialog.ShowDialog() == DialogResult.OK)
            {
                _vaultPathBox.Text = dialog.SelectedPath;
            }
        }

        private async Task TestConnection()
        {
            if (string.IsNullOrWhiteSpace(_urlBox.Text) || string.IsNullOrWhiteSpace(_keyBox.Text))
            {
                _statusLabel.Text = "Please enter URL and key";
                _statusLabel.ForeColor = ErrorRed;
                return;
            }

            _statusLabel.Text = "Testing connection...";
            _statusLabel.ForeColor = TextMuted;
            _testBtn.Enabled = false;

            try
            {
                _supabaseService.Connect(_urlBox.Text.Trim(), _keyBox.Text.Trim());

                // Try to fetch something to verify connection
                var client = new System.Net.Http.HttpClient();
                client.DefaultRequestHeaders.Add("apikey", _keyBox.Text.Trim());
                
                var response = await client.GetAsync($"{_urlBox.Text.Trim()}/rest/v1/");
                
                if (response.IsSuccessStatusCode || response.StatusCode == System.Net.HttpStatusCode.NotFound)
                {
                    _statusLabel.Text = "✓ Connection successful";
                    _statusLabel.ForeColor = SuccessGreen;
                }
                else
                {
                    _statusLabel.Text = $"Connection failed: {response.StatusCode}";
                    _statusLabel.ForeColor = ErrorRed;
                }
            }
            catch (Exception ex)
            {
                _statusLabel.Text = $"Error: {ex.Message}";
                _statusLabel.ForeColor = ErrorRed;
            }
            finally
            {
                _testBtn.Enabled = true;
            }
        }

        private async Task SignIn()
        {
            if (string.IsNullOrWhiteSpace(_emailBox.Text) || string.IsNullOrWhiteSpace(_passwordBox.Text))
            {
                _statusLabel.Text = "Please enter email and password";
                _statusLabel.ForeColor = ErrorRed;
                return;
            }

            _statusLabel.Text = "Signing in...";
            _statusLabel.ForeColor = TextMuted;
            _signInBtn.Enabled = false;

            try
            {
                // Make sure connection is set first
                if (!string.IsNullOrWhiteSpace(_urlBox.Text) && !string.IsNullOrWhiteSpace(_keyBox.Text))
                {
                    _supabaseService.Connect(_urlBox.Text.Trim(), _keyBox.Text.Trim());
                }

                var result = await _supabaseService.SignIn(_emailBox.Text.Trim(), _passwordBox.Text);

                if (result.Success)
                {
                    _statusLabel.Text = "✓ Signed in successfully";
                    _statusLabel.ForeColor = SuccessGreen;
                    _passwordBox.Clear();

                    // Set vault path if provided
                    if (!string.IsNullOrWhiteSpace(_vaultPathBox.Text))
                    {
                        // TODO: Get vault ID from database
                        _supabaseService.SetVault("", _vaultPathBox.Text.Trim());
                    }
                }
                else
                {
                    _statusLabel.Text = $"Sign in failed: {result.Error}";
                    _statusLabel.ForeColor = ErrorRed;
                }
            }
            catch (Exception ex)
            {
                _statusLabel.Text = $"Error: {ex.Message}";
                _statusLabel.ForeColor = ErrorRed;
            }
            finally
            {
                _signInBtn.Enabled = true;
            }
        }

        protected override void OnFormClosing(FormClosingEventArgs e)
        {
            if (DialogResult == DialogResult.OK)
            {
                // Save settings before closing
                _supabaseService.Connect(_urlBox.Text.Trim(), _keyBox.Text.Trim());
                
                if (!string.IsNullOrWhiteSpace(_vaultPathBox.Text))
                {
                    _supabaseService.SetVault("", _vaultPathBox.Text.Trim());
                }
                
                _supabaseService.SaveSettings();
            }

            base.OnFormClosing(e);
        }
    }
}

