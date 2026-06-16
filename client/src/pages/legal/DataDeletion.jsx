import { useTranslation } from 'react-i18next';
import LegalLayout from '../../layouts/LegalLayout';

export default function DataDeletion() {
  const { i18n } = useTranslation();
  const isVi = i18n.language === 'vi' || i18n.language?.startsWith('vi');

  if (isVi) {
    return (
      <LegalLayout title="Yêu cầu Xóa Dữ liệu" lastUpdated="15 tháng 6, 2026">
        <p className="lead text-lg text-slate-600 dark:text-slate-300">
          BanknoteAI tôn trọng quyền kiểm soát dữ liệu cá nhân của bạn. Chính sách này mô tả các loại dữ liệu chúng tôi lưu trữ, cách thức bạn có thể yêu cầu xóa dữ liệu vĩnh viễn và quy trình thực hiện.
        </p>

        <h2>1. Tổng quan về Dữ liệu được Lưu trữ</h2>
        <p>
          Khi bạn đăng ký tài khoản và sử dụng hệ thống BanknoteAI, các thông tin sau sẽ được biên dịch vào hồ sơ cá nhân của bạn:
        </p>
        <ul>
          <li><strong>Thông tin tài khoản:</strong> Tên hiển thị, tên đăng nhập, địa chỉ email, mã băm mật khẩu và siêu dữ liệu đăng nhập Google.</li>
          <li><strong>Lịch sử quét tiền giấy:</strong> Nhật ký ghi nhận các lần quét, hình ảnh tải lên (nếu bạn bật lưu lịch sử), phiếu bầu của các tác tử AI và dữ liệu JSON kết quả.</li>
          <li><strong>Lịch sử giao dịch:</strong> Nhật ký mua các gói token, mã giao dịch từ cổng thanh toán và hóa đơn.</li>
        </ul>

        <h2>2. Tự Xóa tài khoản (Self-Service Deletion)</h2>
        <p>
          Nếu bạn muốn chấm dứt sử dụng dịch vụ và xóa toàn bộ dữ liệu của mình ngay lập tức, bạn có thể thực hiện theo các bước sau:
        </p>
        <ol>
          <li>Đăng nhập tài khoản tại <a href="/workspace">Không gian làm việc BanknoteAI</a>.</li>
          <li>Truy cập trang <strong>Cấu hình Hồ sơ (Profile Settings)</strong>.</li>
          <li>Cuộn xuống mục <strong>Vùng nguy hiểm (Danger Zone)</strong> ở dưới cùng.</li>
          <li>Nhấn nút <strong>Xóa tài khoản (Delete Account)</strong> và xác nhận hộp thoại cảnh báo.</li>
        </ol>
        <p>
          Hành động này sẽ lập tức hủy kích hoạt tài khoản của bạn, xóa số dư token hiện tại và đưa toàn bộ lịch sử quét vào trạng thái xóa vĩnh viễn.
        </p>

        <h2>3. Gửi Yêu cầu Xóa qua Email hỗ trợ</h2>
        <p>
          Trong trường hợp bạn không thể đăng nhập hoặc muốn gửi yêu cầu thủ công:
        </p>
        <ul>
          <li>Gửi email tới bộ phận quản lý dữ liệu của chúng tôi tại <a href="mailto:data@banknoteai.com">data@banknoteai.com</a> hoặc <a href="mailto:support@banknoteai.com">support@banknoteai.com</a>.</li>
          <li>Vui lòng gửi email từ chính địa chỉ email đã dùng để đăng ký tài khoản cần xóa.</li>
          <li>Nêu rõ yêu cầu "Yêu cầu xóa dữ liệu tài khoản [Tên tài khoản]" trong tiêu đề email.</li>
        </ul>

        <h2>4. Thời gian Xử lý và Ngoại lệ giữ lại dữ liệu</h2>
        <p>
          Sau khi yêu cầu của bạn được xác nhận:
        </p>
        <ul>
          <li><strong>Hệ thống Database hoạt động:</strong> Tài khoản của bạn sẽ lập tức bị khóa và thông tin cá nhân của bạn sẽ được xóa sạch khỏi cơ sở dữ liệu trong vòng 24 giờ.</li>
          <li><strong>Các File ảnh lưu trữ:</strong> Toàn bộ ảnh chụp tiền giấy lưu trong lịch sử quét của bạn trên kho lưu trữ đám mây sẽ bị xóa vĩnh viễn.</li>
          <li><strong>Bản sao lưu (Backup):</strong> Thông tin sẽ bị ghi đè hoàn toàn khỏi các ổ lưu trữ dự phòng của chúng tôi trong vòng 14 ngày làm việc.</li>
          <li><strong>Sổ sách Tài chính:</strong> Theo quy định về kiểm toán và thuế, các thông tin liên quan đến giao dịch nạp tiền (như giao dịch qua SePay, VietQR, VNPay) vẫn được lưu lại để phục vụ đối chiếu thuế nhưng sẽ được ẩn danh hóa (xóa liên kết với email và tên của bạn).</li>
        </ul>
      </LegalLayout>
    );
  }

  // Fallback to English
  return (
    <LegalLayout title="Data Deletion Request" lastUpdated="June 15, 2026">
      <p className="lead text-lg text-slate-600 dark:text-slate-300">
        BanknoteAI respects your right to control your personal data. This policy outlines the types of data we store, how you can request its permanent deletion, and our processing timelines.
      </p>

      <h2>1. Overview of Stored User Data</h2>
      <p>
        When you register and use the BanknoteAI platform, we compile a profile containing:
      </p>
      <ul>
        <li><strong>Account credentials:</strong> Your name, username, email address, password hash, and social login metadata.</li>
        <li><strong>Scan history logs:</strong> Records of analyzed banknotes, including upload timestamps, input images (if you opted to save history), consensus parameters, individual agent votes, and structured JSON results.</li>
        <li><strong>Payment logs:</strong> Transaction history showing token pack purchases, currency gateway references, and billing invoice details.</li>
      </ul>

      <h2>2. Self-Service Account Deletion</h2>
      <p>
        If you wish to terminate your account and erase all associated logs immediately, you can utilize the self-service deletion option inside the platform:
      </p>
      <ol>
        <li>Log in to your account at <a href="/workspace">BanknoteAI Workspace</a>.</li>
        <li>Navigate to your <strong>Profile Settings</strong> page.</li>
        <li>Scroll down to the <strong>Danger Zone</strong> section.</li>
        <li>Click <strong>Delete Account</strong> and confirm the warning dialog.</li>
      </ol>
      <p>
        Confirming this action will instantly deactivate your profile, wipe your remaining token balance, and schedule all history logs for permanent overwrite.
      </p>

      <h2>3. Requesting Deletion via Support</h2>
      <p>
        If you are unable to access your profile settings or if your account was registered via a Google authentication failure, you can submit a manual deletion request:
      </p>
      <ul>
        <li>Email our data compliance team at <a href="mailto:data@banknoteai.com">data@banknoteai.com</a> or <a href="mailto:support@banknoteai.com">support@banknoteai.com</a>.</li>
        <li>Please send the email from the address registered with the account you want deleted.</li>
        <li>Include "Data Deletion Request" and your username in the subject line.</li>
      </ul>
      <p>
        Our support agents will verify your identity before performing any deletion to protect you from unauthorized data wipes.
      </p>

      <h2>4. Deletion Timelines and Retention Exceptions</h2>
      <p>
        Once a request is initiated or confirmed:
      </p>
      <ul>
        <li><strong>Active Database Wipe:</strong> Your account status is marked as "Deleted," rendering it immediately inaccessible. The corresponding user row and credentials are scrubbed from production tables within 24 hours.</li>
        <li><strong>Image Cache Clear:</strong> Any banknote images stored in our temp storage or history cache are permanently wiped from our cloud storage buckets.</li>
        <li><strong>Backup Systems:</strong> Data is purged from read-only server backups within 14 business days.</li>
        <li><strong>Financial Ledgers:</strong> Under regional laws and tax regulations, records of financial transactions (such as SePay or VNPay invoicing metadata) must be retained for auditing purposes. These transaction logs will be anonymized (linked to a random UUID rather than your email/name) but are not destroyed.</li>
      </ul>

      <h2>5. Clarifications & Status Checks</h2>
      <p>
        If you have any questions regarding your data status or need confirmation that your account has been fully scrubbed, please feel free to email our data protection officer at <a href="mailto:compliance@banknoteai.com">compliance@banknoteai.com</a>.
      </p>
    </LegalLayout>
  );
}

