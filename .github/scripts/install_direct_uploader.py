from pathlib import Path


def replace_once(text: str, old: str, new: str, name: str) -> str:
    if old not in text:
        if new in text:
            return text
        raise SystemExit(f"Expected pattern not found in {name}: {old[:80]!r}")
    return text.replace(old, new, 1)


def install_page(path: str, old_button: str, new_button: str, init_script: str) -> None:
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    text = replace_once(text, old_button, new_button, path)
    marker = '<script src="js/direct-portfolio-uploader.js"></script>'
    if marker not in text:
        text = text.replace('</body>', f'{marker}\n{init_script}\n</body>', 1)
    p.write_text(text, encoding="utf-8")


install_page(
    'certifications.html',
    '<a href="admin/" class="owner-upload-btn" title="Open the owner publishing console">⬆ Owner Upload / Manage</a>',
    '<button type="button" id="certificate-upload-button" class="owner-upload-btn" title="Choose a certificate image from this device">⬆ Upload Certificate</button>',
    '<script>RKDirectUploader.attach("#certificate-upload-button","certificate",{onSuccess:()=>setTimeout(()=>location.reload(),1800)});</script>',
)

install_page(
    'faith-creative-ministry.html',
    '<a href="admin/" class="owner-upload-btn" title="Open the owner publishing console">⬆ Owner Upload / Manage Faith Items</a>',
    '<button type="button" id="faith-upload-button" class="owner-upload-btn" title="Choose a faith or ministry image from this device">⬆ Upload Faith / Ministry Item</button>',
    '<script>RKDirectUploader.attach("#faith-upload-button","faith",{onSuccess:()=>setTimeout(()=>location.reload(),1800)});</script>',
)

# Upgrade the owner console buttons as well, while retaining the explanatory page.
admin = Path('admin/index.html')
text = admin.read_text(encoding='utf-8')
text = text.replace(
    '<a class="btn" href="https://github.com/Kurbah-Portfolios/rivaldo-kurbah-portfolio/issues/new?template=add-certificate.yml" target="_blank" rel="noopener">Add Certificate</a>',
    '<button type="button" class="btn" id="admin-certificate-upload">Choose Certificate File</button>'
)
text = text.replace(
    '<a class="btn" href="https://github.com/Kurbah-Portfolios/rivaldo-kurbah-portfolio/issues/new?template=add-faith-item.yml" target="_blank" rel="noopener">Add Faith Item</a>',
    '<button type="button" class="btn" id="admin-faith-upload">Choose Faith Item File</button>'
)
text = text.replace(
    '<li>Open the appropriate form while signed in to GitHub as <strong>KurbahTech</strong>.</li><li>Fill in the details and drag the image into the image field.</li><li>Submit the form.</li><li>GitHub Actions copies the image into this portfolio repository, updates the relevant JSON data file and commits the change to <strong>main</strong>.</li><li>The submission is closed automatically after a successful publish. GitHub Pages then refreshes the public page.</li>',
    '<li>Click the appropriate upload button and choose an image from your computer or phone.</li><li>Fill in the certificate or ministry details in the secure upload modal.</li><li>Paste a fine-grained GitHub token restricted to this repository with Contents read/write permission.</li><li>Click <strong>Upload &amp; Publish</strong>. The browser uploads the image and updates the managed JSON data directly on <strong>main</strong>.</li><li>The token is not saved by the page. GitHub Pages refreshes after the repository update.</li>'
)
text = text.replace(
    '<div class="security"><strong>Owner-only publishing:</strong> submissions are processed automatically only when the GitHub issue is created by the <strong>KurbahTech</strong> account. No GitHub token is stored in this page.</div>',
    '<div class="security"><strong>Direct owner publishing:</strong> choose a local image and publish directly to this repository. A fine-grained GitHub token for <strong>KurbahTech</strong> is required at publish time and is not saved by this page.</div>'
)
if '<script src="../js/direct-portfolio-uploader.js"></script>' not in text:
    text = text.replace(
        '</body>',
        '<script src="../js/direct-portfolio-uploader.js"></script>\n<script>RKDirectUploader.attach("#admin-certificate-upload","certificate");RKDirectUploader.attach("#admin-faith-upload","faith");</script>\n</body>',
        1,
    )
admin.write_text(text, encoding='utf-8')

print('Direct uploader installed on certifications, faith portfolio, and admin console.')
