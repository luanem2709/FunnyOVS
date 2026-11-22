/**
 * Tiện ích tiếp cận dùng chung cho các biểu mẫu:
 *  - <Note>: kết quả thao tác luôn được trình đọc màn hình đọc — thành công vào vùng role="status" LUÔN có mặt trong DOM
 *    (vùng live chỉ đọc đáng tin cậy khi đã tồn tại trước khi nội dung đổi), lỗi hiện bằng role="alert" (đọc ngay);
 *  - onCtrlEnter: Ctrl/⌘+Enter trong ô nhập nhiều dòng để gửi, không phải rời bàn phím sang nút.
 */
import type { KeyboardEvent } from "react";

export interface NoteState {
  text: string;
  bad?: boolean;
}

export function Note({ note }: { note: NoteState | null }) {
  return (
    <>
      <div className="muted small" role="status">
        {note && !note.bad ? note.text : null}
      </div>
      {note?.bad && (
        <div className="warn" role="alert">
          {note.text}
        </div>
      )}
    </>
  );
}

/** Có phải tổ hợp "gửi" (Ctrl/⌘ + Enter) không? Bỏ qua khi đang gõ dở bằng bộ gõ (IME, vd. Telex/VNI) để không gửi nhầm. */
export function isSubmitCombo(e: { key: string; ctrlKey: boolean; metaKey: boolean; nativeEvent?: { isComposing?: boolean } }): boolean {
  return e.key === "Enter" && (e.ctrlKey || e.metaKey) && !e.nativeEvent?.isComposing;
}

export function onCtrlEnter(submit: () => void) {
  return (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (!isSubmitCombo(e)) return;
    e.preventDefault();
    submit();
  };
}
