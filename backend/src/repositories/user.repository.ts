import { supabaseAdmin } from '../db/client.js';
import { TABLES } from '../db/client.js';

export interface User {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export type CreateUserData = Pick<User, 'id' | 'email'> &
  Partial<Pick<User, 'display_name' | 'avatar_url'>>;

export type UpdateUserData = Partial<Omit<User, 'id' | 'created_at'>>;

export class UserRepository {
  async findById(id: string): Promise<User | null> {
    const { data, error } = await supabaseAdmin
      .from(TABLES.USERS)
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`UserRepository.findById failed: ${error.message}`);
    }

    return data as User;
  }

  async findByEmail(email: string): Promise<User | null> {
    const { data, error } = await supabaseAdmin
      .from(TABLES.USERS)
      .select('*')
      .eq('email', email)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`UserRepository.findByEmail failed: ${error.message}`);
    }

    return data as User;
  }

  async create(data: CreateUserData): Promise<User> {
    const { data: created, error } = await supabaseAdmin
      .from(TABLES.USERS)
      .insert(data)
      .select('*')
      .single();

    if (error) {
      throw new Error(`UserRepository.create failed: ${error.message}`);
    }

    return created as User;
  }

  async update(id: string, data: UpdateUserData): Promise<User | null> {
    const { data: updated, error } = await supabaseAdmin
      .from(TABLES.USERS)
      .update(data)
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`UserRepository.update failed: ${error.message}`);
    }

    return updated as User;
  }

  async delete(id: string): Promise<boolean> {
    const { error, count } = await supabaseAdmin
      .from(TABLES.USERS)
      .delete({ count: 'exact' })
      .eq('id', id);

    if (error) {
      throw new Error(`UserRepository.delete failed: ${error.message}`);
    }

    return (count ?? 0) > 0;
  }
}

export const userRepository = new UserRepository();
