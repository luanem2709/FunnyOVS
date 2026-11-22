/**
 * Chốt chặn lỗi dựng giao diện: một thành phần lỗi (dữ liệu bất ngờ, bug) không được làm trắng cả màn hình.
 * `inline` = chỉ thay phần lỗi bằng một thẻ nhỏ có nút thử lại (dùng cho từng tab); không có = toàn trang với nút tải lại.
 */
import { Component, type ErrorInfo, type ReactNode } from "react";
import { tr } from "../i18n/index.js";

interface Props {
  children: ReactNode;
  inline?: boolean;
  /** Đổi giá trị này (vd. tab đang mở) thì thử dựng lại thay vì giữ nguyên trạng thái lỗi. */
  resetKey?: string;
}

export class ErrorBoundary extends Component<Props, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: unknown): { error: Error } {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[ui] lỗi dựng giao diện:", error.message, info.componentStack?.split("\n").slice(0, 4).join(" | "));
  }

  componentDidUpdate(prev: Props): void {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    const retry = this.props.inline ? () => this.setState({ error: null }) : () => location.reload();
    return (
      <div className={this.props.inline ? "crash inline" : "crash"} role="alert">
        <b>{tr("app.crash")}</b>
        <p className="small muted">{error.message.slice(0, 200)}</p>
        <button className="primary" onClick={retry}>
          {this.props.inline ? tr("common.retry") : tr("app.reload")}
        </button>
      </div>
    );
  }
}
