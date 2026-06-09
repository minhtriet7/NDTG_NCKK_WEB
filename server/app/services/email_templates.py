from typing import Any, Dict


def money_vnd(value: Any) -> str:
    try:
        number = int(float(value or 0))
        return f"{number:,}".replace(",", ".") + " đ"
    except Exception:
        return str(value or "0 đ")


def build_email_html(title: str, message: str, extra: str = "") -> str:
    return f"""
    <div style="font-family:Arial,sans-serif;background:#f8fafc;padding:24px;">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:18px;overflow:hidden;">
        <div style="background:#0f766e;padding:22px 26px;color:#ffffff;">
          <h1 style="margin:0;font-size:22px;">BanknoteAI</h1>
          <p style="margin:6px 0 0;color:#ccfbf1;font-size:14px;">AI-powered banknote recognition</p>
        </div>

        <div style="padding:26px;">
          <h2 style="margin:0 0 12px;color:#0f172a;font-size:20px;">{title}</h2>
          <p style="margin:0 0 18px;color:#334155;font-size:15px;line-height:1.6;">{message}</p>
          {extra}
          <p style="margin-top:28px;color:#94a3b8;font-size:12px;line-height:1.5;">
            This is an automated email from BanknoteAI. Please do not reply directly to this message.
          </p>
        </div>
      </div>
    </div>
    """


def register_email(full_name: str) -> Dict[str, str]:
    subject = "Welcome to BanknoteAI"

    html = build_email_html(
        title="Welcome to BanknoteAI",
        message=(
            f"Hello {full_name or 'there'}, your BanknoteAI account has been created successfully. "
            "You can now scan banknotes, manage your token balance, and review your recognition history."
        ),
    )

    return {
        "subject": subject,
        "html": html,
    }


def login_email(full_name: str) -> Dict[str, str]:
    subject = "New sign-in to your BanknoteAI account"

    html = build_email_html(
        title="New sign-in detected",
        message=(
            f"Hello {full_name or 'there'}, your BanknoteAI account was just signed in. "
            "If this was you, no action is required. If you did not sign in, please change your password."
        ),
    )

    return {
        "subject": subject,
        "html": html,
    }


def payment_created_email(full_name: str, transaction: Dict[str, Any]) -> Dict[str, str]:
    subject = "BanknoteAI payment invoice created"

    extra = f"""
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:16px;margin-top:16px;">
      <p style="margin:0 0 8px;color:#475569;font-size:14px;"><b>Package:</b> {transaction.get("package_name") or "Token package"}</p>
      <p style="margin:0 0 8px;color:#475569;font-size:14px;"><b>Amount:</b> {money_vnd(transaction.get("amount"))}</p>
      <p style="margin:0 0 8px;color:#475569;font-size:14px;"><b>Gateway:</b> {transaction.get("payment_gateway") or transaction.get("gateway") or "N/A"}</p>
      <p style="margin:0;color:#475569;font-size:14px;"><b>Transfer content:</b> {transaction.get("transfer_content") or transaction.get("transaction_code") or "N/A"}</p>
    </div>
    """

    html = build_email_html(
        title="Payment invoice created",
        message=(
            f"Hello {full_name or 'there'}, your payment invoice has been created. "
            "Please complete the transfer using the exact payment information."
        ),
        extra=extra,
    )

    return {
        "subject": subject,
        "html": html,
    }


def payment_success_email(full_name: str, transaction: Dict[str, Any]) -> Dict[str, str]:
    subject = "BanknoteAI payment successful"

    extra = f"""
    <div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:14px;padding:16px;margin-top:16px;">
      <p style="margin:0 0 8px;color:#065f46;font-size:14px;"><b>Package:</b> {transaction.get("package_name") or "Token package"}</p>
      <p style="margin:0 0 8px;color:#065f46;font-size:14px;"><b>Amount:</b> {money_vnd(transaction.get("amount"))}</p>
      <p style="margin:0;color:#065f46;font-size:14px;"><b>Tokens added:</b> {transaction.get("tokens_added") or 0}</p>
    </div>
    """

    html = build_email_html(
        title="Payment confirmed",
        message=(
            f"Hello {full_name or 'there'}, your payment has been confirmed successfully. "
            "Your tokens have been added to your BanknoteAI account."
        ),
        extra=extra,
    )

    return {
        "subject": subject,
        "html": html,
    }


def payment_failed_email(full_name: str, transaction: Dict[str, Any]) -> Dict[str, str]:
    subject = "BanknoteAI payment failed"

    extra = f"""
    <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:14px;padding:16px;margin-top:16px;">
      <p style="margin:0 0 8px;color:#9a3412;font-size:14px;"><b>Package:</b> {transaction.get("package_name") or "Token package"}</p>
      <p style="margin:0 0 8px;color:#9a3412;font-size:14px;"><b>Amount:</b> {money_vnd(transaction.get("amount"))}</p>
      <p style="margin:0;color:#9a3412;font-size:14px;"><b>Transaction code:</b> {transaction.get("transaction_code") or "N/A"}</p>
    </div>
    """

    html = build_email_html(
        title="Payment failed",
        message=(
            f"Hello {full_name or 'there'}, your payment could not be completed. "
            "You can create a new invoice or contact support if the issue continues."
        ),
        extra=extra,
    )

    return {
        "subject": subject,
        "html": html,
    }


def feedback_created_email(full_name: str, feedback: Dict[str, Any]) -> Dict[str, str]:
    subject = "BanknoteAI feedback received"

    extra = f"""
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:16px;margin-top:16px;">
      <p style="margin:0 0 8px;color:#475569;font-size:14px;"><b>Subject:</b> {feedback.get("subject") or "Feedback"}</p>
      <p style="margin:0 0 8px;color:#475569;font-size:14px;"><b>Type:</b> {feedback.get("feedback_type") or "other"}</p>
      <p style="margin:0;color:#475569;font-size:14px;"><b>Priority:</b> {feedback.get("priority") or "medium"}</p>
    </div>
    """

    html = build_email_html(
        title="Feedback received",
        message=(
            f"Hello {full_name or 'there'}, thank you for sending feedback to BanknoteAI. "
            "Our team will review it as soon as possible."
        ),
        extra=extra,
    )

    return {
        "subject": subject,
        "html": html,
    }


def feedback_replied_email(full_name: str, feedback: Dict[str, Any]) -> Dict[str, str]:
    subject = "BanknoteAI feedback updated"

    extra = f"""
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:16px;margin-top:16px;">
      <p style="margin:0 0 8px;color:#475569;font-size:14px;"><b>Subject:</b> {feedback.get("subject") or "Feedback"}</p>
      <p style="margin:0;color:#475569;font-size:14px;"><b>Admin reply:</b> {feedback.get("admin_reply") or "Your feedback has been reviewed."}</p>
    </div>
    """

    html = build_email_html(
        title="Your feedback has been reviewed",
        message=(
            f"Hello {full_name or 'there'}, an administrator has reviewed your feedback."
        ),
        extra=extra,
    )

    return {
        "subject": subject,
        "html": html,
    }
def password_updated_email(full_name: str) -> Dict[str, str]:
    subject = "Your BanknoteAI password was updated"

    html = build_email_html(
        title="Password updated successfully",
        message=(
            f"Hello {full_name or 'there'}, your BanknoteAI account password "
            "has just been updated. If this was you, no further action is required. "
            "If you did not make this change, please contact support immediately."
        ),
    )

    return {
        "subject": subject,
        "html": html,
    }
def google_first_login_email(full_name: str) -> Dict[str, str]:
    subject = "Welcome to BanknoteAI with Google"

    html = build_email_html(
        title="Google sign-in connected",
        message=(
            f"Hello {full_name or 'there'}, your BanknoteAI account has been created "
            "or connected successfully using Google sign-in. You can now use your Google "
            "account to access BanknoteAI."
        ),
    )

    return {
        "subject": subject,
        "html": html,
    }


def admin_system_error_email(error_message: str, path: str = "N/A") -> Dict[str, str]:
    subject = "BanknoteAI Admin Alert: System Error"

    extra = f"""
    <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:14px;padding:16px;margin-top:16px;">
      <p style="margin:0 0 8px;color:#9a3412;font-size:14px;"><b>Path:</b> {path}</p>
      <p style="margin:0;color:#9a3412;font-size:14px;"><b>Error:</b> {error_message}</p>
    </div>
    """

    html = build_email_html(
        title="System error detected",
        message=(
            "BanknoteAI detected an internal server error. "
            "Please review server logs and admin system logs."
        ),
        extra=extra,
    )

    return {
        "subject": subject,
        "html": html,
    }    