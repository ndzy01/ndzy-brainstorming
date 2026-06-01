import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';

type ChatMessages = OpenAI.Chat.Completions.ChatCompletionMessageParam[];

@Injectable()
export class AiService {
  private readonly model = 'deepseek-v4-pro';
  public client: OpenAI;

  constructor() {
    this.client = new OpenAI({
      apiKey: process.env.OPEN_AI_API_KEY,
      baseURL: process.env.OPEN_AI_BASE_URL,
    });
  }

  /** 单轮：传一个 prompt，返回回复 */
  async ask(prompt: string, system?: string): Promise<string> {
    const messages: ChatMessages = [];
    if (system) messages.push({ role: 'system', content: system });
    messages.push({ role: 'user', content: prompt });
    return this.chat(messages);
  }

  /** 多轮：传完整 messages 数组 */
  async chat(messages: ChatMessages): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages,
      reasoning_effort: 'high',
    });
    return response.choices[0]?.message?.content ?? '';
  }

  /** 流式多轮：逐块返回 content delta */
  async *stream(messages: ChatMessages): AsyncGenerator<string, void, unknown> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages,
      stream: true,
      reasoning_effort: 'high',
    });

    for await (const chunk of response) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) yield delta;
    }
  }

  /** 流式单轮：便捷封装 */
  askStream(
    prompt: string,
    system?: string,
  ): AsyncGenerator<string, void, unknown> {
    const messages: ChatMessages = [];
    if (system) messages.push({ role: 'system', content: system });
    messages.push({ role: 'user', content: prompt });
    return this.stream(messages);
  }
}
