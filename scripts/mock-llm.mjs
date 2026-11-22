/**
 * Máy chủ LLM GIẢ tương thích OpenAI — chỉ để thử toàn bộ chuỗi "giao việc → lập kế hoạch → trưởng phòng → nhân viên dùng công cụ
 * → nghiệm thu → báo cáo" mà không cần khoá AI thật và không tốn token.
 *
 * Mặc định lắng nghe 127.0.0.1:11434 (cổng Ollama) nên FunnyOVS tự phát hiện nó như một Ollama đang chạy.
 *   node scripts/mock-llm.mjs            (đổi cổng: MOCK_PORT=11435; trỏ app tới đó bằng OLLAMA_HOST=127.0.0.1:11435)
 *
 * Nhận diện loại yêu cầu theo system prompt của app:
 *   - Giám đốc lập kế hoạch → 2 bước: marketing rồi sales (sales phụ thuộc marketing)
 *   - Nhân viên (ReAct)     → sales: tạo liên hệ + giao dịch trong CRM; marketing: ghi file chiến dịch; còn lại trả lời luôn
 *   - Giám đốc tổng hợp     → báo cáo ngắn
 */
import http from "node:http";

const port = Number(process.env.MOCK_PORT ?? 11434);
const DELAY_MS = Number(process.env.MOCK_DELAY_MS ?? 350);

const text = (m) => (typeof m?.content === "string" ? m.content : "");
const wantsEnglish = (system) => /Answer the requester in English|report in English|written in English/.test(system);

function reply(messages) {
  const system = text(messages.find((m) => m.role === "system"));
  const en = wantsEnglish(system);

  // 1) Lập kế hoạch
  if (system.includes("Split the owner's request into work for your departments")) {
    return JSON.stringify({
      steps: [
        {
          department: "marketing",
          task: en ? "Write a short launch campaign brief for the new Pro plan." : "Viết bản tóm tắt chiến dịch ra mắt gói Pro.",
          dependsOn: [],
          rationale: en ? "Needs campaign copy first." : "Cần nội dung chiến dịch trước.",
        },
        {
          department: "sales",
          task: en ? "Create the lead and a Pro-plan deal in the CRM using the campaign brief." : "Tạo khách tiềm năng và giao dịch gói Pro trong CRM dựa trên bản tóm tắt chiến dịch.",
          dependsOn: [0],
          rationale: en ? "Sales follows up once the campaign is ready." : "Bán hàng theo dõi sau khi có chiến dịch.",
        },
      ],
    });
  }

  // 2) Báo cáo tổng hợp của Giám đốc
  if (system.includes("You are the managing director reporting to the company owner")) {
    return en
      ? "Done. Marketing drafted the Pro-plan launch brief and Sales created the lead and a deal in the CRM. Next step: send the first outreach email."
      : "Đã xong. Phòng Marketing soạn bản tóm tắt ra mắt gói Pro và Phòng Bán hàng tạo khách tiềm năng cùng giao dịch trong CRM. Bước tiếp theo: gửi email chào hàng đầu tiên.";
  }

  // 3) Nhân viên (ReAct): đếm số kết quả công cụ đã nhận để biết đang ở bước nào
  const toolResults = messages.filter((m) => m.role === "user" && text(m).startsWith("TOOL_RESULT")).length;
  const isSales = system.includes("crm_add_deal");
  const canWrite = system.includes("fs_write");
  if (isSales && toolResults === 0) {
    return JSON.stringify({ thought: "Create the contact first", tool: "crm_upsert_contact", args: { name: en ? "Ms. Mai" : "Chị Mai", email: "mai@shop.vn", company: "Mai Shop", tags: "pro-plan" } });
  }
  if (isSales && toolResults === 1) {
    return JSON.stringify({ thought: "Now the deal", tool: "crm_add_deal", args: { contact: "mai@shop.vn", title: en ? "Pro plan — Mai Shop" : "Gói Pro — Mai Shop", value: 12000000, stage: "proposal" } });
  }
  if (!isSales && canWrite && toolResults === 0 && /marketing|content writer|nội dung/i.test(system)) {
    return JSON.stringify({
      thought: "Save the brief",
      tool: "fs_write",
      args: en
        ? { path: "pro-plan-campaign.md", content: "# Pro plan launch campaign\n\n- Message: save 10 hours a week\n- Channels: email, Facebook\n- Goal: 50 trial users" }
        : { path: "chien-dich-goi-pro.md", content: "# Chiến dịch ra mắt gói Pro\n\n- Thông điệp: tiết kiệm 10 giờ mỗi tuần\n- Kênh: email, Facebook\n- Mục tiêu: 50 khách dùng thử" },
    });
  }
  return JSON.stringify({ final: en ? "Completed my part. Details are saved in the workspace and the CRM." : "Đã hoàn thành phần việc của mình. Chi tiết đã lưu trong workspace và CRM." });
}

const server = http.createServer((req, res) => {
  const url = (req.url ?? "").split("?")[0];
  const send = (code, body) => {
    res.writeHead(code, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };
  if (req.method === "GET" && url === "/v1/models") return send(200, { data: [{ id: "mock-qwen2.5:7b" }] });
  if (req.method === "POST" && url === "/v1/chat/completions") {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      let body;
      try {
        body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch {
        return send(400, { error: { message: "bad json" } });
      }
      const messages = Array.isArray(body.messages) ? body.messages : [];
      const content = reply(messages);
      console.log(`[mock-llm] ${messages.length} msgs → ${content.slice(0, 90).replace(/\n/g, " ")}`);
      setTimeout(
        () =>
          send(200, {
            choices: [{ message: { role: "assistant", content } }],
            usage: { prompt_tokens: Math.ceil(JSON.stringify(messages).length / 4), completion_tokens: Math.ceil(content.length / 4) },
          }),
        DELAY_MS,
      );
    });
    return;
  }
  send(404, { error: { message: "not found" } });
});

server.on("error", (e) => {
  console.error(`[mock-llm] không mở được cổng ${port}: ${e.message}`);
  process.exit(1);
});
server.listen(port, "127.0.0.1", () => console.log(`[mock-llm] http://127.0.0.1:${port}/v1 (giả lập Ollama)`));
