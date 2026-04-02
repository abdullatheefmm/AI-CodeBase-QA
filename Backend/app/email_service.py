"""
email_service.py – Send verification emails via Gmail SMTP
No domain verification needed. Works for any email address.
"""
import os
import smtplib
from email.mime.text      import MIMEText
from email.mime.multipart import MIMEMultipart

GMAIL_USER         = os.getenv("GMAIL_USER", "your_gmail@gmail.com")
GMAIL_APP_PASSWORD = os.getenv("GMAIL_APP_PASSWORD", "xxxx xxxx xxxx xxxx")
FRONTEND_URL       = os.getenv("FRONTEND_URL", "http://localhost:5173")


def send_verification_email(to_email: str, token: str) -> bool:
    verify_url = f"{FRONTEND_URL}/verify?token={token}"

    html = f"""
    <!DOCTYPE html>
    <html>
    <body style="margin:0;padding:0;background:#0e0e10;font-family:'DM Sans',system-ui,sans-serif;">
      <div style="max-width:480px;margin:40px auto;background:#18181b;border-radius:16px;
                  border:1px solid rgba(255,255,255,0.08);padding:40px 32px;">
        <div style="margin-bottom:32px;">
          <span style="font-size:16px;font-weight:600;color:#e4e4e7;">&lt;/&gt; CodeBase AI</span>
        </div>
        <h1 style="font-size:22px;font-weight:600;color:#e4e4e7;margin:0 0 10px;">
          Verify your email
        </h1>
        <p style="font-size:14px;color:#71717a;line-height:1.65;margin:0 0 28px;">
          Thanks for signing up! Click the button below to verify your email address and get started.
        </p>
        <a href="{verify_url}"
           style="display:inline-block;padding:12px 28px;background:#d97757;color:#fff;
                  text-decoration:none;border-radius:10px;font-size:14px;font-weight:500;">
          Verify Email Address
        </a>
        <hr style="border:none;border-top:1px solid rgba(255,255,255,0.07);margin:28px 0;" />
        <p style="font-size:12px;color:#3f3f46;margin:0;line-height:1.6;">
          This link expires in 24 hours. If you didn't create an account, ignore this email.
        </p>
        <p style="font-size:11px;color:#3f3f46;margin-top:8px;word-break:break-all;">
          Or copy: <span style="color:#52525b;">{verify_url}</span>
        </p>
      </div>
    </body>
    </html>
    """

    plain = f"Verify your CodeBase AI account:\n{verify_url}\n\nExpires in 24 hours."

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = "Verify your CodeBase AI account"
        msg["From"]    = f"CodeBase AI <{GMAIL_USER}>"
        msg["To"]      = to_email

        msg.attach(MIMEText(plain, "plain"))
        msg.attach(MIMEText(html,  "html"))

        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
            server.login(GMAIL_USER, GMAIL_APP_PASSWORD)
            server.sendmail(GMAIL_USER, to_email, msg.as_string())

        print(f"[Email] Sent verification to {to_email}")
        return True

    except smtplib.SMTPAuthenticationError:
        print("[Email] Auth failed — check GMAIL_USER and GMAIL_APP_PASSWORD in .env")
        return False
    except Exception as e:
        print(f"[Email] Failed to send to {to_email}: {e}")
        return False