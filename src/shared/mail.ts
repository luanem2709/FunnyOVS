/**
 * Kiểu cấu hình email dùng chung giữa server (SMTP/IMAP thật) và client (phần Email trong Cài đặt).
 * Mật khẩu KHÔNG nằm ở đây: server chỉ báo "đã đặt" qua `smtpPassSet` / `imapPassSet`.
 */

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  /** Địa chỉ người gửi hiển thị (mặc định = user). */
  from: string;
}

export interface ImapConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
}

export interface MailPublicConfig {
  smtp?: SmtpConfig;
  imap?: ImapConfig;
  smtpPassSet: boolean;
  imapPassSet: boolean;
}
