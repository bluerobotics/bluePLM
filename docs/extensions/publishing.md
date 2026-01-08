# Publishing Guide

This guide covers how to publish your extension to the BluePLM Extension Store at [marketplace.blueplm.io](https://marketplace.blueplm.io).

## Prerequisites

Before publishing:

1. ✅ Extension is fully tested
2. ✅ Package builds successfully
3. ✅ README.md with clear documentation
4. ✅ Open source license included
5. ✅ Repository URL in manifest
6. ✅ Icon (128×128 PNG) included

---

## Publishing Flow

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ 1. Register as  │────▶│ 2. Submit       │────▶│ 3. Review       │
│    Publisher    │     │    Extension    │     │    Process      │
└─────────────────┘     └─────────────────┘     └────────┬────────┘
                                                         │
                        ┌─────────────────┐              │
                        │ 4. Published!   │◀─────────────┘
                        │    (Community)  │
                        └─────────────────┘
                                │
                                │ Optional
                                ▼
                        ┌─────────────────┐
                        │ 5. Verification │
                        │    (Verified)   │
                        └─────────────────┘
```

---

## Step 1: Register as Publisher

### Create Publisher Account

1. Go to [marketplace.blueplm.io/submit](https://marketplace.blueplm.io/submit)
2. Click "Register as Publisher"
3. Fill in publisher details:
   - **Name**: Your company or individual name
   - **Slug**: Unique identifier (lowercase, hyphens allowed)
   - **Website**: Your website URL
   - **Logo**: Publisher logo (optional)
4. Verify your email
5. Accept the Publisher Agreement

### Publisher Slug

Your publisher slug must:
- Be unique across all publishers
- Match the prefix of your extension IDs
- Be lowercase with letters, numbers, and hyphens

**Example:**
- Publisher slug: `mycompany`
- Extension ID: `mycompany.my-extension`

---

## Step 2: Submit Extension

### Via Web Interface

1. Log in to [marketplace.blueplm.io](https://marketplace.blueplm.io)
2. Go to Publisher Dashboard
3. Click "Submit New Extension"
4. Upload your `.bpx` file
5. Fill in additional details:
   - Description (shown in store)
   - Categories
   - Screenshots (optional)
6. Review and submit

### Via CLI (if available)

```bash
# Login
blueplm-ext login

# Publish
blueplm-ext publish my-extension-1.0.0.bpx
```

### Submission Requirements

| Requirement | Description |
|-------------|-------------|
| Valid manifest | Must pass schema validation |
| License | OSI-approved open source license |
| Repository | Public repository URL |
| Unique ID | Not already taken |
| Size | Under 10 MB |
| Working code | Must not crash on load |

---

## Step 3: Review Process

### Community Extensions

Community extensions undergo basic automated checks:

1. **Schema validation** — Manifest is valid
2. **Security scan** — No obvious malware patterns
3. **Package integrity** — Files are complete
4. **License check** — Valid OSI license

**Timeline:** Usually published within 24 hours.

### What's Checked

- Manifest validity
- Required files present
- License is open source
- No obvious security issues
- Package under size limit

### Rejection Reasons

Your extension may be rejected if:

- ❌ Invalid or missing manifest
- ❌ No LICENSE file
- ❌ Non-open-source license
- ❌ Malicious code detected
- ❌ Publisher ID mismatch
- ❌ Duplicate extension ID

You'll receive an email with rejection details.

---

## Step 4: After Publishing

### Extension is Live

Once published:

1. Extension appears in the store
2. Badge shows "Community" (yellow warning icon)
3. Users can install with one click
4. Analytics tracking begins

### Update Your Extension

To publish updates:

1. Bump version in `extension.json`
2. Build new `.bpx` file
3. Submit via dashboard or CLI
4. Previous version remains available for rollback

```json
// extension.json
{
  "version": "1.1.0"  // Bumped from 1.0.0
}
```

### Version Semantics

| Change Type | Version Bump | Example |
|-------------|--------------|---------|
| Bug fix | Patch | 1.0.0 → 1.0.1 |
| New feature | Minor | 1.0.0 → 1.1.0 |
| Breaking change | Major | 1.0.0 → 2.0.0 |

---

## Step 5: Verification (Optional)

Verified extensions have a blue checkmark and are trusted by Blue Robotics.

### Benefits of Verification

| Benefit | Description |
|---------|-------------|
| Trust badge | Blue checkmark in store |
| Featured eligibility | Can be featured on homepage |
| Native extensions | Required for native category |
| Priority support | Direct support channel |

### Verification Requirements

1. **Code review** — Full code audit by Blue Robotics
2. **Security audit** — No vulnerabilities
3. **Quality standards** — Best practices followed
4. **Documentation** — Complete user documentation
5. **Maintenance** — Commitment to ongoing updates

### Request Verification

1. Email extensions@bluerobotics.com
2. Include:
   - Extension ID
   - Repository URL
   - Description of functionality
   - Your contact information
3. Wait for review (typically 1-2 weeks)

### Verification Process

1. **Initial review** — Blue Robotics reviews request
2. **Code audit** — Security and quality review
3. **Testing** — Full functionality testing
4. **Signing** — Extension signed with Ed25519
5. **Published** — Badge updated to Verified

---

## Deprecating Extensions

If you need to deprecate an extension:

### Mark as Deprecated

1. Go to Publisher Dashboard
2. Select extension
3. Click "Deprecate"
4. Provide:
   - Reason for deprecation
   - Replacement extension (if any)
   - Sunset date (when it will be removed)

### What Happens

- Warning badge shown in store
- Existing users notified
- New installs show warning
- After sunset date: removed from store

### Deprecation Notice

```json
{
  "deprecated": true,
  "deprecationReason": "Replaced by new-extension",
  "replacementId": "mycompany.new-extension",
  "sunsetDate": "2024-12-31"
}
```

---

## Analytics

### Available Metrics

| Metric | Description |
|--------|-------------|
| Installs | Total installation count |
| Active users | Users with extension enabled |
| Uninstalls | Removal count |
| Version distribution | Users per version |

### Accessing Analytics

1. Go to Publisher Dashboard
2. Select extension
3. View Analytics tab

### Using Analytics

- Track adoption over time
- Identify popular versions
- Monitor uninstall rate
- Plan deprecation timing

---

## Best Practices

### Before Publishing

1. **Test thoroughly** — Sideload and test all features
2. **Write documentation** — Clear README with examples
3. **Add screenshots** — Show your extension in action
4. **Check permissions** — Only request what's needed
5. **Review manifest** — Ensure all fields are complete

### Maintaining Published Extensions

1. **Monitor issues** — Watch GitHub issues
2. **Respond to reports** — Handle abuse reports promptly
3. **Update regularly** — Security and compatibility updates
4. **Communicate changes** — Use CHANGELOG

### Version Management

1. **Semantic versioning** — Follow semver strictly
2. **Keep changelog** — Document all changes
3. **Breaking changes** — Major version + migration guide
4. **Rollback support** — Previous versions available

---

## Troubleshooting

### Submission Rejected

**"Invalid manifest"**
- Run schema validation locally
- Check all required fields
- Ensure ID matches publisher

**"License not valid"**
- Use OSI-approved license
- Include full LICENSE file
- Match license field in manifest

**"Repository required"**
- Add public repository URL
- Ensure repository is accessible

### Upload Fails

**"Package too large"**
- Maximum 10 MB
- Minify code
- Exclude unnecessary files

**"Invalid package format"**
- Must be valid ZIP
- extension.json at root
- Check file structure

### Extension Not Showing

- Allow up to 24 hours for processing
- Check email for rejection notice
- Verify publisher account is active

---

## Support

### Getting Help

- **Documentation**: You're reading it!
- **GitHub Issues**: [bluerobotics/bluePLM](https://github.com/bluerobotics/bluePLM/issues)
- **Email**: extensions@bluerobotics.com

### Reporting Issues

For store/publishing issues:
1. Check this guide first
2. Search existing GitHub issues
3. Create new issue with:
   - Extension ID
   - Error message
   - Steps to reproduce

---

**[← Package Format](./package-format.md)** | **[Best Practices →](./best-practices.md)**
