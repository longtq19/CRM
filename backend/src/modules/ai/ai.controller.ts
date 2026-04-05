import { Request, Response } from 'express';
import { AiService } from './ai.service';

export class AiController {
  
  /**
   * Endpoint để chat trực tiếp qua HTTP
   */
  static async chat(req: any, res: Response) {
    const { message, history = [] } = req.body;
    const userId = req.user.id;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    try {
      const reply = await AiService.chat(userId, message, history);
      return res.json({ reply });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  }

  /**
   * Endpoint để lấy danh sách Tools sẵn có (cho MCP-ready clients)
   */
  static async getTools(req: Request, res: Response) {
      // Cho thấy sự MCP-ready: trả về các công cụ mà AI có thể gọi
      const { AI_TOOLS } = require('./mcp/tools');
      return res.json({ tools: AI_TOOLS });
  }

}
