// AI Service - Module AI của Zeno ERP
// Cấu trúc đã sẵn sàng cho microservice và MCP sau này.
export class AiService {
  /**
   * Xử lý tin nhắn chat từ người dùng.
   * Hiện tại hạ tầng chưa được kích hoạt Gemini nên sử dụng phản hồi mặc định.
   */
  static async chat(userId: string, message: string, history: any[] = []): Promise<string> {
    // Phản hồi hardcode theo yêu cầu của hệ thống (chờ phê duyệt nâng cấp)
    return "Cám ơn bạn đã sử dụng Zeno AI. Tuy nhiên, hạ tầng hiện tại chưa đáp ứng yêu cầu của Zeno AI. Vui lòng quay lại sau khi chủ tịch duyệt nâng cấp tính năng này!";
  }

  /**
   * Stream response version (Phác thảo cho Socket.IO)
   */
  static async *streamChat(userId: string, message: string) {
      const responseText = await this.chat(userId, message);
      // Giả lập hiệu ứng gõ chữ
      const words = responseText.split(' ');
      for (let i = 0; i < words.length; i++) {
          yield words[i] + (i < words.length - 1 ? ' ' : '');
          await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 50));
      }
  }
}
