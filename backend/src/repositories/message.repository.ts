import { supabaseAdmin } from '../db/client.js';
import { TABLES } from '../db/client.js';

export interface Source {
  url: string;
  title: string;
  snippet: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  sources: Source[] | null;
  model: string | null;
  tokens_used: number | null;
  created_at: string;
}

export type CreateMessageData = Pick<Message, 'conversation_id' | 'role' | 'content'> &
  Partial<Pick<Message, 'sources' | 'model' | 'tokens_used'>>;

export interface FindByConversationIdOptions {
  limit?: number;
  offset?: number;
}

export class MessageRepository {
  async findById(id: string): Promise<Message | null> {
    const { data, error } = await supabaseAdmin
      .from(TABLES.MESSAGES)
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`MessageRepository.findById failed: ${error.message}`);
    }

    return data as Message;
  }

  async findByConversationId(
    conversationId: string,
    options: FindByConversationIdOptions = {},
  ): Promise<Message[]> {
    const { limit = 100, offset = 0 } = options;

    const { data, error } = await supabaseAdmin
      .from(TABLES.MESSAGES)
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .range(offset, offset + limit - 1);

    if (error) {
      throw new Error(`MessageRepository.findByConversationId failed: ${error.message}`);
    }

    return (data as Message[]) ?? [];
  }

  async create(data: CreateMessageData): Promise<Message> {
    const { data: created, error } = await supabaseAdmin
      .from(TABLES.MESSAGES)
      .insert(data)
      .select('*')
      .single();

    if (error) {
      throw new Error(`MessageRepository.create failed: ${error.message}`);
    }

    return created as Message;
  }

  async delete(id: string): Promise<boolean> {
    const { error, count } = await supabaseAdmin
      .from(TABLES.MESSAGES)
      .delete({ count: 'exact' })
      .eq('id', id);

    if (error) {
      throw new Error(`MessageRepository.delete failed: ${error.message}`);
    }

    return (count ?? 0) > 0;
  }

  async deleteByConversationId(conversationId: string): Promise<boolean> {
    const { error, count } = await supabaseAdmin
      .from(TABLES.MESSAGES)
      .delete({ count: 'exact' })
      .eq('conversation_id', conversationId);

    if (error) {
      throw new Error(`MessageRepository.deleteByConversationId failed: ${error.message}`);
    }

    return (count ?? 0) > 0;
  }
}

export const messageRepository = new MessageRepository();
