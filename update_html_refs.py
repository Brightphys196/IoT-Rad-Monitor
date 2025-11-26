import os
import re

# Mapping of filename to its new relative path from root
file_map = {
    "login.html": "auth/login.html",
    "register.html": "auth/register.html",
    "auth-callback.html": "auth/auth-callback.html",
    "admin.html": "admin/admin.html",
    "admin-dashboard.html": "admin/admin-dashboard.html",
    "report_lan1.html": "reports/report_lan1.html",
    "report_lan2.html": "reports/report_lan2.html",
    "dashboard.html": "pages/dashboard.html",
    "hardware.html": "pages/hardware.html",
    "status.html": "pages/status.html",
    "data-analysis.html": "pages/data-analysis.html",
    "evaluation.html": "pages/evaluation.html",
    "profile.html": "pages/profile.html",
    "dashboard-s3-goc.html": "pages/dashboard-s3-goc.html",
    "index1.html": "pages/index1.html",
    "index.html": "index.html"
}

directories = ["auth", "admin", "reports", "pages"]

def update_content(content, current_dir):
    # Update assets, images, manifest
    if current_dir != ".":
        content = content.replace('href="assets/', 'href="../assets/')
        content = content.replace('src="assets/', 'src="../assets/')
        content = content.replace('href="images/', 'href="../images/')
        content = content.replace('src="images/', 'src="../images/')
        content = content.replace('href="manifest.json"', 'href="../manifest.json"')
        content = content.replace('href="components/', 'href="../components/') # Just in case
        
        # Special case for favicon which might be used in JS or specific link tags
        content = content.replace('href="/images/', 'href="../images/')
        
        # Fix double dots if they were already there (unlikely but safe)
        content = content.replace('../../assets', '../assets')
        content = content.replace('../../images', '../images')

    # Update links to other HTML files
    for filename, new_path in file_map.items():
        # Regex to match href="filename" or href="./filename"
        # We want to replace it with the correct relative path
        
        if current_dir == ".":
            target_path = new_path
        else:
            # From subdir to root or other subdir
            if new_path == "index.html":
                target_path = "../index.html"
            else:
                target_dir = new_path.split('/')[0]
                target_file = new_path.split('/')[1]
                
                if target_dir == current_dir:
                    target_path = target_file
                else:
                    target_path = f"../{target_dir}/{target_file}"
        
        # Replace href="filename"
        pattern = r'(href=["\'])(\./)?' + re.escape(filename) + r'(["\'])'
        replacement = r'\1' + target_path + r'\3'
        content = re.sub(pattern, replacement, content)
        
        # Replace window.location.href = 'filename' (simple case)
        pattern_js = r"(window\.location\.href\s*=\s*['\"])(\./)?" + re.escape(filename) + r"(?=['\"])"
        replacement_js = r"\1" + target_path
        content = re.sub(pattern_js, replacement_js, content)

    return content

# Update index.html
if os.path.exists("index.html"):
    print("Updating index.html")
    with open("index.html", "r", encoding="utf-8") as f:
        content = f.read()
    new_content = update_content(content, ".")
    with open("index.html", "w", encoding="utf-8") as f:
        f.write(new_content)

# Update files in subdirectories
for directory in directories:
    if not os.path.exists(directory):
        continue
        
    for filename in os.listdir(directory):
        if filename.endswith(".html"):
            filepath = os.path.join(directory, filename)
            print(f"Updating {filepath}")
            with open(filepath, "r", encoding="utf-8") as f:
                content = f.read()
            new_content = update_content(content, directory)
            with open(filepath, "w", encoding="utf-8") as f:
                f.write(new_content)
