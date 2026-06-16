import os

def update_file(path):
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()

    # 1. Import useLocation if not already imported
    if "useLocation" not in content and "react-router-dom" in content:
        content = content.replace("useNavigate", "useNavigate, useLocation")

    # 2. Add useEffect if not imported
    if "useEffect" not in content and "react" in content:
        content = content.replace("useState", "useState, useEffect")

    # 3. Add logic inside component
    if "const location = useLocation();" not in content:
        # find the line after isDark
        insert_idx = content.find("const [formData")
        if insert_idx != -1:
            hook_code = """  const location = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const errorParam = params.get('error');
    if (errorParam) {
      if (errorParam === 'GoogleOAuthNotConfigured') {
        setError('Hệ thống chưa được cấu hình Đăng nhập Google (Thiếu Client ID).');
      } else {
        setError('Đăng nhập Google thất bại: ' + errorParam);
      }
    }
  }, [location.search]);

"""
            content = content[:insert_idx] + hook_code + content[insert_idx:]

    # 4. Replace hardcoded URL with authService.getGoogleLoginUrl()
    content = content.replace(
        "window.location.href = 'http://localhost:8000/api/v1/auth/google/login'",
        "window.location.href = authService.getGoogleLoginUrl()"
    )

    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

update_file("client/src/pages/auth/Login.jsx")
update_file("client/src/pages/auth/Register.jsx")
print("Done updating Google Login links.")
