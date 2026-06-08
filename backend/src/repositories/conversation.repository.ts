import { supabaseAdmin } from '../db/client.js';
import { TABLES } from '../db/client.js';

export interface Conversation {
  id: string;
  user_id: string;
  title: string;
  query: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  created_at: string;
  updated_at: string;
}

export type CreateConversationData = Pick<Conversation, 'user_id' | 'title' | 'query'> &
  Partial<Pick<Conversation, 'status'>>;

export type UpdateConversationData = Partial<Pick<Conversation, 'title' | 'query' | 'status'>>;

export interface FindByUserIdOptions {
  limit?: number;
  offset?: number;
}

export class ConversationRepository {
  async findById(id: string): Promise<Conversation | null> {
    const { data, error } = await supabaseAdmin
      .from(TABLES.CONVERSATIONS)
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`ConversationRepository.findById failed: ${error.message}`);
    }

    return data as Conversation;
  }

  async findByUserId(
    userId: string,
    options: FindByUserIdOptions = {},
  ): Promise<Conversation[]> {
    const { limit = 50, offset = 0 } = options;

    const { data, error } = await supabaseAdmin
      .from(TABLES.CONVERSATIONS)
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw new Error(`ConversationRepository.findByUserId failed: ${error.message}`);
    }

    return (data as Conversation[]) ?? [];
  }

  async create(data: CreateConversationData): Promise<Conversation> {
    const { data: created, error } = await supabaseAdmin
      .from(TABLES.CONVERSATIONS)
      .insert(data)
      .select('*')
      .single();

    if (error) {
      throw new Error(`ConversationRepository.create failed: ${error.message}`);
    }

    return created as Conversation;
  }

  async update(id: string, data: UpdateConversationData): Promise<Conversation | null> {
    const { data: updated, error } = await supabaseAdmin
      .from(TABLES.CONVERSATIONS)
      .update(data)
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`ConversationRepository.update failed: ${error.message}`);
    }

    return updated as Conversation;
  }

  async delete(id: string): Promise<boolean> {
    const { error, count } = await supabaseAdmin
      .from(TABLES.CONVERSATIONS)
      .delete({ count: 'exact' })
      .eq('id', id);

    if (error) {
      throw new Error(`ConversationRepository.delete failed: ${error.message}`);
    }

    return (count ?? 0) > 0;
  }

  async countByUserId(userId: string): Promise<number> {
    const { count, error } = await supabaseAdmin
      .from(TABLES.CONVERSATIONS)
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    if (error) {
      throw new Error(`ConversationRepository.countByUserId failed: ${error.message}`);
    }

    return count ?? 0;
  }
}

export const conversationRepository = new ConversationRepository();
